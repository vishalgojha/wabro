import Database from "better-sqlite3";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "wabro.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT DEFAULT 'Default',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS broker_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    inferred_areas TEXT DEFAULT '[]',
    source_groups TEXT DEFAULT '[]',
    seen_in_workspace_count INTEGER DEFAULT 1,
    opted_out INTEGER DEFAULT 0,
    opted_out_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_broker_contacts_phone ON broker_contacts(phone);
  CREATE INDEX IF NOT EXISTS idx_broker_contacts_opted_out ON broker_contacts(opted_out);

  CREATE TABLE IF NOT EXISTS broadcast_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    area TEXT DEFAULT '',
    contact_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_broadcast_lists_workspace ON broadcast_lists(workspace_id);

  CREATE TABLE IF NOT EXISTS broadcast_list_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broadcast_list_id INTEGER NOT NULL REFERENCES broadcast_lists(id),
    workspace_id TEXT NOT NULL,
    broker_contact_id INTEGER REFERENCES broker_contacts(id),
    phone TEXT NOT NULL,
    name TEXT DEFAULT '',
    area TEXT DEFAULT '',
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_blc_list ON broadcast_list_contacts(broadcast_list_id);
  CREATE INDEX IF NOT EXISTS idx_blc_workspace ON broadcast_list_contacts(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_blc_phone ON broadcast_list_contacts(phone);

  CREATE TABLE IF NOT EXISTS outreach_batches (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    recipient_hash TEXT NOT NULL,
    approval_ref TEXT NOT NULL UNIQUE,
    approval_channel TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    pacing_ms INTEGER NOT NULL DEFAULT 5000,
    input_count INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS outreach_recipients (
    batch_id TEXT NOT NULL REFERENCES outreach_batches(id),
    phone TEXT NOT NULL,
    name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    forced INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    error TEXT,
    sent_at TEXT,
    PRIMARY KEY (batch_id, phone)
  );

  CREATE INDEX IF NOT EXISTS idx_outreach_recipients_batch ON outreach_recipients(batch_id, status);
  CREATE INDEX IF NOT EXISTS idx_outreach_recipients_msgid ON outreach_recipients(message_id);

  CREATE TABLE IF NOT EXISTS outreach_send_log (
    phone TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (phone, text_hash, batch_id)
  );

  CREATE INDEX IF NOT EXISTS idx_send_log_phone_hash ON outreach_send_log(phone, text_hash, sent_at);
`);

export function upsertBrokerContacts(contacts) {
  const insert = db.prepare(`
    INSERT INTO broker_contacts (phone, name, inferred_areas, source_groups, seen_in_workspace_count)
    VALUES (@phone, @name, @inferredAreas, @sourceGroups, 1)
    ON CONFLICT(phone) DO UPDATE SET
      name = CASE WHEN @name != '' THEN @name ELSE name END,
      inferred_areas = (
        SELECT json(
          json_group_array(DISTINCT value)
        ) FROM (
          SELECT value FROM json_each(inferred_areas)
          UNION
          SELECT value FROM json_each(json(@inferredAreas))
        )
      ),
      source_groups = (
        SELECT json(
          json_group_array(DISTINCT value)
        ) FROM (
          SELECT value FROM json_each(source_groups)
          UNION
          SELECT value FROM json_each(json(@sourceGroups))
        )
      ),
      seen_in_workspace_count = seen_in_workspace_count + 1,
      opted_out = 0
  `);

  const txn = db.transaction((items) => {
    let count = 0;
    for (const item of items) {
      insert.run({
        phone: item.phone,
        name: item.name || "",
        inferredAreas: JSON.stringify(item.areas || []),
        sourceGroups: JSON.stringify(item.groups || []),
      });
      count++;
    }
    return count;
  });

  return txn(contacts);
}

export function getBrokerContacts(opts = {}) {
  const { optedOut, area, phone } = opts;
  let sql = "SELECT * FROM broker_contacts WHERE 1=1";
  const params = [];

  if (!optedOut) {
    sql += " AND opted_out = 0";
  }
  if (area) {
    sql += " AND inferred_areas LIKE ?";
    params.push(`%"${area}"%`);
  }
  if (phone) {
    sql += " AND phone = ?";
    params.push(phone);
  }

  sql += " ORDER BY seen_in_workspace_count DESC, name ASC";
  return db.prepare(sql).all(...params);
}

export function optOutBroker(phone) {
  db.prepare(`
    UPDATE broker_contacts SET opted_out = 1, opted_out_at = datetime('now')
    WHERE phone = ?
  `).run(phone);

  db.prepare(`
    DELETE FROM broadcast_list_contacts WHERE phone = ?
  `).run(phone);
}

export function createWorkspace(userId, name = "Default") {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)").run(id, userId, name);
  return id;
}

export function createUser(email, name = "") {
  const id = crypto.randomUUID();
  db.prepare("INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)").run(id, email, name);
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function getUser(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

export function getOrCreateWorkspace(userId) {
  let ws = db.prepare("SELECT * FROM workspaces WHERE user_id = ? LIMIT 1").get(userId);
  if (!ws) {
    const id = createWorkspace(userId);
    ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  }
  return ws;
}

export function generateBroadcastLists(workspaceId, userId) {
  // get all non-opted-out broker contacts
  const allContacts = getBrokerContacts({ optedOut: false });

  // group by area
  const byArea = {};
  for (const c of allContacts) {
    const areas = JSON.parse(c.inferred_areas || "[]");
    if (areas.length === 0) {
      const key = "General";
      if (!byArea[key]) byArea[key] = [];
      byArea[key].push(c);
    }
    for (const area of areas) {
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(c);
    }
  }

  // delete old broadcast_lists and contacts for this workspace
  const oldLists = db.prepare("SELECT id FROM broadcast_lists WHERE workspace_id = ?").all(workspaceId);
  for (const ol of oldLists) {
    db.prepare("DELETE FROM broadcast_list_contacts WHERE broadcast_list_id = ?").run(ol.id);
  }
  db.prepare("DELETE FROM broadcast_lists WHERE workspace_id = ?").run(workspaceId);

  // insert new lists
  const insertList = db.prepare(`
    INSERT INTO broadcast_lists (workspace_id, name, area, contact_count)
    VALUES (?, ?, ?, ?)
  `);
  const insertContact = db.prepare(`
    INSERT INTO broadcast_list_contacts (broadcast_list_id, workspace_id, broker_contact_id, phone, name, area)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    for (const [area, contacts] of Object.entries(byArea)) {
      const deduped = [];
      const seen = new Set();
      for (const c of contacts) {
        if (seen.has(c.phone)) continue;
        seen.add(c.phone);
        deduped.push(c);
      }

      const listName = `${area} Brokers`;
      const result = insertList.run(workspaceId, listName, area, deduped.length);
      const listId = result.lastInsertRowid;

      for (const c of deduped) {
        insertContact.run(listId, workspaceId, c.id, c.phone, c.name, area);
      }
    }
  });

  txn();
  return db.prepare("SELECT * FROM broadcast_lists WHERE workspace_id = ?").all(workspaceId);
}

export function getBroadcastLists(workspaceId) {
  return db.prepare("SELECT * FROM broadcast_lists WHERE workspace_id = ? ORDER BY area ASC").all(workspaceId);
}

export function getBroadcastListContacts(listId) {
  return db.prepare("SELECT * FROM broadcast_list_contacts WHERE broadcast_list_id = ?").all(listId);
}

export function getStats(workspaceId) {
  const lists = getBroadcastLists(workspaceId);
  const totalContacts = db.prepare(
    "SELECT COUNT(DISTINCT phone) as count FROM broadcast_list_contacts WHERE workspace_id = ?"
  ).get(workspaceId);

  const areaCounts = lists.length;

  return {
    total_lists: lists.length,
    total_contacts: totalContacts?.count || 0,
    total_areas: areaCounts,
  };
}


// ---- Outreach batches ----------------------------------------------------

export function createOutreachBatch({ id, text, textHash, recipientHash, approvalRef, approvalChannel, approvedAt, pacingMs, inputCount }) {
  db.prepare(`
    INSERT INTO outreach_batches
      (id, text, text_hash, recipient_hash, approval_ref, approval_channel, approved_at, pacing_ms, input_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, text, textHash, recipientHash, approvalRef, approvalChannel, approvedAt, pacingMs, inputCount || 0);
}

export function getOutreachBatch(id) {
  return db.prepare("SELECT * FROM outreach_batches WHERE id = ?").get(id);
}

export function listOutreachBatches(limit = 50) {
  return db.prepare("SELECT * FROM outreach_batches ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function setBatchStatus(id, status, opts = {}) {
  const sets = ["status = @status"];
  const params = { id, status, note: opts.note || null };
  if (opts.note) sets.push("note = @note");
  if (opts.startedAt) sets.push("started_at = COALESCE(started_at, datetime('now'))");
  if (opts.finishedAt) sets.push("finished_at = datetime('now')");
  db.prepare(`UPDATE outreach_batches SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function insertOutreachRecipient(batchId, phone, name, status, forced = false) {
  db.prepare(`
    INSERT OR IGNORE INTO outreach_recipients (batch_id, phone, name, status, forced)
    VALUES (?, ?, ?, ?, ?)
  `).run(batchId, phone, name || "", status, forced ? 1 : 0);
}

export function getOutreachRecipients(batchId) {
  return db.prepare("SELECT * FROM outreach_recipients WHERE batch_id = ? ORDER BY rowid ASC").all(batchId);
}

export function getNextPendingRecipient(batchId) {
  return db.prepare(
    "SELECT * FROM outreach_recipients WHERE batch_id = ? AND status = 'pending' ORDER BY rowid ASC LIMIT 1"
  ).get(batchId);
}

export function countPendingRecipients(batchId) {
  return db.prepare(
    "SELECT COUNT(*) AS c FROM outreach_recipients WHERE batch_id = ? AND status = 'pending'"
  ).get(batchId).c;
}

export function markRecipientSent(batchId, phone, messageId) {
  db.prepare(`
    UPDATE outreach_recipients SET status = 'sent', message_id = ?, sent_at = datetime('now')
    WHERE batch_id = ? AND phone = ?
  `).run(messageId, batchId, phone);
}

export function markRecipientFailed(batchId, phone, error) {
  db.prepare(`
    UPDATE outreach_recipients SET status = 'failed', error = ?
    WHERE batch_id = ? AND phone = ?
  `).run(error, batchId, phone);
}

// Delivery/read receipts upgrade a sent recipient; never downgrade.
export function markAckByMessageId(messageId, ackStatus) {
  if (ackStatus >= 4) {
    db.prepare(
      "UPDATE outreach_recipients SET status = 'read' WHERE message_id = ? AND status IN ('sent', 'delivered')"
    ).run(messageId);
  } else if (ackStatus >= 3) {
    db.prepare(
      "UPDATE outreach_recipients SET status = 'delivered' WHERE message_id = ? AND status = 'sent'"
    ).run(messageId);
  }
}

export function logSend(phone, textHash, batchId) {
  db.prepare(`
    INSERT OR IGNORE INTO outreach_send_log (phone, text_hash, batch_id) VALUES (?, ?, ?)
  `).run(phone, textHash, batchId);
}

export function findRecentSend(phone, textHash, sinceIso) {
  return db.prepare(`
    SELECT * FROM outreach_send_log
    WHERE phone = ? AND text_hash = ? AND sent_at >= ?
    ORDER BY sent_at DESC LIMIT 1
  `).get(phone, textHash, sinceIso);
}

export function isOptedOut(phone) {
  const row = db.prepare("SELECT opted_out FROM broker_contacts WHERE phone = ?").get(phone);
  return !!(row && row.opted_out);
}


export function getBatchByApprovalRef(ref) {
  return db.prepare("SELECT id FROM outreach_batches WHERE approval_ref = ?").get(ref);
}

// Mark a recipient as actively being sent BEFORE the attempt, so a restart
// mid-flight leaves durable evidence instead of a false "pending".
export function markRecipientSending(batchId, phone) {
  db.prepare(`
    UPDATE outreach_recipients SET status = 'sending'
    WHERE batch_id = ? AND phone = ? AND status = 'pending'
  `).run(batchId, phone);
}

// Ambiguous outcomes are parked, never retried automatically: the message
// may already have reached WhatsApp.
export function markRecipientUncertain(batchId, phone, error) {
  db.prepare(`
    UPDATE outreach_recipients SET status = 'uncertain', error = ?
    WHERE batch_id = ? AND phone = ?
  `).run(error, batchId, phone);
}

// Operator resolution of a parked recipient after checking out of band.
export function resolveUncertainRecipient(batchId, phone, outcome) {
  const current = db.prepare(
    "SELECT status FROM outreach_recipients WHERE batch_id = ? AND phone = ?"
  ).get(batchId, phone);
  if (!current) return undefined;
  if (current.status !== "uncertain") return null;
  const status = outcome === "sent" ? "sent" : "failed";
  db.prepare(`
    UPDATE outreach_recipients SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
    WHERE batch_id = ? AND phone = ?
  `).run(status, status, batchId, phone);
  return db.prepare("SELECT * FROM outreach_recipients WHERE batch_id = ? AND phone = ?").get(batchId, phone);
}

export function findUncertainPrior(phone) {
  return db.prepare(`
    SELECT r.batch_id, r.sent_at, r.error, b.created_at AS batch_created_at
    FROM outreach_recipients r JOIN outreach_batches b ON b.id = r.batch_id
    WHERE r.phone = ? AND r.status = 'uncertain'
    ORDER BY r.rowid DESC LIMIT 1
  `).get(phone);
}

// Boot reconciliation: a restart kills in-memory sender loops. Anything
// still marked sending/approved was interrupted; park it. "sending"
// recipients are uncertain (their send may have landed) and are excluded
// from any later automatic resume.
export function reconcileOutreachState() {
  const batches = db.prepare(`
    UPDATE outreach_batches SET status = 'paused', note = 'interrupted_by_restart'
    WHERE status IN ('sending', 'approved')
  `).run();
  const recipients = db.prepare(`
    UPDATE outreach_recipients SET status = 'uncertain'
    WHERE status = 'sending'
  `).run();
  return { batchesParked: batches.changes, recipientsParked: recipients.changes };
}

export function batchCounts(batchId) {
  const rows = db.prepare(
    "SELECT status, COUNT(*) AS c FROM outreach_recipients WHERE batch_id = ? GROUP BY status"
  ).all(batchId);
  const counts = {};
  for (const r of rows) counts[r.status] = r.c;
  return counts;
}

export default db;
