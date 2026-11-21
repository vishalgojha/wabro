import { Router } from "express";
import { baileysConnector } from "../baileys.js";
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
router.post("/start", async (req, res) => {
  try {
    const email = req.body.email || DEFAULT_EMAIL;

    const sessionId = crypto.randomUUID();
    pendingSessions.set(sessionId, { email, createdAt: Date.now() });

    await baileysConnector.startSession(sessionId);

    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    sendEvent("state", { state: session.state, qr: session.qr });

    const onQR = (qr) => sendEvent("qr", { qr });
    const onConnected = () => sendEvent("connected", {});
    const onGroups = (groups) => {
      sendEvent("groups", { count: groups.length });
      processGroups(sessionId, groups);
    };
    const onError = (msg) => sendEvent("error", { message: msg });
    const onLoggedOut = () => sendEvent("logged_out", {});
    const onReconnecting = () => sendEvent("reconnecting", {});
    const onAck = (data) => sendEvent("message_ack", data);

    baileysConnector.on(`qr:${sessionId}`, onQR);
    baileysConnector.on(`connected:${sessionId}`, onConnected);
    baileysConnector.on(`groups:${sessionId}`, onGroups);
    baileysConnector.on(`error:${sessionId}`, onError);
    baileysConnector.on(`logged_out:${sessionId}`, onLoggedOut);
    baileysConnector.on(`reconnecting:${sessionId}`, onReconnecting);
    baileysConnector.on(`message.ack:${sessionId}`, onAck);

    req.on("close", () => {
      baileysConnector.removeListener(`qr:${sessionId}`, onQR);
      baileysConnector.removeListener(`connected:${sessionId}`, onConnected);
      baileysConnector.removeListener(`groups:${sessionId}`, onGroups);
      baileysConnector.removeListener(`error:${sessionId}`, onError);
      baileysConnector.removeListener(`logged_out:${sessionId}`, onLoggedOut);
      baileysConnector.removeListener(`reconnecting:${sessionId}`, onReconnecting);
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
    qr: session.qr,
    groupCount: session.groups?.length || 0,
  });
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
