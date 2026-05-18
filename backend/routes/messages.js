import { Router } from "express";
import { baileysConnector } from "../baileys.js";
import { getBrokerContacts } from "../db.js";
import { registerBrochure } from "../bot.js";

const router = Router();

// POST /api/wabro/messages/send
router.post("/send", async (req, res) => {
  try {
    const { sessionId, chatId, text } = req.body;
    if (!sessionId || !chatId || !text) {
      return res.status(400).json({ error: "sessionId, chatId, and text are required" });
    }

    const session = baileysConnector.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Human-like random delay (1-3 seconds)
    const delay = Math.floor(Math.random() * 2000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const result = await baileysConnector.sendMessage(sessionId, chatId, text);
    res.json({ success: true, messageId: result.key.id, delay });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wabro/messages/listing
router.post("/listing", async (req, res) => {
  try {
    const { sessionId, chatId, listing } = req.body;
    if (!sessionId || !chatId || !listing) {
      return res.status(400).json({ error: "sessionId, chatId, and listing are required" });
    }

    const session = baileysConnector.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Human-like random delay
    const delay = Math.floor(Math.random() * 2000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Register brochure buttons in the bot for auto-reply
    if (listing.buttons) {
      for (const btn of listing.buttons) {
        if (btn.type === "reply" && (btn.text.toLowerCase().includes("brochure") || btn.id.includes("brochure"))) {
          if (listing.brochureUrl) {
            registerBrochure(btn.id, listing.brochureUrl, listing.brochureFileName || "Brochure.pdf");
          }
        }
      }
    }

    const result = await baileysConnector.sendListing(sessionId, chatId, listing);
    res.json({ success: true, messageId: result.key.id, delay });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wabro/messages/status
router.post("/status", async (req, res) => {
  try {
    const { sessionId, text, image, contacts } = req.body;
    if (!sessionId || (!text && !image)) {
      return res.status(400).json({ error: "sessionId and (text or image) are required" });
    }

    const session = baileysConnector.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    let statusJidList = contacts;
    if (!statusJidList || statusJidList.length === 0) {
      // Fetch all non-opted-out contacts from DB
      const dbContacts = getBrokerContacts({ optedOut: false });
      statusJidList = dbContacts.map((c) => {
        const purePhone = c.phone.replace(/\D/g, "");
        return `${purePhone}@s.whatsapp.net`;
      });
    }

    if (statusJidList.length === 0) {
      return res.status(400).json({ error: "No contacts found to send status to" });
    }

    const result = await baileysConnector.sendStatus(sessionId, {
      text,
      image,
      contacts: statusJidList,
    });

    res.json({ success: true, messageId: result.key.id, recipientCount: statusJidList.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    res.status(500).json({ error: err.message });
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
