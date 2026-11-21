import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = join(__dirname, "auth");

// One stable linked device per deployment. The auth state for this id is
// persisted under AUTH_DIR and restored on boot, so a container restart
// never mints a new WhatsApp device link.
export const DEFAULT_SESSION_ID = "default";

const PRESENCE_AUTO_ONLINE_DURATION = 30_000; // 30 seconds

// Bounded reconnects for a REGISTERED session whose socket closed
// (WhatsApp's 515 restartRequired after a successful phone-side pairing is
// one such close). Never applies to never-registered sessions: re-minting a
// pairing code is always an explicit user action.
const MAX_RECONNECT_ATTEMPTS = 3;

class BaileysConnector extends EventEmitter {
  reconnectAttempts = new Map();

  constructor() {
    super();
    this.sessions = new Map();
    this.presenceTimeouts = new Map();
  }

  async startSession(sessionId, opts = {}) {
    const sessionDir = join(AUTH_DIR, sessionId);
    const pairingPhone = opts.pairingPhone
      ? String(opts.pairingPhone).replace(/\D/g, "")
      : null;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "warn" }),
      browser: ["WaBro Onboard", "Chrome", "1.0.0"],
      syncFullHistory: false,
      qrTimeout: 120_000,
    });

    const session = {
      sock,
      saveCreds,
      state: "connecting",
      qr: null,
      pairingCode: null,
      pairingCodeIssuedAt: null,
      connected: false,
      groups: [],
      presence: "unavailable",
      reconnectTimer: null,
    };
    this.sessions.set(sessionId, session);

    // Code-based linking (user's chosen method over QR): request WhatsApp's
    // 8-character pairing code once the socket can answer. Only for a
    // never-registered session; errors surface as session error events.
    if (pairingPhone && !state.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(pairingPhone);
          session.pairingCode = code;
          session.pairingCodeIssuedAt = Date.now();
          session.state = "pairing_code";
          this.emit(`pairing_code:${sessionId}`, code);
        } catch (err) {
          this.emit(`error:${sessionId}`, `Pairing code request failed: ${err.message}`);
        }
      }, 3000);
    }

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
        this.reconnectAttempts.delete(sessionId);
        this.emit(`connected:${sessionId}`);

        try {
          await this.fetchGroups(sessionId);
        } catch (err) {
          this.emit(`error:${sessionId}`, err.message);
        }
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        this.cleanupPresenceTimeout(sessionId);
        if (reason === DisconnectReason.loggedOut) {
          session.state = "logged_out";
          this.emit(`logged_out:${sessionId}`);
          this.sessions.delete(sessionId);
          // The link is dead: drop stored creds so the next start mints a
          // fresh QR instead of restoring a logged-out device.
          rmSync(sessionDir, { recursive: true, force: true });
          return;
        }
        this.handleConnectionClose(sessionId, session, state, reason);
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (update.update.status) {
          // status 3 = delivered, 4 = read
          this.emit(`message.ack:${sessionId}`, {
            messageId: update.key.id,
            chatId: update.key.remoteJid,
            status: update.update.status,
          });
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        const chatId = msg.key.remoteJid;
        const body =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.buttonsResponseMessage?.selectedButtonId ||
          msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage
            ?.paramsJson;

        let buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId;

        // Handle Native Flow (Interactive) Buttons
        if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(
              msg.message.interactiveResponseMessage.nativeFlowResponseMessage
                .paramsJson
            );
            buttonId = params.id;
          } catch {}
        }

        this.emit(`message:${sessionId}`, {
          chatId,
          body,
          buttonId,
          pushName: msg.pushName,
          fromMe: msg.key.fromMe,
        });
      }
    });

    return sessionId;
  }

  async maintainPresenceOnline(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) return;

    // If not ONLINE yet, send ONLINE
    if (session.presence !== "available") {
      try {
        session.presence = "available";
        await session.sock.sendPresenceUpdate("available");
      } catch (err) {
        console.error(`Failed to set presence ONLINE for ${sessionId}`, err);
        return;
      }
    }

    // Reset timeout
    this.cleanupPresenceTimeout(sessionId);

    const timeout = setTimeout(async () => {
      try {
        const currentSession = this.sessions.get(sessionId);
        if (currentSession && currentSession.connected) {
          await currentSession.sock.sendPresenceUpdate("unavailable");
          currentSession.presence = "unavailable";
        }
      } catch (err) {
        console.error(`Failed to set presence OFFLINE for ${sessionId}`, err);
      }
    }, PRESENCE_AUTO_ONLINE_DURATION);

    this.presenceTimeouts.set(sessionId, timeout);
  }

  cleanupPresenceTimeout(sessionId) {
    const timeout = this.presenceTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.presenceTimeouts.delete(sessionId);
    }
  }

  async fetchGroups(sessionId) {
    await this.maintainPresenceOnline(sessionId);
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

  async sendMessage(sessionId, chatId, text) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }

    return await session.sock.sendMessage(chatId, { text });
  }

  async sendDocument(sessionId, chatId, url, fileName) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }

    return await session.sock.sendMessage(chatId, {
      document: { url: url },
      fileName: fileName,
      mimetype: "application/pdf",
    });
  }

  async sendListing(sessionId, chatId, listing) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }

    const { title, body, footer, buttons } = listing;

    // WA Interactive Message (Native Flow)
    const message = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: { title: title },
            body: { text: body },
            footer: { text: footer },
            nativeFlowMessage: {
              buttons: buttons.map((b) => ({
                name: b.type === "url" ? "cta_url" : "quick_reply",
                buttonParamsJson: JSON.stringify(
                  b.type === "url"
                    ? { display_text: b.text, url: b.url, merchant_url: b.url }
                    : { display_text: b.text, id: b.id }
                ),
              })),
            },
          },
        },
      },
    };

    return await session.sock.sendMessage(chatId, message);
  }

  async sendStatus(sessionId, status) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }

    const { text, image, contacts } = status;
    const jid = "status@broadcast";

    // If no contacts provided, we'll need to fetch them from some source
    // For now, assume contacts is a list of JIDs.
    // In Baileys, status message requires statusJidList in options.
    const options = {
      statusJidList: contacts || [],
    };

    let content;
    if (image) {
      content = {
        image: { url: image },
        caption: text,
      };
    } else {
      content = {
        text: text,
      };
    }

    return await session.sock.sendMessage(jid, content, options);
  }

  async setProfileName(sessionId, name) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }
    return await session.sock.updateProfileName(name);
  }

  async setProfileStatus(sessionId, status) {
    await this.maintainPresenceOnline(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error("Session not connected");
    }
    return await session.sock.updateProfileStatus(status);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  // Resolve a lid-addressed DM (newer WhatsApp addressing) to a phone number
  // through the library's own lid->PN mapping. Returns null when the mapping
  // is unavailable or unknown: callers must treat that as unresolved, never
  // as "no opt-out".
  async resolvePhoneFromLid(sessionId, lidChatId) {
    const session = this.sessions.get(sessionId);
    const lidUser = String(lidChatId).split("@")[0].split(":")[0];
    try {
      const mapping = session?.sock?.signalRepository?.lidMapping;
      if (!mapping || typeof mapping.getPNForLID !== "function") return null;
      const pn = await mapping.getPNForLID(lidUser);
      const num = typeof pn === "string" ? pn.split("@")[0].split(":")[0] : null;
      return num && /^\d+$/.test(num) ? num : null;
    } catch {
      return null;
    }
  }

  // Request a pairing code on an existing, still-unpaired session.
  // A previous (possibly expired) code is overwritten: an explicit
  // re-request is how an expired code is recovered.
  async requestPairingCode(sessionId, phone) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.connected) throw new Error("Session already linked");
    const normalized = String(phone || "").replace(/\D/g, "");
    if (normalized.length < 10) throw new Error("phone with country code is required");
    const code = await session.sock.requestPairingCode(normalized);
    session.pairingCode = code;
    session.pairingCodeIssuedAt = Date.now();
    session.state = "pairing_code";
    this.emit(`pairing_code:${sessionId}`, code);
    return code;
  }

  // A socket closed without logout. Baileys does NOT reconnect by itself,
  // so the old behavior ("reconnecting handled internally") left every
  // session permanently dead after its first close while claiming to
  // reconnect. Rules:
  //  - A pairing code is bound to the socket that minted it: once the
  //    socket closes the code can never complete, so it is cleared
  //    immediately and the UI is told, instead of showing a dead code.
  //  - A REGISTERED session reconnects from its saved creds, bounded
  //    (this is also the path that finishes a good pairing: WhatsApp
  //    closes with 515 after the phone accepts the code). Codes are
  //    never auto-reminted behind the user.
  //  - A never-registered session (mid-pairing) gets a truthful
  //    "disconnected"; only an explicit user restart requests a new code.
  handleConnectionClose(sessionId, session, authState, reason) {
    // Ignore events from a stale socket after a fresh start replaced it.
    if (this.sessions.get(sessionId) !== session) return;
    if (session.pairingCode) {
      session.pairingCode = null;
      session.pairingCodeIssuedAt = null;
    }
    if (reason === DisconnectReason.connectionReplaced) {
      // Another live instance owns this session; never fight it.
      session.state = "disconnected";
      console.warn(`[wabro] session ${sessionId} closed: connection replaced; not reconnecting`);
      this.emit(`disconnected:${sessionId}`, { reason: reason ?? null });
      return;
    }
    const wasRegistered = !!authState?.creds?.registered;
    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    if (wasRegistered && attempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(sessionId, attempts + 1);
      session.state = "reconnecting";
      this.emit(`reconnecting:${sessionId}`);
      const delay = Math.min(1000 * 2 ** (attempts + 1), 15000);
      console.warn(`[wabro] session ${sessionId} closed (status ${reason ?? "unknown"}); bounded reconnect ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS} from saved creds`);
      session.reconnectTimer = setTimeout(() => {
        session.reconnectTimer = null;
        if (this.sessions.get(sessionId) !== session) return;
        this.startSession(sessionId, {}).catch((err) => {
          console.warn(`[wabro] session ${sessionId} reconnect failed: ${err.message}`);
          const current = this.sessions.get(sessionId);
          if (current) {
            current.state = "disconnected";
            this.emit(`disconnected:${sessionId}`, { reason: null });
          }
        });
      }, delay);
      if (session.reconnectTimer.unref) session.reconnectTimer.unref();
      return;
    }
    session.state = "disconnected";
    console.warn(`[wabro] session ${sessionId} closed (status ${reason ?? "unknown"}); no auto-reconnect (${wasRegistered ? "reconnect attempts exhausted" : "session never registered"})`);
    this.emit(`disconnected:${sessionId}`, { reason: reason ?? null });
  }

  // Close the socket and forget the session WITHOUT unlinking the device
  // from WhatsApp. Used only for abandoned sessions that never paired
  // (e.g. the setup tab closed before the QR was scanned).
  async disconnect(sessionId) {
    this.cleanupPresenceTimeout(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }
      this.reconnectAttempts.delete(sessionId);
      try {
        session.sock?.ws?.close();
      } catch {}
      this.sessions.delete(sessionId);
    }
  }

  // Full unlink: closes the socket AND logs the device out of WhatsApp.
  // Call only from the explicit logout endpoint - never on tab close,
  // never automatically after onboarding.
  async logout(sessionId) {
    this.cleanupPresenceTimeout(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      // Same cleanup contract as disconnect(): a pending bounded reconnect
      // must not fire into (or exhaust the attempt budget of) whatever
      // session later reuses this id.
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }
      this.reconnectAttempts.delete(sessionId);
      try {
        session.sock?.ws?.close();
        await session.sock?.logout();
      } catch {}
      this.sessions.delete(sessionId);
    }
  }
}

export const baileysConnector = new BaileysConnector();
