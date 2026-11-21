// Tests for the approved safety changes:
//  1. No brochure auto-reply bot (no startup or incoming-message auto-sends)
//  2. No group-participant harvesting during onboarding
//  3. Stable session lifecycle: tab close never unlinks; explicit logout does
// Runs fully offline: startSession is stubbed, no WhatsApp contact.
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
rmSync(join(__dirname, "..", "data"), { recursive: true, force: true });

process.env.PORT = "3991";
const BASE = "http://127.0.0.1:3991";

process.env.CONNECTOR_SPAWN_DISABLED = "1";
const { baileysConnector } = await import("../connector.js");
const { registerBrochure } = await import("../bot.js");
const { getBrokerContacts } = await import("../db.js");

// ---- fakes / spies -------------------------------------------------------
function makeFakeSession(connected) {
  return {
    sock: {
      ws: { closed: false, close() { this.closed = true; } },
      logoutCalls: 0,
      async logout() { this.logoutCalls++; },
    },
    saveCreds: async () => {},
    state: connected ? "connected" : "qr",
    qr: null,
    connected,
    groups: [],
  };
}
// Never open a real WhatsApp socket in tests
baileysConnector.startSession = async (sessionId) => {
  baileysConnector.sessions.set(sessionId, makeFakeSession(true));
  return sessionId;
};
let sendDocCalls = 0;
baileysConnector.sendDocument = async () => { sendDocCalls++; };
let sendMsgCalls = 0;
baileysConnector.sendMessage = async () => { sendMsgCalls++; };

await import("../server.js"); // boots express on :3991
await new Promise((r) => setTimeout(r, 400));

// ---- T1: no auto-reply bot registered -----------------------------------
assert.equal(baileysConnector.listenerCount("message:all"), 0, "bot listener present");
console.log("T1 ok: no message:all listener (initBot gone)");

// ---- T2: incoming 'brochure' text/button triggers no send ----------------
registerBrochure("btn-1", "http://example.com/b.pdf", "Brochure.pdf");
baileysConnector.emit("message:all", { sessionId: "x", chatId: "c@s.whatsapp.net", body: "send brochure please", fromMe: false });
baileysConnector.emit("message:all", { sessionId: "x", chatId: "c@s.whatsapp.net", buttonId: "btn-1", fromMe: false });
await new Promise((r) => setTimeout(r, 100));
assert.equal(sendDocCalls, 0, "brochure auto-reply fired");
assert.equal(sendMsgCalls, 0, "unexpected auto send");
console.log("T2 ok: brochure keyword and button produce zero sends");

// ---- T3: onboarding processes groups WITHOUT harvesting ------------------
const start = await (await fetch(`${BASE}/api/wabro/onboard/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
const sid = start.sessionId;
const fake = baileysConnector.getSession(sid);
assert.ok(fake, "fake session missing");

// open SSE so the groups listener attaches (mirrors the real UI flow)
const sse1 = new AbortController();
const sseRes = await fetch(`${BASE}/api/wabro/onboard/status/${sid}?events=1`, { signal: sse1.signal });
assert.equal(sseRes.status, 200);
sseRes.body.getReader(); // hold stream open

const fakeGroups = [
  { jid: "g1@g.us", subject: "Andheri West Property Deals", size: 2,
    participants: [{ phone: "9820011111", name: "A" }, { phone: "9820022222", name: "B" }] },
  { jid: "g2@g.us", subject: "Bandra flats resale", size: 1,
    participants: [{ phone: "9820033333", name: "C" }] },
];
baileysConnector.emit(`groups:${sid}`, fakeGroups);
await new Promise((r) => setTimeout(r, 300));

const results = await (await fetch(`${BASE}/api/wabro/onboard/results/${sid}`)).json();
assert.equal(results.completed, true, "onboarding did not complete");
assert.equal(results.contact_count, 0, "contacts appeared from nowhere");
assert.deepEqual(results.lists, [], "broadcast lists generated");
assert.equal(getBrokerContacts({}).length, 0, "broker_contacts harvested");
assert.ok(baileysConnector.getSession(sid), "session dropped after onboarding");
assert.equal(fake.sock.logoutCalls, 0, "onboarding unlinked the device");
console.log("T3 ok: zero harvested contacts, zero lists, session alive, no logout");

// ---- T4: tab close (SSE disconnect) keeps the paired session ------------
sse1.abort();
await new Promise((r) => setTimeout(r, 200));
assert.ok(baileysConnector.getSession(sid), "tab close killed the session");
assert.equal(fake.sock.logoutCalls, 0, "tab close unlinked the device");
assert.equal(fake.sock.ws.closed, false, "tab close closed the socket");
console.log("T4 ok: paired session survives tab close, socket open, no unlink");

// ---- T4b: tab close abandons a never-paired session WITHOUT logout ------
// Fresh-state simulation: no session in memory (e.g. after a server restart
// with no stored creds), so /start creates the stable default session.
baileysConnector.sessions.delete(sid);
baileysConnector.startSession = async (sessionId) => {
  baileysConnector.sessions.set(sessionId, makeFakeSession(false)); // QR never scanned
  return sessionId;
};
const start2 = await (await fetch(`${BASE}/api/wabro/onboard/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
const sid2 = start2.sessionId;
const fake2 = baileysConnector.getSession(sid2);
assert.equal(sid2, sid, "onboarding must reuse the stable default session id");
const sse2 = new AbortController();
await fetch(`${BASE}/api/wabro/onboard/status/${sid2}?events=1`, { signal: sse2.signal });
sse2.abort();
await new Promise((r) => setTimeout(r, 200));
assert.equal(baileysConnector.getSession(sid2), null, "abandoned QR session lingered");
assert.equal(fake2.sock.logoutCalls, 0, "abandon path unlinked a device");
console.log("T4b ok: never-paired session abandoned without logout");

// ---- T4c: a second /start returns the existing session, never a new one -
baileysConnector.startSession = async (sessionId) => {
  baileysConnector.sessions.set(sessionId, makeFakeSession(true));
  return sessionId;
};
const start3 = await (await fetch(`${BASE}/api/wabro/onboard/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
const start4 = await (await fetch(`${BASE}/api/wabro/onboard/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
assert.equal(start3.sessionId, start4.sessionId, "repeat onboarding minted a second session");
assert.equal(start4.state, "connected", "repeat onboarding should report the live session state");
const fake3 = baileysConnector.getSession(start3.sessionId);
console.log("T4c ok: repeat onboarding reuses the stable session");

// ---- T5: explicit logout endpoint unlinks, and only it ------------------
const lo = await (await fetch(`${BASE}/api/wabro/onboard/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid }) })).json();
assert.equal(lo.success, true);
assert.equal(fake3.sock.logoutCalls, 1, "explicit logout did not unlink exactly once");
assert.equal(baileysConnector.getSession(sid), null, "session survived explicit logout");
const lo404 = await (await fetch(`${BASE}/api/wabro/onboard/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid }) }));
assert.equal(lo404.status, 404);
console.log("T5 ok: explicit logout unlinks once; repeat is 404");

// ---- T6: no stray references to removed machinery ------------------------
const { readFileSync } = await import("node:fs");
const serverSrc = readFileSync(join(__dirname, "..", "server.js"), "utf8");
const onboardSrc = readFileSync(join(__dirname, "..", "routes", "onboard.js"), "utf8");
assert.ok(!serverSrc.includes("initBot"), "server.js still calls initBot");
for (const t of ["upsertBrokerContacts", "generateBroadcastLists", "getGroupAreas", ".cleanup("]) {
  assert.ok(!onboardSrc.includes(t), `onboard.js still references ${t}`);
}
console.log("T6 ok: no stray references to removed machinery");

// ---- T7-T12: lifecycle semantics in the whatsmeow stack -----------------
// The connection now lives in the Go connector; the Node side keeps a
// cache fed by webhook events. These tests exercise that seam directly by
// POSTing connector-shaped events to the internal webhook (loopback +
// per-boot token), asserting the same deployed guarantees: dead pairing
// artifacts are cleared, states stay truthful, stale events cannot clobber
// a live session, and terminal events never resurrect a dead session.
// Reconnect policy itself (bounded retries, stream-replaced hard stop) is
// connector-internal and covered by backend/connector/main_test.go.

const connectorToken = baileysConnector.token;
const postEvent = (body) =>
  fetch(`${BASE}/internal/connector/event`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-connector-token": connectorToken },
    body: JSON.stringify(body),
  });

// ---- T7: disconnected clears the dead pairing code, truthful state ------
{
  const sess = makeFakeSession(false);
  sess.state = "pairing_code";
  sess.pairingCode = "ABCD1234";
  sess.pairingCodeIssuedAt = Date.now();
  baileysConnector.sessions.set("t7", sess);
  let disconnectedPayload = null;
  baileysConnector.once("disconnected:t7", (pl) => { disconnectedPayload = pl; });
  const r = await postEvent({ sessionId: "t7", type: "disconnected", reason: 515 });
  assert.equal(r.status, 200);
  assert.equal(sess.pairingCode, null, "stale code not cleared on disconnect");
  assert.equal(sess.pairingCodeIssuedAt, null);
  assert.equal(sess.state, "disconnected", "must be truthful disconnected, not fake reconnecting");
  assert.ok(disconnectedPayload, "disconnected event not re-emitted");
  baileysConnector.sessions.delete("t7");
  console.log("T7 ok: disconnect clears code, truthful state, event re-emitted");
}

// ---- T8: connected event settles a pairing session -----------------------
{
  const sess = makeFakeSession(false);
  sess.state = "pairing_code";
  sess.pairingCode = "ABCD1234";
  sess.pairingCodeIssuedAt = Date.now();
  baileysConnector.sessions.set("t8", sess);
  let connectedFired = false;
  baileysConnector.once("connected:t8", () => { connectedFired = true; });
  baileysConnector.fetchGroups = async () => [{ subject: "G" }];
  const r = await postEvent({ sessionId: "t8", type: "connected" });
  assert.equal(r.status, 200);
  await new Promise((r2) => setTimeout(r2, 100));
  assert.equal(sess.state, "connected");
  assert.equal(sess.connected, true);
  assert.equal(sess.pairingCode, null, "code kept after connect");
  assert.ok(connectedFired, "connected event not re-emitted");
  baileysConnector.sessions.delete("t8");
  console.log("T8 ok: connected settles state and clears artifacts");
}

// ---- T9: terminal events for an unknown session never resurrect it ------
{
  assert.equal(baileysConnector.sessions.has("t9"), false);
  await postEvent({ sessionId: "t9", type: "disconnected", reason: 428 });
  await postEvent({ sessionId: "t9", type: "logged_out" });
  await postEvent({ sessionId: "t9", type: "error", message: "x" });
  assert.equal(baileysConnector.sessions.has("t9"), false, "terminal event recreated a dead session");
  console.log("T9 ok: terminal events never resurrect a dead session");
}

// ---- T10: webhook auth rejects wrong token and non-loopback shape -------
{
  const bad = await fetch(`${BASE}/internal/connector/event`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-connector-token": "wrong" },
    body: JSON.stringify({ sessionId: "t10", type: "disconnected" }),
  });
  assert.equal(bad.status, 404, "bad token not rejected with 404");
  const noToken = await fetch(`${BASE}/internal/connector/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "t10", type: "disconnected" }),
  });
  assert.equal(noToken.status, 404, "missing token not rejected with 404");
  console.log("T10 ok: webhook rejects wrong or missing token");
}

// ---- T11: disconnect() drops the cached session --------------------------
{
  const sess = makeFakeSession(true);
  baileysConnector.sessions.set("t11", sess);
  await baileysConnector.disconnect("t11");
  assert.equal(baileysConnector.sessions.get("t11"), undefined);
  assert.equal(sess.sock.ws.closed, true, "disconnect did not close the socket handle");
  console.log("T11 ok: disconnect closes socket handle and drops cache");
}

// ---- T12: logout() unlinks and drops the cached session ------------------
{
  const sess = makeFakeSession(true);
  baileysConnector.sessions.set("t12", sess);
  await baileysConnector.logout("t12");
  assert.equal(sess.sock.logoutCalls, 1, "logout did not unlink exactly once");
  assert.equal(baileysConnector.sessions.get("t12"), undefined);
  console.log("T12 ok: logout unlinks once and drops cache");
}

console.log("\nALL TESTS PASSED");
process.exit(0);
