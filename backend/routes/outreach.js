import { Router } from "express";
import { createHash } from "node:crypto";
import { baileysConnector, DEFAULT_SESSION_ID } from "../connector.js";
import {
  createOutreachBatch,
  getOutreachBatch,
  listOutreachBatches,
  setBatchStatus,
  insertOutreachRecipient,
  getOutreachRecipients,
  getNextPendingRecipient,
  countPendingRecipients,
  markRecipientSending,
  markRecipientSent,
  markRecipientFailed,
  markRecipientUncertain,
  resolveUncertainRecipient,
  getBatchByApprovalRef,
  findUncertainPrior,
  markAckByMessageId,
  logSend,
  findRecentSend,
  isOptedOut,
  batchCounts,
  getUnresolvedOptOuts,
} from "../db.js";

const router = Router();

// Fixed send pacing: a constant interval between sends as plain rate
// limiting. It is deliberately NOT randomized: WaBro does not try to look
// human, it only avoids hammering the connection.
const DEFAULT_PACING_MS = 5000;
const MIN_PACING_MS = 1000;
const MAX_PACING_MS = 60000;
// Cross-batch duplicate guard: identical text to the same phone inside this
// window is skipped unless the caller explicitly forces the send.
const DEFAULT_DEDUP_WINDOW_DAYS = 7;

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const normalizePhone = (p) => String(p || "").replace(/\D/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const running = new Map(); // batchId -> { pauseRequested }

// Delivery/read receipts upgrade recipient rows by message id.
baileysConnector.on(`message.ack:${DEFAULT_SESSION_ID}`, ({ messageId, status }) => {
  try {
    markAckByMessageId(messageId, status);
  } catch (err) {
    console.error("ack update failed:", err.message);
  }
});

function computeDispositions(textHash, recipients, dedupWindowDays) {
  const since = new Date(Date.now() - dedupWindowDays * 86400_000).toISOString();
  const seen = new Set();
  return recipients.map((r) => {
    const phone = normalizePhone(r.phone);
    const base = { phone, name: r.name || "", force: r.force === true };
    if (!phone) return { ...base, disposition: "invalid" };
    if (seen.has(phone)) return { ...base, disposition: "duplicate_in_batch" };
    seen.add(phone);
    if (isOptedOut(phone)) return { ...base, disposition: "opted_out" };
    // A prior attempt for this phone parked as uncertain means the message
    // may already have arrived: never silently retry it in a new batch.
    const uncertain = findUncertainPrior(phone);
    if (uncertain && r.force !== true) {
      return { ...base, disposition: "uncertain_prior", last_batch_id: uncertain.batch_id, attempted_at: uncertain.batch_created_at };
    }
    const recent = findRecentSend(phone, textHash, since);
    if (recent) {
      return { ...base, disposition: "dedup_recent", last_sent_at: recent.sent_at, last_batch_id: recent.batch_id };
    }
    return { ...base, disposition: "would_send" };
  });
}

// POST /preview - per-recipient disposition without persisting anything.
// Lets the operator show exactly what a batch would do before approval.
router.post("/preview", (req, res) => {
  const { text, recipients, dedupWindowDays } = req.body || {};
  if (!text || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "text and a non-empty recipients array are required" });
  }
  const window = Number(dedupWindowDays) > 0 ? Number(dedupWindowDays) : DEFAULT_DEDUP_WINDOW_DAYS;
  const textHash = sha256(text);
  // Surface opt-out signals we could not map to a phone: the caller must see
  // that honoring opt-outs is uncertain for these senders, not assume it.
  const unresolvedOptOuts = getUnresolvedOptOuts();
  res.json({ textHash, recipients: computeDispositions(textHash, recipients, window), unresolvedOptOuts });
});

// POST /batches - create an approval-bound batch and start sending it.
// Idempotent on batchKey: re-posting the identical batch returns the
// existing one and never double-sends.
router.post("/batches", async (req, res) => {
  try {
    const { batchKey, text, recipients, approval, pacingMs, dedupWindowDays } = req.body || {};
    if (!batchKey || typeof batchKey !== "string") {
      return res.status(400).json({ error: "batchKey (idempotency key) is required" });
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "a non-empty recipients array is required" });
    }
    // Approval binding: a batch exists only with a concrete approval record
    // (which message approved it, on which channel, when).
    if (!approval || !approval.ref || !approval.channel || !approval.approvedAt) {
      return res.status(400).json({
        error: "approval.ref, approval.channel and approval.approvedAt are required",
      });
    }

    const textHash = sha256(text);
    // Idempotency binds to the distinct recipient set AND their force
    // overrides: duplicate phones in the input are skipped by design, and a
    // retry that flips a force flag conflicts instead of silently changing
    // what the stored batch authorizes.
    const forceByPhone = new Map();
    for (const r of recipients) {
      const p = normalizePhone(r.phone);
      if (!p) continue;
      if (!forceByPhone.has(p)) forceByPhone.set(p, false);
      if (r.force === true) forceByPhone.set(p, true);
    }
    const phones = [...forceByPhone.keys()].sort();
    const recipientHash = sha256(phones.map((p) => (forceByPhone.get(p) ? `${p}:force` : p)).join(","));

    const existing = getOutreachBatch(batchKey);
    if (existing) {
      if (existing.text_hash !== textHash || existing.recipient_hash !== recipientHash) {
        return res.status(409).json({
          error: "batchKey already used with different text or recipients",
          batchId: batchKey,
        });
      }
      return res.json({ batch: batchView(batchKey), reused: true });
    }

    // One approval reference binds exactly one batch. Reusing a reference
    // would let a single "yes" authorize sends it never saw.
    const priorUse = getBatchByApprovalRef(String(approval.ref));
    if (priorUse) {
      return res.status(409).json({
        error: "approval.ref already consumed by another batch",
        batchId: priorUse.id,
      });
    }

    const pacing = Number(pacingMs) > 0
      ? Math.min(Math.max(Number(pacingMs), MIN_PACING_MS), MAX_PACING_MS)
      : DEFAULT_PACING_MS;
    const window = Number(dedupWindowDays) > 0 ? Number(dedupWindowDays) : DEFAULT_DEDUP_WINDOW_DAYS;

    createOutreachBatch({
      id: batchKey,
      text,
      textHash,
      recipientHash,
      approvalRef: String(approval.ref),
      approvalChannel: String(approval.channel),
      approvedAt: String(approval.approvedAt),
      pacingMs: pacing,
      inputCount: recipients.length,
    });

    for (const r of computeDispositions(textHash, recipients, window)) {
      const status = r.disposition === "would_send"
        ? "pending"
        : { duplicate_in_batch: "skipped_duplicate", opted_out: "skipped_optout", dedup_recent: "skipped_dedup", invalid: "skipped_invalid", uncertain_prior: "skipped_uncertain" }[r.disposition];
      insertOutreachRecipient(batchKey, r.phone, r.name, status, r.force === true);
    }

    // Fire and forget: the sender loop runs in the background.
    runBatch(batchKey).catch((err) => {
      console.error(`batch ${batchKey} sender crashed:`, err.message);
      setBatchStatus(batchKey, "failed", { note: `sender_crash: ${err.message}` });
    });

    res.status(201).json({ batch: batchView(batchKey), reused: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /batches - recent batches with per-status counts.
router.get("/batches", (req, res) => {
  const batches = listOutreachBatches(50).map((b) => ({ ...b, counts: batchCounts(b.id) }));
  res.json({ batches });
});

// GET /batches/:id - full detail.
router.get("/batches/:id", (req, res) => {
  const batch = getOutreachBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  res.json({ batch: batchView(req.params.id) });
});

// POST /batches/:id/pause - stop after the current send; pending rows stay.
router.post("/batches/:id/pause", (req, res) => {
  const batch = getOutreachBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  const control = running.get(batch.id);
  if (control) control.pauseRequested = true;
  if (batch.status === "sending" || batch.status === "approved") {
    setBatchStatus(batch.id, "paused");
  }
  res.json({ batch: batchView(batch.id) });
});

// POST /batches/:id/resume - continue pending recipients of a paused batch.
router.post("/batches/:id/resume", (req, res) => {
  const batch = getOutreachBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (batch.status !== "paused") {
    return res.status(409).json({ error: `batch is ${batch.status}, only paused batches resume` });
  }
  if (countPendingRecipients(batch.id) === 0) {
    setBatchStatus(batch.id, "done", { finishedAt: true });
    return res.json({ batch: batchView(batch.id) });
  }
  runBatch(batch.id).catch((err) => {
    console.error(`batch ${batch.id} sender crashed:`, err.message);
    setBatchStatus(batch.id, "failed", { note: `sender_crash: ${err.message}` });
  });
  res.json({ batch: batchView(batch.id) });
});

// Only an explicit non-delivery answer from WhatsApp ("not-registered": the
// number is not on WhatsApp, so nothing could have arrived) is a plain
// failure. Every other error leaves delivery certainty unresolved and parks
// the recipient as uncertain - never infer failure from loose error text.
function isDefinitiveSendFailure(message) {
  return /^\s*not-registered\b/i.test(message);
}

// POST /batches/:id/recipients/resolve - operator confirms a parked
// recipient out of band, then records the true outcome. Resolving to sent
// also writes the dedup log so later batches treat it as sent.
router.post("/batches/:id/recipients/resolve", (req, res) => {
  const batch = getOutreachBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  const { phone, outcome } = req.body || {};
  const normalized = normalizePhone(phone);
  if (!normalized || !["sent", "failed"].includes(outcome)) {
    return res.status(400).json({ error: "phone and outcome (sent|failed) are required" });
  }
  const rec = resolveUncertainRecipient(batch.id, normalized, outcome);
  if (rec === undefined) return res.status(404).json({ error: "Recipient not found" });
  if (rec === null) return res.status(409).json({ error: "Recipient is not parked as uncertain" });
  if (outcome === "sent") logSend(normalized, batch.text_hash, batch.id);
  res.json({ recipient: rec, batch: batchView(batch.id) });
});

function batchView(batchId) {
  const batch = getOutreachBatch(batchId);
  const counts = batchCounts(batchId);
  // Rows are one-per-phone by design; duplicate phones in the input are
  // dropped, so surface them from the recorded input count.
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  const dups = (batch.input_count || 0) - rows;
  if (dups > 0) counts.skipped_duplicate = dups;
  return {
    ...batch,
    counts,
    recipients: getOutreachRecipients(batchId),
  };
}

async function runBatch(batchId) {
  if (running.has(batchId)) return;
  const control = { pauseRequested: false };
  running.set(batchId, control);
  try {
    setBatchStatus(batchId, "sending", { startedAt: true });
    for (;;) {
      if (control.pauseRequested) {
        setBatchStatus(batchId, "paused");
        return;
      }
      const rec = getNextPendingRecipient(batchId);
      if (!rec) break;

      const batch = getOutreachBatch(batchId);
      const session = baileysConnector.getSession(DEFAULT_SESSION_ID);
      if (!session || !session.connected) {
        // Nothing is marked sent; resume continues exactly here once the
        // linked device is back.
        setBatchStatus(batchId, "paused", { note: "session_not_connected" });
        return;
      }
      // Durable in-flight marker BEFORE the attempt: if the process dies
      // during the send, boot reconciliation parks this row as uncertain
      // instead of leaving a false "pending" that a resume would retry.
      markRecipientSending(batchId, rec.phone);
      try {
        const result = await baileysConnector.sendMessage(
          DEFAULT_SESSION_ID,
          `${rec.phone}@s.whatsapp.net`,
          batch.text
        );
        markRecipientSent(batchId, rec.phone, result.key.id);
        logSend(rec.phone, batch.text_hash, batchId);
      } catch (err) {
        const message = String((err && err.message) || err);
        if (isDefinitiveSendFailure(message)) {
          markRecipientFailed(batchId, rec.phone, message);
        } else {
          // Ambiguous (timeout, connection drop, unknown): the message may
          // have landed. Park it; automatic retries never touch it.
          markRecipientUncertain(batchId, rec.phone, message);
        }
      }
      await sleep(batch.pacing_ms);
    }
    setBatchStatus(batchId, "done", { finishedAt: true });
  } finally {
    running.delete(batchId);
  }
}

export default router;
