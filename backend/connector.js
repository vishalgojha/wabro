// WhatsApp connector client: talks to the local whatsmeow sidecar
// (connector/, Go) over 127.0.0.1 HTTP and re-emits its webhook events on
// the same EventEmitter interface the rest of the backend already uses.
//
// The export keeps the historical `baileysConnector` name so routes and
// tests change as little as possible; the Baileys implementation is
// retired (library-level pairing failure, Baileys issue #2370) and lives
// untouched in baileys.js for reference only.
//
// Security contract:
//  - The sidecar binds 127.0.0.1 and requires a per-boot random token on
//    every call; this process generates the token and passes it to the
//    sidecar's environment at spawn. The token never touches logs or
//    responses.
//  - The /internal/connector/event webhook accepts only that token and
//    only loopback; it forwards events, never credentials.
//  - Pairing codes and QR payloads flow through to the session's owner
//    via existing routes but are never logged here either.
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONNECTOR_ADDR = process.env.CONNECTOR_ADDR || "127.0.0.1:4100";
const BASE = `http://${CONNECTOR_ADDR}`;
const BACKEND_PORT = process.env.PORT || "3002";

const MAX_RESPAWN_ATTEMPTS = 3;

class ConnectorClient extends EventEmitter {
  constructor() {
    super();
    this.token = randomBytes(24).toString("hex");
    this.sessions = new Map(); // sessionId -> cached state for status reads
    this.child = null;
    this.respawnAttempts = 0;
  }

  // Spawn the Go sidecar as a child process. Bounded respawn on crash;
  // after the budget is gone the failure is loud, never a silent loop.
  spawnSidecar() {
    if (process.env.CONNECTOR_SPAWN_DISABLED) return; // tests stub the client
    const bin = process.env.CONNECTOR_BIN || join(__dirname, "connector", "wabro-connector");
    const dataDir = process.env.CONNECTOR_DATA_DIR || join(__dirname, "..", "data", "connector");
    const launch = () => {
      this.child = spawn(bin, [], {
        env: {
          ...process.env,
          CONNECTOR_TOKEN: this.token,
          CONNECTOR_ADDR,
          CONNECTOR_DATA_DIR: dataDir,
          BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
        },
        stdio: ["ignore", "inherit", "inherit"],
      });
      this.child.on("exit", (code) => {
        this.child = null;
        if (this.respawnAttempts >= MAX_RESPAWN_ATTEMPTS) {
          console.error(`[connector] sidecar exited (code ${code}); respawn budget exhausted, not restarting`);
          return;
        }
        this.respawnAttempts += 1;
        const delay = Math.min(1000 * 2 ** this.respawnAttempts, 8000);
        console.warn(`[connector] sidecar exited (code ${code}); bounded respawn ${this.respawnAttempts}/${MAX_RESPAWN_ATTEMPTS}`);
        setTimeout(launch, delay).unref?.();
      });
    };
    launch();
  }

  async call(method, path, body) {
    const resp = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Connector-Token": this.token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `connector ${resp.status}`);
    }
    return data;
  }

  // ---- session lifecycle ---------------------------------------------------

  async startSession(sessionId, { pairingPhone } = {}) {
    const data = await this.call("POST", `/sessions/${sessionId}/start`);
    this.ensureCached(sessionId).state = data.state || "connecting";
    if (pairingPhone) {
      // PairPhone needs the socket up; the sidecar rejects a closed one
      // and the error surfaces as a session error event, same as before.
      setTimeout(() => {
        this.requestPairingCode(sessionId, pairingPhone).catch((err) => {
          this.emit(`error:${sessionId}`, `Pairing code request failed: ${err.message}`);
        });
      }, 1500).unref?.();
    }
    return sessionId;
  }

  async requestPairingCode(sessionId, phone) {
    const normalized = String(phone).replace(/\D/g, "");
    const data = await this.call("POST", `/sessions/${sessionId}/pair-code`, { phone: normalized });
    const sess = this.ensureCached(sessionId);
    sess.pairingCode = data.code;
    sess.pairingCodeIssuedAt = data.issuedAt;
    sess.state = "pairing_code";
    this.emit(`pairing_code:${sessionId}`, data.code);
    return data.code;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  ensureCached(sessionId) {
    let sess = this.sessions.get(sessionId);
    if (!sess) {
      sess = {
        state: "connecting",
        qr: null,
        pairingCode: null,
        pairingCodeIssuedAt: null,
        connected: false,
        groups: [],
      };
      this.sessions.set(sessionId, sess);
    }
    return sess;
  }

  async disconnect(sessionId) {
    await this.call("POST", `/sessions/${sessionId}/disconnect`).catch(() => {});
    // Defensive parity with the retired Baileys client: when a session
    // object carries a live socket handle (tests, or a future in-process
    // transport), closing it here keeps "disconnect closes the socket"
    // true at this interface.
    const session = this.sessions.get(sessionId);
    try {
      session?.sock?.ws?.close();
    } catch {}
    this.sessions.delete(sessionId);
  }

  async logout(sessionId) {
    await this.call("POST", `/sessions/${sessionId}/logout`).catch(() => {});
    const session = this.sessions.get(sessionId);
    try {
      session?.sock?.ws?.close();
      await session?.sock?.logout();
    } catch {}
    this.sessions.delete(sessionId);
  }

  // ---- data + sends --------------------------------------------------------

  async fetchGroups(sessionId) {
    const data = await this.call("GET", `/sessions/${sessionId}/groups`);
    const sess = this.ensureCached(sessionId);
    sess.groups = (data.groups || []).map((name) => ({ subject: name }));
    return sess.groups;
  }

  async sendMessage(sessionId, chatId, text) {
    const data = await this.call("POST", `/sessions/${sessionId}/send-text`, { to: chatId, text });
    return { key: { id: data.messageId } };
  }

  async sendDocument(sessionId, chatId, url, fileName) {
    const data = await this.call("POST", `/sessions/${sessionId}/send-document`, {
      to: chatId,
      url,
      fileName,
    });
    return { key: { id: data.messageId } };
  }

  // Profile edits route through the same approval-gated paths as before.
  async setProfileName() {
    throw new Error("Profile name changes are not supported by the connector");
  }

  async setProfileStatus() {
    throw new Error("Profile status changes are not supported by the connector");
  }

  // whatsmeow resolves LID identities natively; when the sender arrives as
  // a phone JID already there is nothing to do. Kept for call-site parity.
  async resolvePhoneFromLid(sessionId, chatId) {
    if (!chatId || !chatId.endsWith("@lid")) return null;
    // The webhook already sends both chat and sender identifiers; a bare
    // @lid without a phone sender stays unresolved, same honest contract.
    return null;
  }

  // ---- webhook intake --------------------------------------------------------

  // Mounted at /internal/connector/event. Loopback + token only; anything
  // else gets a bare 404 so the endpoint's existence is not advertised.
  handleWebhook(req, res) {
    const tokenOk = req.headers["x-connector-token"] === this.token;
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    if (!tokenOk || !loopback) {
      return res.status(404).json({ error: "not found" });
    }
    const { sessionId, type, ...payload } = req.body || {};
    if (!sessionId || !type) {
      return res.status(400).json({ error: "bad event" });
    }
    // Terminal events for a session we no longer hold must not resurrect a
    // cache entry (stale socket events belong to a dead attempt).
    if (["disconnected", "logged_out", "error"].includes(type) && !this.sessions.has(sessionId)) {
      return res.json({ ok: true });
    }
    const sess = this.ensureCached(sessionId);
    switch (type) {
      case "qr":
        sess.qr = payload.qr;
        sess.state = "qr";
        this.emit(`qr:${sessionId}`, payload.qr);
        break;
      case "connected":
        sess.state = "connected";
        sess.connected = true;
        sess.qr = null;
        sess.pairingCode = null;
        sess.pairingCodeIssuedAt = null;
        this.emit(`connected:${sessionId}`);
        this.fetchGroups(sessionId)
          .then((groups) => this.emit(`groups:${sessionId}`, groups))
          .catch((err) => this.emit(`error:${sessionId}`, err.message));
        break;
      case "disconnected":
        sess.state = "disconnected";
        sess.connected = false;
        sess.pairingCode = null;
        sess.pairingCodeIssuedAt = null;
        sess.qr = null;
        this.emit(`disconnected:${sessionId}`, { reason: payload.reason ?? null });
        break;
      case "logged_out":
        sess.state = "logged_out";
        sess.connected = false;
        this.sessions.delete(sessionId);
        this.emit(`logged_out:${sessionId}`);
        break;
      case "error":
        this.emit(`error:${sessionId}`, payload.message || "Connector error");
        break;
      case "message":
        this.emit("message:all", {
          sessionId,
          chatId: payload.sender || payload.chatId,
          body: payload.body || "",
          fromMe: !!payload.fromMe,
        });
        break;
      case "message.ack":
        this.emit(`message.ack:${sessionId}`, {
          messageId: payload.messageId,
          chatId: payload.chatId,
          status: payload.status,
        });
        break;
      default:
        break;
    }
    return res.json({ ok: true });
  }
}

export const baileysConnector = new ConnectorClient();
export const DEFAULT_SESSION_ID = "default";
// The whatsmeow store lives under this dir (one sqlite db per session).
export const CONNECTOR_DATA_DIR =
  process.env.CONNECTOR_DATA_DIR || join(__dirname, "data", "connector");
