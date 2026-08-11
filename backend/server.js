import express from "express";
import cors from "cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import onboardRouter from "./routes/onboard.js";
import messagesRouter from "./routes/messages.js";
import { initBot } from "./bot.js";
import {
  getStats,
  createUser,
  getOrCreateWorkspace,
  getBroadcastLists,
  getBroadcastListContacts,
} from "./db.js";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "..", "web");
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

initBot();

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
