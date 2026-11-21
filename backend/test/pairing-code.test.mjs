// Pairing-code linking: /start accepts a phone (user's chosen method over
// QR), normalizes it, requests the code through the connector, and exposes
// it on status. Offline: connector methods are stubbed, no WhatsApp contact.
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
rmSync(join(__dirname, "..", "data"), { recursive: true, force: true });

process.env.PORT = "3993";
const BASE = "http://127.0.0.1:3993";

const { baileysConnector } = await import("../baileys.js");

const startCalls = [];
let pairingRequests = [];
let fakeSession;
baileysConnector.startSession = async (sessionId, opts = {}) => {
  startCalls.push({ sessionId, opts });
  fakeSession = {
    sock: { ws: { closed: false, close() { this.closed = true; } }, async logout() {} },
    saveCreds: async () => {},
    state: "connecting",
    qr: null,
    pairingCode: null,
    pairingCodeIssuedAt: null,
    connected: false,
    groups: [],
  };
  baileysConnector.sessions.set(sessionId, fakeSession);
  // Simulate WhatsApp answering the pairing-code request a moment later.
  if (opts.pairingPhone) {
    setTimeout(() => {
      fakeSession.pairingCode = "ABCD1234";
      fakeSession.pairingCodeIssuedAt = Date.now();
      fakeSession.state = "pairing_code";
      baileysConnector.emit(`pairing_code:${sessionId}`, "ABCD1234");
    }, 50);
  }
  return sessionId;
};
baileysConnector.requestPairingCode = async (sessionId, phone) => {
  pairingRequests.push({ sessionId, phone });
  fakeSession.pairingCode = "WXYZ9876";
  fakeSession.pairingCodeIssuedAt = Date.now();
  fakeSession.state = "pairing_code";
  return "WXYZ9876";
};

await import("../server.js");
await new Promise((r) => setTimeout(r, 300));

const post = (path, body) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// 1. phone without country code is rejected ----------------------------------
{
  const r = await post("/api/wabro/onboard/start", { pairingPhone: "123" });
  assert.equal(r.status, 400);
  assert.equal(startCalls.length, 0);
}

// 2. pairing-code start: phone normalized and passed through -----------------
{
  const r = await post("/api/wabro/onboard/start", { pairingPhone: "+91 98200 56180" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.sessionId, "default");
  assert.deepEqual(startCalls[0].opts, { pairingPhone: "919820056180" });
}

// 3. status exposes the code once it arrives (and no QR fallback is offered) --
{
  await new Promise((r) => setTimeout(r, 200));
  const s = await (await fetch(`${BASE}/api/wabro/onboard/status/default`)).json();
  assert.equal(s.pairingCode, "ABCD1234");
  assert.equal(s.qr, null, "QR must not be offered in pairing-code mode");
}

// 4. SSE carries the pairing code event ---------------------------------------
{
  const controller = new AbortController();
  const res = await fetch(`${BASE}/api/wabro/onboard/status/default?events=1`, { signal: controller.signal });
  const text = await Promise.race([
    (async () => {
      const reader = res.body.getReader();
      const { value } = await reader.read();
      return new TextDecoder().decode(value);
    })(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("SSE timeout")), 3000)),
  ]);
  assert.ok(text.includes("pairingCode") || text.includes("pairing_code"), "SSE must carry the pairing code");
  // Keep the session alive across the tab close (paired sessions survive);
  // an unpaired session would be abandoned by design.
  fakeSession.connected = true;
  controller.abort();
  await new Promise((r) => setTimeout(r, 150));
}

// 5. unpaired existing session can switch to code-based linking ----------------
{
  fakeSession.connected = false;
  fakeSession.pairingCode = null;
  fakeSession.state = "qr";
  const r = await post("/api/wabro/onboard/start", { pairingPhone: "919820056180" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.pairingCode, "WXYZ9876");
  assert.deepEqual(pairingRequests, [{ sessionId: "default", phone: "919820056180" }]);
  assert.equal(startCalls.length, 1, "existing session must not be recreated");
}

// 6. an already-linked session is left alone -----------------------------------
{
  fakeSession.connected = true;
  fakeSession.state = "connected";
  const before = pairingRequests.length;
  const r = await post("/api/wabro/onboard/start", { pairingPhone: "919820056180" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.state, "connected");
  assert.equal(pairingRequests.length, before, "no pairing code for a linked session");
}

// 7. /pairing-code rejects a phone without country code ----------------------
{
  const before = pairingRequests.length;
  const r = await post("/api/wabro/onboard/pairing-code", { phone: "123" });
  assert.equal(r.status, 400);
  assert.equal(pairingRequests.length, before, "no request minted for bad phone");
}

// 8. /pairing-code refuses a linked session ------------------------------------
{
  fakeSession.connected = true;
  fakeSession.state = "connected";
  const before = pairingRequests.length;
  const r = await post("/api/wabro/onboard/pairing-code", { phone: "919820056180" });
  assert.equal(r.status, 409);
  assert.equal(pairingRequests.length, before, "linked session must stay untouched");
}

// 9. /pairing-code overwrites a stale code (expired-code recovery) -------------
{
  fakeSession.connected = false;
  fakeSession.state = "pairing_code";
  fakeSession.pairingCode = "STALE123";
  fakeSession.pairingCodeIssuedAt = 111;
  const before = pairingRequests.length;
  const r = await post("/api/wabro/onboard/pairing-code", { phone: "+91 98200 56180" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.pairingCode, "WXYZ9876", "fresh code replaces the stale one");
  assert.ok(body.pairingCodeIssuedAt > 111, "fresh issuedAt is returned");
  assert.equal(pairingRequests.length, before + 1);
  assert.equal(pairingRequests.at(-1).phone, "919820056180");
  const s = await (await fetch(`${BASE}/api/wabro/onboard/status/default`)).json();
  assert.equal(s.pairingCode, "WXYZ9876");
  assert.ok(s.pairingCodeIssuedAt > 111, "status exposes the fresh issuedAt");
}

// 10. /start also reissues when the old code is stale ---------------------------
{
  const before = pairingRequests.length;
  const r = await post("/api/wabro/onboard/start", { pairingPhone: "919820056180" });
  assert.equal(r.status, 200);
  assert.equal(pairingRequests.length, before + 1, "stale code must not block reissue");
}

// 11. /pairing-code {fresh:true} abandons the unpaired socket and recreates -----
{
  const callsBefore = startCalls.length;
  const oldSock = fakeSession.sock;
  const r = await post("/api/wabro/onboard/pairing-code", { phone: "919820056180", fresh: true });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.state, "connecting");
  assert.equal(startCalls.length, callsBefore + 1, "session recreated");
  assert.deepEqual(startCalls.at(-1).opts, { pairingPhone: "919820056180" });
  assert.equal(oldSock.ws.closed, true, "old unpaired socket abandoned");
}

// 12. /pairing-code with no session at all starts one with the phone ------------
{
  baileysConnector.sessions.delete("default");
  const callsBefore = startCalls.length;
  const r = await post("/api/wabro/onboard/pairing-code", { phone: "919820056180" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.state, "connecting");
  assert.equal(startCalls.length, callsBefore + 1);
  assert.deepEqual(startCalls.at(-1).opts, { pairingPhone: "919820056180" });
}

console.log("pairing-code tests: ALL PASSING");
process.exit(0);
