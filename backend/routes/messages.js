import { Router } from "express";
import { baileysConnector } from "../connector.js";

const router = Router();

// POST /api/wabro/messages/send
// Disabled: direct one-off sends bypass approval binding, dedup and
// idempotency. All sending goes through the reviewed batch API
// (/api/wabro/outreach/batches), which requires an approval record.
router.post("/send", (req, res) => {
  res.status(410).json({
    error: "Direct sends are disabled. Use /api/wabro/outreach/batches (approval-bound, idempotent).",
  });
});

// POST /api/wabro/messages/listing
// Disabled like /send: interactive-message sends bypass the reviewed batch
// path. The brochure button registry was already inert and goes with it.
router.post("/listing", (req, res) => {
  res.status(410).json({
    error: "Listing sends are disabled. Use /api/wabro/outreach/batches (approval-bound, idempotent).",
  });
});

// POST /api/wabro/messages/status
// Disabled: a status broadcast is still a send and must not bypass the
// reviewed batch flow. Returns 410 like the other legacy send paths.
router.post("/status", (req, res) => {
  res.status(410).json({
    error: "Status broadcasts are disabled. Use /api/wabro/outreach/batches (approval-bound, idempotent).",
  });
});

// POST /api/wabro/messages/profile/name
router.post("/profile/name", async (req, res) => {
  try {
    const { sessionId, name } = req.body;
    if (!sessionId || !name) {
      return res.status(400).json({ error: "sessionId and name are required" });
    }

    await baileysConnector.setProfileName(sessionId, name);
    res.json({ success: true, name });
  } catch (err) {
    // Honest 501 when the transport cannot do this at all: never pretend
    // the name was changed when it was not.
    res.status(err.code === "NOT_SUPPORTED" ? 501 : 500).json({ error: err.message });
  }
});

// POST /api/wabro/messages/profile/status
router.post("/profile/status", async (req, res) => {
  try {
    const { sessionId, status } = req.body;
    if (!sessionId || !status) {
      return res.status(400).json({ error: "sessionId and status are required" });
    }

    await baileysConnector.setProfileStatus(sessionId, status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
