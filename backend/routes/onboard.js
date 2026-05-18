import { Router } from "express";
import { baileysConnector } from "../baileys.js";
import {
  upsertBrokerContacts,
  getBrokerContacts,
  generateBroadcastLists,
  getStats,
  createUser,
  getOrCreateWorkspace,
  optOutBroker,
  getBroadcastLists,
} from "../db.js";
import { getGroupAreas } from "../mumbai-localities.js";

const router = Router();

const pendingSessions = new Map(); // sessionId -> { userEmail, resolve, timeout }

// POST /api/wabro/onboard/start
router.post("/start", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

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

    baileysConnector.on(`qr:${sessionId}`, onQR);
    baileysConnector.on(`connected:${sessionId}`, onConnected);
    baileysConnector.on(`groups:${sessionId}`, onGroups);
    baileysConnector.on(`error:${sessionId}`, onError);
    baileysConnector.on(`logged_out:${sessionId}`, onLoggedOut);
    baileysConnector.on(`reconnecting:${sessionId}`, onReconnecting);

    req.on("close", () => {
      baileysConnector.removeListener(`qr:${sessionId}`, onQR);
      baileysConnector.removeListener(`connected:${sessionId}`, onConnected);
      baileysConnector.removeListener(`groups:${sessionId}`, onGroups);
      baileysConnector.removeListener(`error:${sessionId}`, onError);
      baileysConnector.removeListener(`logged_out:${sessionId}`, onLoggedOut);
      baileysConnector.removeListener(`reconnecting:${sessionId}`, onReconnecting);
      baileysConnector.cleanup(sessionId).catch(() => {});
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

  const matched = [];

  for (const group of groups) {
    const areas = getGroupAreas(group.subject);
    if (areas.length === 0) continue;

    const groupContactMap = new Map();

    for (const p of group.participants) {
      if (!p.phone) continue;
      const key = p.phone;
      if (!groupContactMap.has(key)) {
        groupContactMap.set(key, {
          phone: `+91${p.phone}`,
          name: p.name || p.phone,
          areas: areas.map((a) => a.area),
          groups: [group.subject],
        });
      }
    }

    for (const contact of groupContactMap.values()) {
      matched.push(contact);
    }
  }

  // deduplicate across groups (merge areas and source groups)
  const merged = new Map();
  for (const c of matched) {
    const key = c.phone;
    if (merged.has(key)) {
      const existing = merged.get(key);
      existing.areas = [...new Set([...existing.areas, ...c.areas])];
      existing.groups = [...new Set([...existing.groups, ...c.groups])];
    } else {
      merged.set(key, { ...c, areas: [...c.areas], groups: [...c.groups] });
    }
  }

  const dedupedContacts = Array.from(merged.values());

  // upsert into global broker_contacts
  upsertBrokerContacts(dedupedContacts);

  // get or create user workspace
  let user = createUser(email, email.split("@")[0]);
  const workspace = getOrCreateWorkspace(user.id);

  // regenerate broadcast lists for this workspace from global graph
  const lists = generateBroadcastLists(workspace.id, user.id);
  const stats = getStats(workspace.id);

  const areaCount = lists.length;

  pendingSessions.set(sessionId, {
    ...pending,
    completed: true,
    contactCount: stats.total_contacts,
    areaCount,
    lists,
  });

  baileysConnector.cleanup(sessionId).catch(() => {});
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

export default router;
