import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import qrcode from "qrcode-terminal";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, ".auth");
const OUTPUT_DIR = join(__dirname, "..", "prebuilt-lists");

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "unknown";
}

function writeList(listName, contacts) {
  const filename = `${sanitizeName(listName)}.json`;
  const filepath = join(OUTPUT_DIR, filename);
  const data = { list_name: listName, source: "whatsapp", contacts };
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  -> ${filename} (${contacts.length} contacts)`);
}

function extractContactsFromChat(chat, sock) {
  const contacts = [];
  const jid = chat.id;

  if (jid.endsWith("@g.us")) {
    const metadata = chat.metadata || {};
    const participants = metadata.participants || [];
    for (const p of participants) {
      const number = p.id.split("@")[0];
      if (!number || number === sock.user?.id?.split("@")[0]) continue;
      const name = p.name || p.notify || p.verifiedName || number;
      contacts.push({ name, phone: `+91${number}`, locality: "" });
    }
  } else if (jid.endsWith("@s.whatsapp.net")) {
    const number = jid.split("@")[0];
    if (number !== sock.user?.id?.split("@")[0]) {
      const name = chat.name || chat.notify || chat.verifiedName || number;
      contacts.push({ name, phone: `+91${number}`, locality: "" });
    }
  }

  return contacts;
}

function deduplicate(contacts) {
  const seen = new Set();
  return contacts.filter((c) => {
    const key = c.phone;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  ensureDir(AUTH_DIR);
  ensureDir(OUTPUT_DIR);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "warn" }),
    browser: ["WaBro Pre-Build", "Chrome", "1.0.0"],
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("Scan the QR code below with your WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("Logged out. Delete the .auth folder and re-run.");
        process.exit(1);
      }
      console.log("Reconnecting...");
      main();
    }

    if (connection === "open") {
      console.log("\nConnected! Fetching chats...\n");

      await new Promise((r) => setTimeout(r, 2000));

      const chats = sock.chats?.all?.() || [];
      console.log(`Total chats: ${chats.length}\n`);

      let totalContacts = 0;

      for (const chat of chats) {
        const jid = chat.id;
        let listName = chat.name || chat.subject || jid.split("@")[0];

        if (jid.endsWith("@g.us")) {
          try {
            const groupMeta = await sock.groupMetadata(jid);
            chat.metadata = groupMeta;
          } catch {
            /* groups requiring admin fetch silently fail */
          }
        }

        const contacts = extractContactsFromChat(chat, sock);
        if (contacts.length === 0) continue;

        const deduped = deduplicate(contacts);
        writeList(listName, deduped);
        totalContacts += deduped.length;
      }

      console.log(`\nDone! Extracted ${totalContacts} contacts across all lists.`);
      console.log(`Lists saved to: ${OUTPUT_DIR}\n`);

      // also write an aggregate
      const allContacts = [];
      const seen = new Set();
      for (const chat of chats) {
        const jid = chat.id;
        if (jid.endsWith("@g.us")) {
          const meta = chat.metadata || {};
          const participants = meta.participants || [];
          for (const p of participants) {
            const number = p.id.split("@")[0];
            if (!number || number === sock.user?.id?.split("@")[0]) continue;
            const key = `+91${number}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const name = p.name || p.notify || p.verifiedName || number;
            allContacts.push({ name, phone: key, locality: "" });
          }
        } else if (jid.endsWith("@s.whatsapp.net")) {
          const number = jid.split("@")[0];
          if (number === sock.user?.id?.split("@")[0]) continue;
          const key = `+91${number}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const name = chat.name || chat.notify || chat.verifiedName || number;
          allContacts.push({ name, phone: key, locality: "" });
        }
      }

      writeFileSync(
        join(OUTPUT_DIR, "_all_contacts.json"),
        JSON.stringify({ list_name: "All Contacts", source: "whatsapp", contacts: allContacts }, null, 2),
      );
      console.log(`  -> _all_contacts.json (${allContacts.length} contacts, aggregate)`);

      await sock.logout();
      process.exit(0);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", () => {});
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
