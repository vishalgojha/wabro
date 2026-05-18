import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "auth");

class BaileysConnector extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
  }

  async startSession(sessionId) {
    const sessionDir = join(AUTH_DIR, sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "warn" }),
      browser: ["WaBro Onboard", "Chrome", "1.0.0"],
      syncFullHistory: false,
      qrTimeout: 120_000,
    });

    const session = { sock, saveCreds, state: "connecting", qr: null, connected: false, groups: [] };
    this.sessions.set(sessionId, session);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.qr = qr;
        session.state = "qr";
        this.emit(`qr:${sessionId}`, qr);
      }

      if (connection === "open") {
        session.state = "connected";
        session.connected = true;
        session.qr = null;
        this.emit(`connected:${sessionId}`);

        try {
          await this.fetchGroups(sessionId);
        } catch (err) {
          this.emit(`error:${sessionId}`, err.message);
        }
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          session.state = "logged_out";
          this.emit(`logged_out:${sessionId}`);
          this.sessions.delete(sessionId);
          return;
        }
        // reconnecting handled by baileys internally
        session.state = "reconnecting";
        this.emit(`reconnecting:${sessionId}`);
      }
    });

    sock.ev.on("creds.update", saveCreds);

    return sessionId;
  }

  async fetchGroups(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) return;

    const { sock } = session;

    try {
      const groups = await sock.groupFetchAllParticipating();
      const entries = Object.entries(groups).map(([jid, meta]) => ({
        jid,
        subject: meta.subject || "",
        participants: (meta.participants || []).map((p) => ({
          phone: p.id.split("@")[0],
          name: p.name || p.notify || p.verifiedName || "",
          admin: p.admin || false,
        })),
        size: meta.participants?.length || 0,
      }));

      session.groups = entries;
      session.state = "groups_fetched";
      this.emit(`groups:${sessionId}`, entries);
    } catch (err) {
      this.emit(`error:${sessionId}`, `Failed to fetch groups: ${err.message}`);
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async cleanup(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.sock?.ws?.close();
        await session.sock?.logout();
      } catch {}
      this.sessions.delete(sessionId);
    }
  }
}

export const baileysConnector = new BaileysConnector();
