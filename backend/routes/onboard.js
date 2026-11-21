import { Router } from "express";
import QRCode from "qrcode";
import { baileysConnector, DEFAULT_SESSION_ID } from "../connector.js";
import {
  getStats,
  createUser,
  getOrCreateWorkspace,
  optOutBroker,
  getBroadcastLists,
} from "../db.js";

const router = Router();

const pendingSessions = new Map(); // sessionId -> { userEmail, resolve, timeout }

const DEFAULT_EMAIL = "guest@wabro.local";

// POST /api/wabro/onboard/start
// Always the stable default session: restarting onboarding reconnects the
// same device link (or restores stored creds) instead of minting a new one.
router.post("/start", async (req, res) => {
  try {
    const email = req.body.email || DEFAULT_EMAIL;
    const sessionId = DEFAULT_SESSION_ID;
    const pairingPhone = req.body.pairingPhone
      ? String(req.body.pairingPhone).replace(/\D/g, "")
      : null;
    if (req.body.pairingPhone && pairingPhone.length < 10) {
      return res.status(400).json({ error: "pairingPhone must include country code" });
    }

    const existing = baileysConnector.getSession(sessionId);
    if (existing) {
      // An unpaired session can still switch to code-based linking on the
      // same socket; an explicit re-request overwrites a stale code (that
      // is how an expired code is recovered). A linked session is untouched.
      if (pairingPhone && !existing.connected) {
        await baileysConnector.requestPairingCode(sessionId, pairingPhone);
      }
      pendingSessions.set(sessionId, { email, createdAt: Date.now() });
      const current = baileysConnector.getSession(sessionId);
      return res.json({ sessionId, state: current.state, pairingCode: current.pairingCode });
    }

    pendingSessions.set(sessionId, { email, createdAt: Date.now() });
    await baileysConnector.startSession(sessionId, { pairingPhone });

    res.json({ sessionId, state: "connecting" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wabro/onboard/pairing-code - request a (fresh) pairing code.
// This is the expired-code recovery path: it always mints a NEW code.
// Body: { phone, fresh? } - with fresh:true a confirmed-unpaired socket is
// recreated first (designed abandon of an unpaired session; a linked device
// is never touched), used when the current socket can no longer answer.
router.post("/pairing-code", async (req, res) => {
  try {
    const sessionId = DEFAULT_SESSION_ID;
    const email = req.body.email || DEFAULT_EMAIL;
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    if (phone.length < 10) {
      return res.status(400).json({ error: "phone with country code is required" });
    }

    const existing = baileysConnector.getSession(sessionId);
    if (existing?.connected) {
      return res.status(409).json({ error: "Session already linked" });
    }

    pendingSessions.set(sessionId, { email, createdAt: Date.now() });

    if (!existing || req.body.fresh === true) {
      if (existing) await baileysConnector.disconnect(sessionId);
      await baileysConnector.startSession(sessionId, { pairingPhone: phone });
      // The code arrives asynchronously on status / SSE, same as /start.
      return res.json({ sessionId, state: "connecting" });
    }

    const code = await baileysConnector.requestPairingCode(sessionId, phone);
    const current = baileysConnector.getSession(sessionId);
    res.json({
      sessionId,
      state: current.state,
      pairingCode: code,
      pairingCodeIssuedAt: current.pairingCodeIssuedAt,
    });
  } catch (err) {
    res.status(502).json({ error: `Pairing code request failed: ${err.message}` });
  }
});

// GET /api/wabro/onboard/status/:sessionId?events=1
router.get("/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = baileysConnector.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found", state: "expired" });
  }

  const wantsEvents = req.query.events === "1";

  if (wantsEvents) {
    // SSE stream for real-time updates
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // send current state immediately
    sendEvent("state", { state: session.state, qr: session.qr, pairingCode: session.pairingCode, pairingCodeIssuedAt: session.pairingCodeIssuedAt });

    const onQR = (qr) => sendEvent("qr", { qr });
    const onPairingCode = (code) => sendEvent("pairing_code", { code, issuedAt: baileysConnector.getSession(sessionId)?.pairingCodeIssuedAt || null });
    const onConnected = () => sendEvent("connected", {});
    const onGroups = (groups) => {
      sendEvent("groups", { count: groups.length });
      processGroups(sessionId, groups);
    };
    const onError = (msg) => sendEvent("error", { message: msg });
    const onLoggedOut = () => sendEvent("logged_out", {});
    const onReconnecting = () => sendEvent("reconnecting", {});
    const onDisconnected = (info) => sendEvent("disconnected", { reason: info?.reason ?? null });
    const onAck = (data) => sendEvent("message_ack", data);

    baileysConnector.on(`qr:${sessionId}`, onQR);
    baileysConnector.on(`pairing_code:${sessionId}`, onPairingCode);
    baileysConnector.on(`connected:${sessionId}`, onConnected);
    baileysConnector.on(`groups:${sessionId}`, onGroups);
    baileysConnector.on(`error:${sessionId}`, onError);
    baileysConnector.on(`logged_out:${sessionId}`, onLoggedOut);
    baileysConnector.on(`reconnecting:${sessionId}`, onReconnecting);
    baileysConnector.on(`disconnected:${sessionId}`, onDisconnected);
    baileysConnector.on(`message.ack:${sessionId}`, onAck);

    req.on("close", () => {
      baileysConnector.removeListener(`qr:${sessionId}`, onQR);
      baileysConnector.removeListener(`pairing_code:${sessionId}`, onPairingCode);
      baileysConnector.removeListener(`connected:${sessionId}`, onConnected);
      baileysConnector.removeListener(`groups:${sessionId}`, onGroups);
      baileysConnector.removeListener(`error:${sessionId}`, onError);
      baileysConnector.removeListener(`logged_out:${sessionId}`, onLoggedOut);
      baileysConnector.removeListener(`reconnecting:${sessionId}`, onReconnecting);
      baileysConnector.removeListener(`disconnected:${sessionId}`, onDisconnected);
      baileysConnector.removeListener(`message.ack:${sessionId}`, onAck);
      // Closing the setup tab must NOT unlink the WhatsApp device.
      // A connected session stays alive; only a session that never
      // paired (QR never scanned) is abandoned, without logout.
      const current = baileysConnector.getSession(sessionId);
      if (current && !current.connected) {
        baileysConnector.disconnect(sessionId).catch(() => {});
      }
    });

    return;
  }

  // plain JSON status
  res.json({
    sessionId,
    state: session.state,
    qr: session.pairingCode ? null : session.qr,
    pairingCode: session.pairingCode,
    pairingCodeIssuedAt: session.pairingCodeIssuedAt,
    groupCount: session.groups?.length || 0,
  });
});

// GET /api/wabro/onboard/qr-image/:sessionId
// Render the QR locally. The linking payload must never be sent to a
// third-party image service (the previous client shipped it to
// chart.googleapis.com, which is also deprecated).
router.get("/qr-image/:sessionId", async (req, res) => {
  const session = baileysConnector.getSession(req.params.sessionId);
  if (!session || !session.qr) {
    return res.status(404).json({ error: "No QR available for this session" });
  }
  try {
    const dataUrl = await QRCode.toDataURL(session.qr, { margin: 1, width: 256 });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: "Failed to render QR" });
  }
});

async function processGroups(sessionId, groups) {
  const pending = pendingSessions.get(sessionId);
  if (!pending) return;

  const { email } = pending;

  // Group-participant harvesting is disabled: members of the user's
  // groups are never imported into contacts. Recipients enter WaBro
  // only as explicit, user-approved lists. The fetched groups are still
  // surfaced to the UI (count) but their participants are not read.
  const user = createUser(email, email.split("@")[0]);
  const workspace = getOrCreateWorkspace(user.id);
  const lists = getBroadcastLists(workspace.id);
  const stats = getStats(workspace.id);

  pendingSessions.set(sessionId, {
    ...pending,
    completed: true,
    contactCount: stats.total_contacts,
    areaCount: lists.length,
    lists,
  });

  // The session intentionally stays connected: onboarding no longer
  // unlinks the device. Disconnect/logout happens only through the
  // explicit logout endpoint below.
}

// GET /api/wabro/onboard/results/:sessionId
router.get("/results/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = baileysConnector.getSession(sessionId);
  const pending = pendingSessions.get(sessionId);

  if (!pending) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (!pending.completed) {
    return res.json({ completed: false });
  }

  res.json({
    completed: true,
    contact_count: pending.contactCount,
    area_count: pending.areaCount,
    lists: pending.lists,
  });
});

// POST /api/wabro/onboard/optout
router.post("/optout", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone is required" });

  optOutBroker(phone);

  res.json({ success: true, message: "Opted out successfully" });
});

// GET /api/wabro/contacts  (overview for a workspace)
router.get("/contacts", (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const lists = getBroadcastLists(workspaceId);

  res.json({ lists });
});

// POST /api/wabro/onboard/logout - explicit, user-initiated unlink.
// This is the ONLY code path that logs the device out of WhatsApp.
router.post("/logout", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

  const session = baileysConnector.getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  await baileysConnector.logout(sessionId);
  pendingSessions.delete(sessionId);

  res.json({ success: true });
});

export default router;
