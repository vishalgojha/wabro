import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import onboardRouter from "./routes/onboard.js";
import messagesRouter from "./routes/messages.js";
import outreachRouter from "./routes/outreach.js";
import { baileysConnector, CONNECTOR_DATA_DIR, DEFAULT_SESSION_ID } from "./connector.js";
import {
  getStats,
  reconcileOutreachState,
  createUser,
  getOrCreateWorkspace,
  getBroadcastLists,
  getBroadcastListContacts,
  optOutBroker,
  recordUnresolvedOptOut,
} from "./db.js";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
// Panel assets live inside the deployable unit: ./web in the container image
// (backend build context), ../web only in a full repo checkout (local dev).
const WEB_DIR = [join(__dirname, "web"), join(__dirname, "..", "web")].find((p) =>
  existsSync(p)
);
const app = express();
const PORT = process.env.PORT || 3002;

// No authentication — open access. All users share a single default workspace.
const DEFAULT_EMAIL = "guest@wabro.local";

app.use(cors());
app.use(express.json());

app.use("/wabro/app", express.static(WEB_DIR));

app.get(["/wabro/app/auth", "/wabro/app/auth.html"], (req, res) => {
  res.redirect("/wabro/app/");
});

app.get("/wabro/app/setup", (req, res) => {
  res.sendFile(join(WEB_DIR, "onboard.html"));
});
app.get("/wabro/app/setup.html", (req, res) => {
  res.redirect("/wabro/app/setup");
});

app.use("/api/wabro/onboard", onboardRouter);
app.use("/api/wabro/messages", messagesRouter);
app.use("/api/wabro/outreach", outreachRouter);

// Session state for operators: is the linked device connected right now?
app.get("/api/wabro/session", (req, res) => {
  const session = baileysConnector.getSession(DEFAULT_SESSION_ID);
  const hasStoredSession = existsSync(join(CONNECTOR_DATA_DIR, DEFAULT_SESSION_ID, "whatsmeow.db"));
  res.json({
    sessionId: DEFAULT_SESSION_ID,
    state: session ? session.state : hasStoredSession ? "stored_offline" : "none",
    connected: !!(session && session.connected),
  });
});

// Boot reconciliation: a restart kills in-memory sender loops. Park
// interrupted batches and mark in-flight recipients uncertain BEFORE the
// session restore can reconnect, so nothing resumes or retries blindly.
const reconciled = reconcileOutreachState();
if (reconciled.batchesParked || reconciled.recipientsParked) {
  console.log(
    `Outreach reconciliation: parked ${reconciled.batchesParked} batch(es), ${reconciled.recipientsParked} in-flight recipient(s) marked uncertain`
  );
}

// Inbound opt-out keywords: record ONLY. We never auto-reply on this number
// (a bot reply from a personal WhatsApp is worse than silence), and we never
// touch group chats. Exact keywords only - "please stop sending" is a human
// message a human should see, not a keyword to swallow.
const OPT_OUT_RE = /^(stop|unsubscribe|opt[ -]?out)$/i;
baileysConnector.on(`message:${DEFAULT_SESSION_ID}`, async (msg) => {
  if (!msg || msg.fromMe) return;
  const chatId = typeof msg.chatId === "string" ? msg.chatId : "";
  const body = (msg.body || "").trim();
  if (!OPT_OUT_RE.test(body)) return;

  let phone = null;
  if (chatId.endsWith("@s.whatsapp.net")) {
    // Strip any device suffix: "9198...:23@s.whatsapp.net" -> "9198...".
    const user = chatId.split("@")[0].split(":")[0];
    phone = /^\d+$/.test(user) ? user : null;
  } else if (chatId.endsWith("@lid")) {
    // Newer lid addressing: resolve through the library's lid->PN mapping.
    phone = await baileysConnector.resolvePhoneFromLid(DEFAULT_SESSION_ID, chatId);
  } else {
    return; // groups, broadcasts, newsletters: not DMs
  }

  if (!phone) {
    // Identity unresolved: record the signal so the uncertainty is visible
    // (preview surfaces it) instead of silently claiming all opt-outs honored.
    recordUnresolvedOptOut(chatId, body.toLowerCase());
    console.warn(`Opt-out keyword from unresolvable chat id ${chatId} - recorded as unresolved`);
    return;
  }
  optOutBroker(phone);
  console.log(`Opt-out recorded for ${phone} (keyword: ${body.toLowerCase()})`);
});

// Internal webhook: the whatsmeow sidecar pushes session events here.
// Loopback + per-boot token only (enforced in handleWebhook).
app.post("/internal/connector/event", (req, res) => baileysConnector.handleWebhook(req, res));

// Start the connector sidecar (bounded respawn inside spawnSidecar).
baileysConnector.spawnSidecar();

// Boot restore: a previously linked device comes back online without a new
// pairing. Only the stable default session is restored.
if (existsSync(join(CONNECTOR_DATA_DIR, DEFAULT_SESSION_ID, "whatsmeow.db"))) {
  baileysConnector
    .startSession(DEFAULT_SESSION_ID)
    .catch((err) => console.error("Session restore failed:", err.message));
}

app.get("/api/wabro/dashboard/stats", (req, res) => {
  const email = req.query.email || DEFAULT_EMAIL;
  const user = createUser(email);
  if (!user) return res.json({ stats: { total_lists: 0, total_contacts: 0, total_areas: 0 } });
  const ws = getOrCreateWorkspace(user.id);
  const s = getStats(ws.id);
  res.json({ stats: s });
});

app.get("/api/wabro/campaigns", (req, res) => {
  res.json({ campaigns: [] });
});

app.get("/api/wabro/contacts", (req, res) => {
  const email = req.query.email || DEFAULT_EMAIL;
  const user = createUser(email);
  if (!user) return res.json({ lists: [] });
  const ws = getOrCreateWorkspace(user.id);
  const lists = getBroadcastLists(ws.id);
  res.json({ lists: lists.map((l) => ({ name: l.name, count: l.contact_count })) });
});

app.get("/api/wabro/contacts/:listName", (req, res) => {
  res.json({ contacts: [] });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`WaBro backend running on http://localhost:${PORT}`);
  console.log(`Dashboard:    http://localhost:${PORT}/wabro/app/`);
  console.log(`Onboard page: http://localhost:${PORT}/wabro/app/setup`);
});
