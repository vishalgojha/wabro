// WaBro connector: whatsmeow-backed WhatsApp session service.
//
// Local-only HTTP sidecar for the Express backend. Binds 127.0.0.1 and
// requires a shared token on every call. It owns the WhatsApp socket
// lifecycle; Express keeps the UI, auth, approval gates and batch logic.
// Pairing codes, QR payloads and credentials are never logged.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	_ "modernc.org/sqlite"
)

type session struct {
	mu             sync.Mutex
	client         *whatsmeow.Client
	readyFn        func() bool // websocket readiness; client.IsConnected in production
	state          string // connecting|qr|pairing_code|connected|disconnected|logged_out
	qr             string
	pairingCode    string
	pairingIssued  time.Time
	connected      bool
	cancel         context.CancelFunc
}

type server struct {
	mu        sync.Mutex
	sessions  map[string]*session
	token     string
	dataDir   string
	backend   string
	httpc     *http.Client
}

func (s *server) webhook(payload map[string]any) {
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", s.backend+"/internal/connector/event", nil)
	if err != nil {
		return
	}
	req.Body = io.NopCloser(bytesReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Connector-Token", s.token)
	resp, err := s.httpc.Do(req)
	if err != nil {
		log.Printf("[connector] webhook delivery failed (type %v): %v", payload["type"], err)
		return
	}
	resp.Body.Close()
}

type byteReader struct {
	b   []byte
	off int
}

func bytesReader(b []byte) io.Reader { return &byteReader{b: b} }
func (r *byteReader) Read(p []byte) (int, error) {
	if r.off >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.off:])
	r.off += n
	return n, nil
}

func (s *server) emit(sessionID, typ string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	data["sessionId"] = sessionID
	data["type"] = typ
	go s.webhook(data)
}

func (s *server) handleEvents(sessionID string, sess *session) func(interface{}) {
	return func(evt interface{}) {
		// Stale-socket guard: if this session object was replaced under the
		// same id (fresh linking attempt), events from the old socket must
		// not mutate or emit anything.
		s.mu.Lock()
		current := s.sessions[sessionID]
		s.mu.Unlock()
		if current != sess {
			return
		}
		switch v := evt.(type) {
		case *events.Connected:
			sess.mu.Lock()
			sess.state = "connected"
			sess.connected = true
			sess.qr = ""
			sess.pairingCode = ""
			sess.mu.Unlock()
			s.emit(sessionID, "connected", nil)
		case *events.Disconnected:
			sess.mu.Lock()
			sess.state = "disconnected"
			sess.connected = false
			// A pairing code or QR is bound to the live socket; once the
			// connection drops it can never complete. Clear it so the UI
			// never shows a dead artifact as valid.
			sess.pairingCode = ""
			sess.qr = ""
			sess.mu.Unlock()
			s.emit(sessionID, "disconnected", nil)
		case *events.LoggedOut:
			sess.mu.Lock()
			sess.state = "logged_out"
			sess.connected = false
			sess.pairingCode = ""
			sess.qr = ""
			sess.mu.Unlock()
			s.emit(sessionID, "logged_out", map[string]any{"reason": v.Reason.String()})
		case *events.StreamReplaced:
			// Another instance took over these credentials. Never
			// reconnect: the live socket belongs to someone else now.
			sess.mu.Lock()
			sess.state = "disconnected"
			sess.connected = false
			sess.pairingCode = ""
			sess.qr = ""
			sess.mu.Unlock()
			if sess.client != nil {
				sess.client.Disconnect()
			}
			s.emit(sessionID, "disconnected", map[string]any{"reason": "replaced"})
		case *events.PairError:
			sess.mu.Lock()
			sess.state = "disconnected"
			sess.pairingCode = ""
			sess.mu.Unlock()
			s.emit(sessionID, "error", map[string]any{"message": "Pairing failed on WhatsApp's side. Tap Restart linking for a fresh code."})
		case *events.PairSuccess:
			// Registration completes after PairSuccess + Connected; state
			// is advanced by the Connected event.
			log.Printf("[connector] session %s pair success", sessionID)
		case *events.Message:
			if v.Info.IsFromMe {
				return
			}
			text := v.Message.GetConversation()
			if text == "" {
				text = v.Message.GetExtendedTextMessage().GetText()
			}
			s.emit(sessionID, "message", map[string]any{
				"chatId": v.Info.Chat.String(),
				"sender": v.Info.Sender.String(),
				"body":   text,
				"fromMe": false,
			})
		case *events.Receipt:
			status := 0
			switch v.Type {
			case types.ReceiptTypeDelivered:
				status = 3
			case types.ReceiptTypeRead, types.ReceiptTypeReadSelf:
				status = 4
			}
			if status == 0 {
				return
			}
			for _, mid := range v.MessageIDs {
				s.emit(sessionID, "message.ack", map[string]any{
					"messageId": mid,
					"chatId":    v.Chat.String(),
					"status":    status,
				})
			}
		}
	}
}

func (s *server) startSession(sessionID string) (*session, error) {
	s.mu.Lock()
	if existing, ok := s.sessions[sessionID]; ok {
		s.mu.Unlock()
		return existing, nil
	}
	s.mu.Unlock()

	dbPath := filepath.Join(s.dataDir, sessionID, "whatsmeow.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, err
	}
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", dbPath)
	container, err := sqlstore.New(ctx, "sqlite", dsn, waLog.Noop)
	if err != nil {
		return nil, err
	}
	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		return nil, err
	}
	client := whatsmeow.NewClient(device, waLog.Noop)

	sess := &session{client: client, state: "connecting", readyFn: client.IsConnected}
	client.AddEventHandler(s.handleEvents(sessionID, sess))

	// QR codes only flow through a channel grabbed before Connect, and only
	// for a never-registered device.
	var qrChan <-chan whatsmeow.QRChannelItem
	if client.Store.ID == nil {
		qrChan, _ = client.GetQRChannel(context.Background())
	}
	if err := client.Connect(); err != nil {
		return nil, err
	}
	if qrChan != nil {
		go func() {
			for item := range qrChan {
				switch item.Event {
				case whatsmeow.QRChannelEventCode:
					sess.mu.Lock()
					sess.qr = item.Code
					sess.state = "qr"
					sess.mu.Unlock()
					s.emit(sessionID, "qr", map[string]any{"qr": item.Code})
				case "timeout":
					sess.mu.Lock()
					if sess.state == "qr" {
						sess.state = "disconnected"
						sess.qr = ""
					}
					sess.mu.Unlock()
					s.emit(sessionID, "disconnected", nil)
				}
			}
		}()
	}

	s.mu.Lock()
	s.sessions[sessionID] = sess
	s.mu.Unlock()
	return sess, nil
}

// waitReady blocks until the websocket is actually up (IsConnected is
// true once the handshake completes, which precedes pairing) or the bound
// expires. This replaces any caller-side fixed sleep: a PairPhone issued
// before the socket is ready is what produced "Connection Closed".
func (s *server) waitReady(sess *session, bound time.Duration) error {
	deadline := time.Now().Add(bound)
	for {
		if sess.readyFn() {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("Connection Closed: socket not ready after %s", bound)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func (s *server) pairCode(sess *session, phone string) (string, error) {
	if err := s.waitReady(sess, 10*time.Second); err != nil {
		return "", err
	}
	code, err := sess.client.PairPhone(context.Background(), phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		return "", err
	}
	sess.mu.Lock()
	sess.pairingCode = code
	sess.pairingIssued = time.Now()
	sess.state = "pairing_code"
	sess.mu.Unlock()
	return code, nil
}

// ---- HTTP layer -----------------------------------------------------------

func (s *server) auth(r *http.Request) bool {
	return r.Header.Get("X-Connector-Token") == s.token
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func (s *server) getSession(r *http.Request) (*session, bool) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	return sess, ok
}

func (s *server) routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /sessions/{id}/start", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, err := s.startSession(r.PathValue("id"))
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]string{"state": sess.state})
	})

	mux.HandleFunc("POST /sessions/{id}/pair-code", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok {
			writeJSON(w, 404, map[string]string{"error": "session not found"})
			return
		}
		var body struct {
			Phone string `json:"phone"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Phone == "" {
			writeJSON(w, 400, map[string]string{"error": "phone required"})
			return
		}
		code, err := s.pairCode(sess, body.Phone)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"code": code, "issuedAt": sess.pairingIssued.UnixMilli()})
	})

	mux.HandleFunc("GET /sessions/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok {
			writeJSON(w, 404, map[string]string{"error": "session not found"})
			return
		}
		sess.mu.Lock()
		defer sess.mu.Unlock()
		out := map[string]any{
			"sessionId":  r.PathValue("id"),
			"state":      sess.state,
			"connected":  sess.connected,
			"registered": sess.client.Store.ID != nil,
		}
		if sess.pairingCode != "" {
			out["pairingCode"] = sess.pairingCode
			out["pairingCodeIssuedAt"] = sess.pairingIssued.UnixMilli()
		}
		writeJSON(w, 200, out)
	})

	mux.HandleFunc("POST /sessions/{id}/disconnect", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok {
			writeJSON(w, 200, map[string]bool{"ok": true})
			return
		}
		sess.client.Disconnect()
		s.mu.Lock()
		delete(s.sessions, r.PathValue("id"))
		s.mu.Unlock()
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /sessions/{id}/logout", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if ok {
			if err := sess.client.Logout(context.Background()); err != nil {
				log.Printf("[connector] session %s logout error: %v", r.PathValue("id"), err)
			}
			sess.client.Disconnect()
			s.mu.Lock()
			delete(s.sessions, r.PathValue("id"))
			s.mu.Unlock()
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("GET /sessions/{id}/groups", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok {
			writeJSON(w, 404, map[string]string{"error": "session not found"})
			return
		}
		groups, err := sess.client.GetJoinedGroups(r.Context())
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		names := make([]string, 0, len(groups))
		for _, g := range groups {
			names = append(names, g.Name)
		}
		writeJSON(w, 200, map[string]any{"groups": names, "count": len(names)})
	})

	mux.HandleFunc("POST /sessions/{id}/profile-status", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok || !sess.client.IsConnected() {
			writeJSON(w, 409, map[string]string{"error": "session not connected"})
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Status == "" {
			writeJSON(w, 400, map[string]string{"error": "status required"})
			return
		}
		if err := sess.client.SetStatusMessage(r.Context(), types.SetStatusInput{Text: &body.Status}); err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /sessions/{id}/send-text", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok || !sess.client.IsConnected() {
			writeJSON(w, 409, map[string]string{"error": "session not connected"})
			return
		}
		var body struct {
			To   string `json:"to"`
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.To == "" || body.Text == "" {
			writeJSON(w, 400, map[string]string{"error": "to and text required"})
			return
		}
		to, err := parseJID(body.To)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": "bad recipient id"})
			return
		}
		resp, err := sess.client.SendMessage(r.Context(), to, &waE2E.Message{
			Conversation: proto.String(body.Text),
		})
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"messageId": string(resp.ID)})
	})

	mux.HandleFunc("POST /sessions/{id}/send-document", func(w http.ResponseWriter, r *http.Request) {
		if !s.auth(r) {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		sess, ok := s.getSession(r)
		if !ok || !sess.client.IsConnected() {
			writeJSON(w, 409, map[string]string{"error": "session not connected"})
			return
		}
		var body struct {
			To       string `json:"to"`
			URL      string `json:"url"`
			FileName string `json:"fileName"`
			Caption  string `json:"caption"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.To == "" || body.URL == "" {
			writeJSON(w, 400, map[string]string{"error": "to and url required"})
			return
		}
		data, mime, err := fetchDocument(body.URL)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "document download failed"})
			return
		}
		up, err := sess.client.Upload(r.Context(), data, whatsmeow.MediaDocument)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		doc := &waE2E.DocumentMessage{
			URL:           proto.String(up.URL),
			DirectPath:    proto.String(up.DirectPath),
			MediaKey:      up.MediaKey,
			FileEncSHA256: up.FileEncSHA256,
			FileSHA256:    up.FileSHA256,
			FileLength:    proto.Uint64(up.FileLength),
			Mimetype:      proto.String(mime),
		}
		if body.FileName != "" {
			doc.FileName = proto.String(body.FileName)
		}
		if body.Caption != "" {
			doc.Caption = proto.String(body.Caption)
		}
		to, err := parseJID(body.To)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": "bad recipient id"})
			return
		}
		resp, err := sess.client.SendMessage(r.Context(), to, &waE2E.Message{DocumentMessage: doc})
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"messageId": string(resp.ID)})
	})

	return mux
}


func isLoopbackAddr(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func parseJID(s string) (types.JID, error) {
	return types.ParseJID(s)
}

func fetchDocument(url string) ([]byte, string, error) {
	resp, err := http.Get(url) // operator-supplied URL, same trust as the existing Node path
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, "", fmt.Errorf("download status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, "", err
	}
	mime := resp.Header.Get("Content-Type")
	if mime == "" {
		mime = "application/octet-stream"
	}
	return data, mime, nil
}

func main() {
	token := os.Getenv("CONNECTOR_TOKEN")
	if token == "" {
		log.Fatal("CONNECTOR_TOKEN required")
	}
	dataDir := os.Getenv("CONNECTOR_DATA_DIR")
	if dataDir == "" {
		dataDir = "data/connector"
	}
	backend := os.Getenv("BACKEND_URL")
	if backend == "" {
		backend = "http://127.0.0.1:3002"
	}
	s := &server{
		sessions: map[string]*session{},
		token:    token,
		dataDir:  dataDir,
		backend:  backend,
		httpc:    &http.Client{Timeout: 10 * time.Second},
	}
	addr := os.Getenv("CONNECTOR_ADDR")
	if addr == "" {
		addr = "127.0.0.1:4100"
	}
	if !isLoopbackAddr(addr) {
		log.Fatal("CONNECTOR_ADDR must bind a loopback address; the connector is never exposed off-host")
	}
	log.Printf("[connector] listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, s.routes()))
}
