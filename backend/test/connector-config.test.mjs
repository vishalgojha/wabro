// Regression guards for the connector configuration invariants the
// independent review called out:
//  1. ONE data-dir resolution: sidecar child env, boot restore and the
//     /api/wabro/session probe all use the exported CONNECTOR_DATA_DIR.
//  2. The sidecar child gets a minimal environment, never the backend's
//     full process.env (no secret leakage into the child).
//  3. No fixed sleep before the pairing-code request: readiness is
//     established by the connector (bounded wait on the real websocket).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "connector.js"), "utf8");

// 1. single resolution, no divergent ".." path
assert.equal(src.includes('"..", "data", "connector"'), false, "divergent ../data/connector path back");
assert.ok(src.includes('join(__dirname, "data", "connector")'), "unified data dir resolution missing");
assert.ok(/CONNECTOR_DATA_DIR,\n/.test(src) || src.includes("CONNECTOR_DATA_DIR,\n"), "spawn must pass the exported CONNECTOR_DATA_DIR");

// the exported value itself resolves next to backend/ (=> /app/data/connector in the image)
delete process.env.CONNECTOR_DATA_DIR;
process.env.CONNECTOR_SPAWN_DISABLED = "1";
const { CONNECTOR_DATA_DIR } = await import("../connector.js");
assert.equal(CONNECTOR_DATA_DIR, join(__dirname, "..", "data", "connector"));

// 2. minimal child env
assert.equal(src.includes("...process.env"), false, "child env spreads process.env");

// 3. no arbitrary pre-pairing sleep
assert.equal(/setTimeout\([^)]*1500/.test(src), false, "fixed 1500ms pre-pairing sleep back");
assert.equal(src.includes("requestPairingCode(sessionId, pairingPhone)"), true, "direct pairing request missing");

console.log("connector-config tests: ALL PASSING");
