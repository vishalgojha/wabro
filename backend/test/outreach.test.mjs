// Tests for the Instinct-operated outreach batch model:
//  approval binding, idempotency, dedup, opt-out, pause/resume, status,
//  session gating and ack upgrades. Fully offline: the WhatsApp connector
//  is stubbed, no network beyond localhost HTTP to the test server.
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
rmSync(join(__dirname, "..", "data"), { recursive: true, force: true });

process.env.PORT = "3992";
const BASE = "http://127.0.0.1:3992";

process.env.CONNECTOR_SPAWN_DISABLED = "1";
const { baileysConnector } = await import("../connector.js");
const {
  optOutBroker,
  isOptedOut,
  upsertBrokerContacts,
  reconcileOutreachState,
  setBatchStatus,
  markRecipientSending,
} = await import("../db.js");

// ---- stub the WhatsApp connector -----------------------------------------
const sentCalls = [];
let msgCounter = 0;
let connected = true;
baileysConnector.sendMessage = async (sessionId, chatId, text) => {
  sentCalls.push({ sessionId, chatId, text });
  msgCounter += 1;
  if (text.includes("MEDIA404")) throw new Error("Error: 404 Not Found while fetching media");
  if (text.includes("NOTREGISTERED")) throw new Error("not-registered: jid is not on WhatsApp");
  if (text.includes("FAILME")) throw new Error("Connection Closed: simulated send failure");
  return { key: { id: `MSG${msgCounter}` } };
};
baileysConnector.getSession = (sessionId) => ({
  state: connected ? "connected" : "reconnecting",
  connected,
});

await import("../server.js"); // starts listening on 3992

const post = (path, body) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path) => fetch(BASE + path).then((r) => r.json());

async function waitForBatch(id, wanted, timeoutMs = 15000) {
  const start = Date.now();
  for (;;) {
    const { batch } = await get(`/api/wabro/outreach/batches/${id}`);
    if (batch && wanted.includes(batch.status)) return batch;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`batch ${id} never reached ${wanted} (now ${batch && batch.status})`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

const approvalFor = (key) => ({ ref: `wamid.APPROVAL_${key}`, channel: "whatsapp", approvedAt: "2026-11-22T02:00:00+05:30" });
const approval = approvalFor("b-1");

// 1. approval binding is enforced -------------------------------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-noapproval",
    text: "hello",
    recipients: [{ phone: "+91 90000 00001" }],
  });
  assert.equal(r.status, 400, "batch without approval must be rejected");
}

// 2. preview shows dispositions without persisting ---------------------------
{
  upsertBrokerContacts([{ phone: "919000000002", name: "OptedOut" }]);
  optOutBroker("919000000002");
  const r = await post("/api/wabro/outreach/preview", {
    text: "New listing in Bandra",
    recipients: [
      { phone: "+91 90000 00001", name: "A" },
      { phone: "91 90000 00001", name: "A dup" },
      { phone: "+91 90000 00002", name: "OptedOut" },
      { phone: "+91 90000 00003", name: "B" },
    ],
  });
  assert.equal(r.status, 200);
  const { recipients } = await r.json();
  assert.deepEqual(
    recipients.map((x) => x.disposition),
    ["would_send", "duplicate_in_batch", "opted_out", "would_send"]
  );
  const { batches } = await get("/api/wabro/outreach/batches");
  assert.equal(batches.length, 0, "preview must not persist a batch");
}

// 3. create + send + per-recipient status ------------------------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-1",
    text: "New listing in Bandra",
    recipients: [
      { phone: "+91 90000 00001", name: "A" },
      { phone: "91 90000 00001", name: "A dup" },
      { phone: "+91 90000 00002", name: "OptedOut" },
      { phone: "+91 90000 00003", name: "B" },
    ],
    approval,
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.reused, false);
  const batch = await waitForBatch("b-1", ["done"]);
  assert.equal(batch.counts.sent, 2, "two unique non-opted-out recipients send");
  assert.equal(batch.counts.skipped_duplicate, 1);
  assert.equal(batch.counts.skipped_optout, 1);
  assert.equal(sentCalls.length, 2);
  assert.equal(batch.approval_ref, "wamid.APPROVAL_b-1", "approval is recorded on the batch");
  assert.ok(batch.recipients.every((x) => x.status !== "pending"), "nothing left pending");
}

// 4. idempotent re-post: same key + same payload, no new sends ---------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-1",
    text: "New listing in Bandra",
    recipients: [{ phone: "+91 90000 00001" }, { phone: "+91 90000 00003" }, { phone: "+91 90000 00002" }],
    approval,
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.reused, true);
  await new Promise((r2) => setTimeout(r2, 300));
  assert.equal(sentCalls.length, 2, "idempotent re-post must not resend");
}

// 5. same key, different content -> 409 ---------------------------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-1",
    text: "Different text",
    recipients: [{ phone: "+91 90000 00001" }],
    approval,
  });
  assert.equal(r.status, 409);
}

// 6. cross-batch dedup: identical text to the same phone ---------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-2",
    text: "New listing in Bandra",
    recipients: [{ phone: "+91 90000 00001" }, { phone: "+91 90000 00004" }],
    approval: approvalFor("b-2"),
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  const batch = await waitForBatch("b-2", ["done"]);
  assert.equal(batch.counts.skipped_dedup, 1, "same text to 00001 within window is skipped");
  assert.equal(batch.counts.sent, 1, "the fresh recipient sends");
  assert.equal(sentCalls.length, 3);
}

// 7. session gating + resume ---------------------------------------------------
{
  connected = false;
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-3",
    text: "Rates update",
    recipients: [{ phone: "+91 90000 00005" }, { phone: "+91 90000 00006" }],
    approval: approvalFor("b-3"),
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  const paused = await waitForBatch("b-3", ["paused"]);
  assert.equal(paused.note, "session_not_connected");
  assert.equal(sentCalls.length, 3, "nothing sends while the device is disconnected");
  assert.equal(paused.counts.pending, 2);

  connected = true;
  const rr = await post("/api/wabro/outreach/batches/b-3/resume", {});
  assert.equal(rr.status, 200);
  const done = await waitForBatch("b-3", ["done"]);
  assert.equal(done.counts.sent, 2, "resume sends exactly the pending recipients");
  assert.equal(sentCalls.length, 5);
}

// 8. ambiguous send errors park as uncertain (never auto-retried); only
// clearly negative WhatsApp answers count as safe-to-retry failures --------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-4",
    text: "FAILME please",
    recipients: [{ phone: "+91 90000 00007" }, { phone: "+91 90000 00008" }],
    approval: approvalFor("b-4"),
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  const batch = await waitForBatch("b-4", ["done"]);
  assert.equal(batch.counts.uncertain, 2, "ambiguous errors must park as uncertain");
  assert.ok(batch.recipients.every((x) => x.error.includes("simulated send failure")));

  const rd = await post("/api/wabro/outreach/batches", {
    batchKey: "b-4d",
    text: "NOTREGISTERED please",
    recipients: [{ phone: "+91 90000 00009" }],
    approval: approvalFor("b-4d"),
    pacingMs: 1000,
  });
  assert.equal(rd.status, 201);
  const bd = await waitForBatch("b-4d", ["done"]);
  assert.equal(bd.counts.failed, 1, "a definitive not-registered answer is a plain failure");
}

// 9. delivery/read receipts upgrade status -------------------------------------
{
  const { batch } = await get("/api/wabro/outreach/batches/b-1");
  const sentRec = batch.recipients.find((x) => x.status === "sent");
  assert.ok(sentRec && sentRec.message_id, "sent recipient has a message id");
  baileysConnector.emit("message.ack:default", { messageId: sentRec.message_id, chatId: "x@s.whatsapp.net", status: 3 });
  baileysConnector.emit("message.ack:default", { messageId: sentRec.message_id, chatId: "x@s.whatsapp.net", status: 4 });
  const after = await get(`/api/wabro/outreach/batches/b-1`);
  const upgraded = after.batch.recipients.find((x) => x.phone === sentRec.phone);
  assert.equal(upgraded.status, "read");
}

// 10. approval refs are single-use --------------------------------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-5",
    text: "A different batch entirely",
    recipients: [{ phone: "+91 90000 00010" }],
    approval: approval, // same ref as b-1
    pacingMs: 1000,
  });
  assert.equal(r.status, 409, "a consumed approval ref must not bind a second batch");
  const body = await r.json();
  assert.equal(body.batchId, "b-1");
  assert.equal(sentCalls.length, 8, "no sends from a rejected batch");
}

// 11. legacy immediate-send bypasses are closed --------------------------------
{
  const r1 = await post("/api/wabro/messages/send", { sessionId: "default", chatId: "919000000001@s.whatsapp.net", text: "bypass attempt" });
  assert.equal(r1.status, 410);
  const r2 = await post("/api/wabro/messages/listing", { sessionId: "default", chatId: "x@s.whatsapp.net", listing: { title: "t", body: "b", buttons: [] } });
  assert.equal(r2.status, 410);
  const r3 = await post("/api/wabro/messages/status", { sessionId: "default", text: "status bypass" });
  assert.equal(r3.status, 410, "status broadcast must also be retired");
  assert.equal(sentCalls.length, 8, "legacy endpoints must not send");
}

// 11b. ambiguous 404-style errors are uncertain, not failures -------------------
{
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-4e",
    text: "MEDIA404 please",
    recipients: [{ phone: "+91 90000 00013" }],
    approval: approvalFor("b-4e"),
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  const b = await waitForBatch("b-4e", ["done"]);
  assert.equal(b.counts.uncertain, 1, "a loose 404 text must NOT be treated as definitive failure");
  assert.equal(b.counts.failed, undefined);
}

// 12. restart reconciliation: interrupted batch parks, in-flight recipient
// becomes uncertain and is excluded from resume -------------------------------
{
  connected = false;
  const r = await post("/api/wabro/outreach/batches", {
    batchKey: "b-6",
    text: "Rates refresh",
    recipients: [{ phone: "+91 90000 00011" }],
    approval: approvalFor("b-6"),
    pacingMs: 1000,
  });
  assert.equal(r.status, 201);
  await waitForBatch("b-6", ["paused"]); // session_not_connected

  // Simulate a crash mid-send: batch "sending", recipient "sending".
  setBatchStatus("b-6", "sending");
  markRecipientSending("b-6", "919000000011");
  const rec = reconcileOutreachState();
  assert.equal(rec.batchesParked, 1);
  assert.equal(rec.recipientsParked, 1);
  const { batch } = await get("/api/wabro/outreach/batches/b-6");
  assert.equal(batch.status, "paused");
  assert.equal(batch.note, "interrupted_by_restart");
  assert.equal(batch.counts.uncertain, 1);

  // Resume must not touch the uncertain recipient: nothing pending -> done.
  connected = true;
  const rr = await post("/api/wabro/outreach/batches/b-6/resume", {});
  assert.equal(rr.status, 200);
  const done = await waitForBatch("b-6", ["done"]);
  assert.equal(done.counts.uncertain, 1, "uncertain recipient stays parked");
  assert.equal(sentCalls.length, 9, "resume never retried the uncertain recipient");
}

// 13. preview exposes prior uncertain outcomes; create skips them unless
// explicitly forced -----------------------------------------------------------
{
  const r = await post("/api/wabro/outreach/preview", {
    text: "Fresh text",
    recipients: [{ phone: "+91 90000 00011" }, { phone: "+91 90000 00012" }],
  });
  const { recipients } = await r.json();
  assert.deepEqual(recipients.map((x) => x.disposition), ["uncertain_prior", "would_send"]);
  assert.equal(recipients[0].last_batch_id, "b-6");

  const rb = await post("/api/wabro/outreach/batches", {
    batchKey: "b-7",
    text: "Fresh text",
    recipients: [{ phone: "+91 90000 00011" }, { phone: "+91 90000 00012" }],
    approval: approvalFor("b-7"),
    pacingMs: 1000,
  });
  assert.equal(rb.status, 201);
  const b7 = await waitForBatch("b-7", ["done"]);
  assert.equal(b7.counts.skipped_uncertain, 1, "uncertain prior skipped by default");
  assert.equal(b7.counts.sent, 1);
  assert.equal(sentCalls.length, 10);

  const rf = await post("/api/wabro/outreach/batches", {
    batchKey: "b-8",
    text: "Fresh text",
    recipients: [{ phone: "+91 90000 00011", force: true }],
    approval: approvalFor("b-8"),
    pacingMs: 1000,
  });
  assert.equal(rf.status, 201);
  const b8 = await waitForBatch("b-8", ["done"]);
  assert.equal(b8.counts.sent, 1, "explicit force sends despite uncertain prior");
  assert.equal(sentCalls.length, 11);
}

// 13b. force override is persisted, exposed, and part of the binding ----------
{
  const { batch } = await get("/api/wabro/outreach/batches/b-8");
  const forced = batch.recipients.find((x) => x.phone === "919000000011");
  assert.equal(forced.forced, 1, "force override must persist on the recipient row");

  // identical re-post (same force) reuses; flipped force conflicts
  const same = await post("/api/wabro/outreach/batches", {
    batchKey: "b-8",
    text: "Fresh text",
    recipients: [{ phone: "+91 90000 00011", force: true }],
    approval: approvalFor("b-8"),
  });
  assert.equal(same.status, 200);
  assert.equal((await same.json()).reused, true);

  const flipped = await post("/api/wabro/outreach/batches", {
    batchKey: "b-8",
    text: "Fresh text",
    recipients: [{ phone: "+91 90000 00011" }],
    approval: approvalFor("b-8"),
  });
  assert.equal(flipped.status, 409, "dropping a force override on retry must conflict, not silently reuse");
}

// 14. operator resolution of a parked recipient --------------------------------
{
  // b-4 has two uncertain recipients; resolve one as sent, one as failed.
  const r1 = await post("/api/wabro/outreach/batches/b-4/recipients/resolve", { phone: "+91 90000 00007", outcome: "sent" });
  assert.equal(r1.status, 200);
  const r2 = await post("/api/wabro/outreach/batches/b-4/recipients/resolve", { phone: "+91 90000 00008", outcome: "failed" });
  assert.equal(r2.status, 200);
  // already-resolved rows refuse a second resolve
  const r3 = await post("/api/wabro/outreach/batches/b-4/recipients/resolve", { phone: "+91 90000 00007", outcome: "sent" });
  assert.equal(r3.status, 409);
  // resolving as sent wrote the dedup log: same text to 00007 now dedups
  const rp = await post("/api/wabro/outreach/preview", {
    text: "FAILME please",
    recipients: [{ phone: "+91 90000 00007" }, { phone: "+91 90000 00008" }],
  });
  const { recipients } = await rp.json();
  assert.deepEqual(recipients.map((x) => x.disposition), ["dedup_recent", "would_send"]);
}

// 15. session state endpoint ----------------------------------------------------
{
  const s = await get("/api/wabro/session");
  assert.equal(s.sessionId, "default");
  assert.equal(s.connected, true);
}

// 16. inbound STOP keywords: record opt-out only, never reply ----------------
{
  const sendsBefore = sentCalls.length;

  // Exact keyword from a DM records the opt-out, even for a phone that was
  // never a broker contact (upsert path).
  baileysConnector.emit("message:default", {
    chatId: "919999900001@s.whatsapp.net",
    body: "STOP",
    fromMe: false,
  });
  assert.equal(isOptedOut("919999900001"), true, "STOP must opt the sender out");

  baileysConnector.emit("message:default", {
    chatId: "919999900002@s.whatsapp.net",
    body: "  Unsubscribe ",
    fromMe: false,
  });
  assert.equal(isOptedOut("919999900002"), true, "Unsubscribe (any case/space) must opt out");

  // Our own outbound text never triggers it.
  baileysConnector.emit("message:default", {
    chatId: "919999900003@s.whatsapp.net",
    body: "stop",
    fromMe: true,
  });
  assert.equal(isOptedOut("919999900003"), false, "fromMe must be ignored");

  // Group chats are ignored.
  baileysConnector.emit("message:default", {
    chatId: "120363000000000000@g.us",
    body: "stop",
    fromMe: false,
  });
  assert.equal(isOptedOut("120363000000000000"), false, "group messages must be ignored");

  // Free-form human messages are not keywords.
  baileysConnector.emit("message:default", {
    chatId: "919999900004@s.whatsapp.net",
    body: "please stop sending me these",
    fromMe: false,
  });
  assert.equal(isOptedOut("919999900004"), false, "free-form text must not be swallowed");

  assert.equal(sentCalls.length, sendsBefore, "opt-out handling must never reply");
}

// 17. opt-out identity normalization: device suffixes, lid addressing --------
{
  const sendsBefore = sentCalls.length;
  const tick = () => new Promise((r) => setTimeout(r, 60));

  // Device-suffixed phone JID normalizes to the bare phone.
  baileysConnector.emit("message:default", {
    chatId: "919999900005:23@s.whatsapp.net",
    body: "stop",
    fromMe: false,
  });
  await tick();
  assert.equal(isOptedOut("919999900005"), true, "device suffix must be stripped");

  // Resolvable lid maps through the library's lid->PN mapping.
  baileysConnector.resolvePhoneFromLid = async () => "919999900006";
  baileysConnector.emit("message:default", {
    chatId: "100000000000001@lid",
    body: "STOP",
    fromMe: false,
  });
  await tick();
  assert.equal(isOptedOut("919999900006"), true, "lid must resolve to its phone");

  // Unresolvable lid: no fake opt-out, but the signal is recorded and the
  // preview surfaces it as uncertainty.
  baileysConnector.resolvePhoneFromLid = async () => null;
  baileysConnector.emit("message:default", {
    chatId: "100000000000002@lid",
    body: "unsubscribe",
    fromMe: false,
  });
  await tick();
  assert.equal(isOptedOut("100000000000002"), false, "unresolved lid must not fake an opt-out");
  const p = await post("/api/wabro/outreach/preview", {
    text: "identity check",
    recipients: [{ phone: "+91 90000 00003" }],
  });
  const body = await p.json();
  assert.ok(Array.isArray(body.unresolvedOptOuts), "preview must surface unresolved signals");
  assert.ok(
    body.unresolvedOptOuts.some((s) => s.chatId === "100000000000002@lid"),
    "unresolved lid signal must be recorded"
  );

  assert.equal(sentCalls.length, sendsBefore, "identity handling must never reply either");
}

console.log("outreach batch tests: ALL PASSING");
process.exit(0);
