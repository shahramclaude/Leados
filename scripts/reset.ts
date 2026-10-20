// LEADOS Part 01 — development-only hard reset.
//
// Wipes events, outbox, projection_state, and projection_checkpoints via
// TRUNCATE (the append-only trigger only forbids UPDATE/DELETE on `events`,
// not TRUNCATE — TRUNCATE is a distinct, rarer DDL-like operation, used here
// deliberately and ONLY from this script / the restore drill, never from an
// API route). Settings (including the dataset label) are left alone.
//
// Usage: npx tsx scripts/reset.ts
import "dotenv/config";
import { db } from "@/db";
import { pool } from "@/db";
import { dangerouslyTruncateEventStore } from "@/lib/platform/eventRepository";

async function main() {
  await dangerouslyTruncateEventStore(db);
  console.log("[reset] events, outbox, projection_state, projection_checkpoints truncated.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[reset] failed:", err);
    await pool.end();
    process.exit(1);
  });
