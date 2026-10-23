#!/usr/bin/env node
/**
 * check-ledger.mjs
 * ------------------------------------------------------------------
 * Lightweight, honest static check over src/data/mockData.ts.
 *
 * This is intentionally NOT a semantic type-checked validator — it is a
 * plain-text regex scan. That limitation is disclosed here rather than
 * hidden: it catches structural mistakes (missing proof, bad status
 * values, an empty ledger) but it cannot verify that a "verified" claim
 * is actually true. Truth of each claim is established by a human
 * reading docs/EVIDENCE-LEDGER.md next to the real gate output in
 * docs/PROGRAM-COMPLETION-REPORT.md, not by this script alone.
 * ------------------------------------------------------------------
 */
import { readFileSync } from "node:fs";

const file = "src/data/mockData.ts";
const src = readFileSync(file, "utf8");

const ledgerMatch = src.match(/export const ledgerClaims: LedgerClaim\[\] = \[([\s\S]*?)\n\];/);
if (!ledgerMatch) {
  console.error("FAIL: could not locate ledgerClaims array in", file);
  process.exit(1);
}

const body = ledgerMatch[1];
const entries = body.split(/\},\s*\n?\s*\{/).length; // rough count
const statuses = [...body.matchAll(/status:\s*"(verified|simulated|planned)"/g)].map((m) => m[1]);
const proofs = [...body.matchAll(/proof:\s*"/g)];
const ids = [...body.matchAll(/id:\s*"(L\d+)"/g)].map((m) => m[1]);

let failed = false;

if (statuses.length === 0) {
  console.error("FAIL: no ledger claims found.");
  failed = true;
}

if (proofs.length !== statuses.length) {
  console.error(`FAIL: ${statuses.length} claims but ${proofs.length} proof fields — every claim must carry proof.`);
  failed = true;
}

const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length > 0) {
  console.error("FAIL: duplicate ledger claim ids:", dupes.join(", "));
  failed = true;
}

const verifiedCount = statuses.filter((s) => s === "verified").length;
const simulatedCount = statuses.filter((s) => s === "simulated").length;
const plannedCount = statuses.filter((s) => s === "planned").length;

console.log(`Ledger claims found: ${statuses.length} (expected entries ~${entries})`);
console.log(`  verified:  ${verifiedCount}`);
console.log(`  simulated: ${simulatedCount}`);
console.log(`  planned:   ${plannedCount}`);

if (failed) {
  console.error("\nledger:check FAILED");
  process.exit(1);
}

console.log("\nledger:check PASSED (structural check only — see docs/EVIDENCE-LEDGER.md for human-verified truth status)");
