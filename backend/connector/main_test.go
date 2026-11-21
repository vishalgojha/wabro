// Lifecycle-semantics tests for the connector's event handling. These keep
// the deployed truthful-state guarantees alive in the new stack: a dead
// pairing code or QR is never presented as valid, stream replacement never
// reconnects, and states never pretend to be something they are not.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type capturedEvent struct {
	SessionID string         `json:"sessionId"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"-"`
	Raw       map[string]any
}

type eventSink struct {
	mu     sync.Mutex
	events []map[string]any
	srv    *httptest.Server
}

func newEventSink(t *testing.T) *eventSink {
	sink := &eventSink{}
	sink.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			sink.mu.Lock()
			sink.events = append(sink.events, body)
			sink.mu.Unlock()
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(sink.srv.Close)
	return sink
}

func (sink *eventSink) waitFor(t *testing.T, typ string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		sink.mu.Lock()
		for _, e := range sink.events {
			if e["type"] == typ {
				sink.mu.Unlock()
				return e
			}
		}
		sink.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("event %q never arrived", typ)
	return nil
}

func (sink *eventSink) count(typ string) int {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	n := 0
	for _, e := range sink.events {
		if e["type"] == typ {
			n++
		}
	}
	return n
}

func newTestServer(sink *eventSink) *server {
	return &server{
		sessions: map[string]*session{},
		token:    "test-token",
		backend:  sink.srv.URL,
		httpc:    &http.Client{Timeout: 2 * time.Second},
	}
}

func newTestSession() *session {
	// No live client: event application is what is under test.
	return &session{}
}

func register(s *server, id string, sess *session) {
	s.sessions[id] = sess
}

func TestDisconnectedClearsDeadPairingArtifacts(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	sess.state = "pairing_code"
	sess.pairingCode = "ABCD1234"
	sess.qr = "qr-payload"

	s.handleEvents("t", sess)(&events.Disconnected{})

	if sess.pairingCode != "" || sess.qr != "" {
		t.Fatalf("dead artifacts not cleared: code=%q qr=%q", sess.pairingCode, sess.qr)
	}
	if sess.state != "disconnected" || sess.connected {
		t.Fatalf("state not truthful: %q connected=%v", sess.state, sess.connected)
	}
	e := sink.waitFor(t, "disconnected")
	if e["sessionId"] != "t" {
		t.Fatalf("wrong sessionId in event: %v", e["sessionId"])
	}
}

func TestPairErrorIsTruthfulDisconnected(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	sess.state = "pairing_code"
	sess.pairingCode = "ABCD1234"

	s.handleEvents("t", sess)(&events.PairError{})

	if sess.pairingCode != "" {
		t.Fatalf("stale code kept after pair error")
	}
	if sess.state != "disconnected" {
		t.Fatalf("pair error state = %q, want disconnected (no fake reconnecting)", sess.state)
	}
	sink.waitFor(t, "error")
}

func TestLoggedOutClearsEverything(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	sess.state = "connected"
	sess.connected = true
	sess.pairingCode = "ABCD1234"
	sess.qr = "qr"

	s.handleEvents("t", sess)(&events.LoggedOut{})

	if sess.state != "logged_out" || sess.connected {
		t.Fatalf("logged out state wrong: %q connected=%v", sess.state, sess.connected)
	}
	if sess.pairingCode != "" || sess.qr != "" {
		t.Fatalf("artifacts kept after logout")
	}
	sink.waitFor(t, "logged_out")
}

func TestStreamReplacedDisconnectsWithoutReconnect(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	sess.state = "connected"
	sess.connected = true

	s.handleEvents("t", sess)(&events.StreamReplaced{})

	if sess.state != "disconnected" || sess.connected {
		t.Fatalf("stream replaced state wrong: %q connected=%v", sess.state, sess.connected)
	}
	e := sink.waitFor(t, "disconnected")
	if e["reason"] != "replaced" {
		t.Fatalf("missing replaced reason: %v", e)
	}
}

func TestIncomingMessageForwardedFromMeDropped(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	handler := s.handleEvents("t", sess)

	chat := types.NewJID("919999900001", types.DefaultUserServer)
	sender := types.NewJID("919999900001", types.DefaultUserServer)

	handler(&events.Message{
		Info:    types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsFromMe: true}},
		Message: &waE2E.Message{Conversation: proto.String("stop")},
	})
	time.Sleep(50 * time.Millisecond)
	if sink.count("message") != 0 {
		t.Fatalf("fromMe message forwarded")
	}

	handler(&events.Message{
		Info:    types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsFromMe: false}},
		Message: &waE2E.Message{Conversation: proto.String("stop")},
	})
	e := sink.waitFor(t, "message")
	if e["body"] != "stop" {
		t.Fatalf("body mismatch: %v", e["body"])
	}
}

func TestReceiptAckStatusMapping(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	sess := newTestSession()
	register(s, "t", sess)
	handler := s.handleEvents("t", sess)

	handler(&events.Receipt{
		Type:       types.ReceiptTypeDelivered,
		MessageIDs: []types.MessageID{"M1"},
	})
	e := sink.waitFor(t, "message.ack")
	if e["status"] != float64(3) {
		t.Fatalf("delivered status = %v, want 3", e["status"])
	}
}
