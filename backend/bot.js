import { baileysConnector } from "./baileys.js";

// Mapping of Button ID -> Brochure URL
// In a real app, this would come from the 'listings' table in DB
const brochureStore = new Map();

export function registerBrochure(buttonId, url, fileName) {
  brochureStore.set(buttonId, { url, fileName });
}

export function initBot() {
  baileysConnector.on("message:all", async ({ sessionId, chatId, body, buttonId, fromMe }) => {
    if (fromMe) return;

    // 1. Handle "Download Brochure" button click
    if (buttonId && brochureStore.has(buttonId)) {
      const { url, fileName } = brochureStore.get(buttonId);
      console.log(`Bot: Sending brochure ${fileName} to ${chatId}`);
      await baileysConnector.sendDocument(sessionId, chatId, url, fileName);
      return;
    }

    // 2. Handle keyword "Brochure" in text
    if (body && body.toLowerCase().includes("brochure")) {
      // Find the most recent listing sent to this chat
      // For now, just send a generic one if exists
      const entries = Array.from(brochureStore.entries());
      if (entries.length > 0) {
        const { url, fileName } = entries[entries.length - 1][1];
        await baileysConnector.sendDocument(sessionId, chatId, url, fileName);
      }
    }
  });
}

// Helper to bridge the 'message:${sessionId}' to a global 'message:all'
const originalStartSession = baileysConnector.startSession;
baileysConnector.startSession = async function(sessionId) {
    const res = await originalStartSession.call(this, sessionId);
    this.on(`message:${sessionId}`, (data) => {
        this.emit("message:all", { ...data, sessionId });
    });
    return res;
};
