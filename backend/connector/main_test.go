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

// Readiness gating for PairPhone: mocked readyFn, no code minted. A
// socket that comes up within the bound passes; one that never comes up
// fails with a bounded, honest error instead of "Connection Closed"
// surfacing from a premature PairPhone.
func TestWaitReadySucceedsWhenSocketComesUp(t *testing.T) {
	s := &server{}
	calls := 0
	sess := &session{readyFn: func() bool {
		calls++
		return calls >= 3
	}}
	if err := s.waitReady(sess, 2*time.Second); err != nil {
		t.Fatalf("waitReady failed despite socket coming up: %v", err)
	}
}

func TestWaitReadyTimesOutBounded(t *testing.T) {
	s := &server{}
	sess := &session{readyFn: func() bool { return false }}
	start := time.Now()
	err := s.waitReady(sess, 300*time.Millisecond)
	if err == nil {
		t.Fatalf("waitReady succeeded on a socket that never came up")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("waitReady overran its bound: %s", elapsed)
	}
}

func TestIsLoopbackAddr(t *testing.T) {
	for _, ok := range []string{"127.0.0.1:4100", "localhost:4100", "[::1]:4100"} {
		if !isLoopbackAddr(ok) {
			t.Fatalf("%s should be accepted as loopback", ok)
		}
	}
	for _, bad := range []string{"0.0.0.0:4100", ":4100", "192.168.1.5:4100", "example.com:4100", "not-an-addr"} {
		if isLoopbackAddr(bad) {
			t.Fatalf("%s must be rejected as non-loopback", bad)
		}
	}
}

// A stale socket's events must not mutate or emit for the id that has
// been taken over by a fresh session object.
func TestStaleSocketEventsIgnored(t *testing.T) {
	sink := newEventSink(t)
	s := newTestServer(sink)
	stale := newTestSession()
	stale.state = "pairing_code"
	stale.pairingCode = "DEAD0000"
	fresh := newTestSession()
	fresh.state = "connected"
	fresh.connected = true
	register(s, "t", fresh)

	s.handleEvents("t", stale)(&events.Disconnected{})

	if fresh.state != "connected" || !fresh.connected {
		t.Fatalf("stale event clobbered the live session: %q", fresh.state)
	}
	if stale.pairingCode != "DEAD0000" {
		t.Fatalf("stale session state should be untouched")
	}
	time.Sleep(50 * time.Millisecond)
	if sink.count("disconnected") != 0 {
		t.Fatalf("stale socket emitted an event")
	}
}
