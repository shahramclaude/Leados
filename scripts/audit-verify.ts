#!/usr/bin/env tsx
// `npm run audit:verify` — recomputes the entire audit hash chain and exits
// non-zero if any record has been altered or deleted out of band. This is
// the command CI runs on every PR and nightly (Part 17 automation mandate),
// and the same check backing GET /api/audit/verify in the admin UI.
import "dotenv/config";
import { verifyAuditChain } from "../src/lib/auditCore";
import { pool } from "../src/db";

async function main() {
  const result = await verifyAuditChain();
  if (result.ok) {
    console.log(`audit:verify OK — ${result.recordsChecked} record(s) verified, chain intact.`);
    await pool.end();
    process.exit(0);
  } else {
    console.error(
      `audit:verify FAILED — chain broken at seq=${result.brokenAtSeq} after checking ${result.recordsChecked} record(s).`,
    );
    console.error(`reason: ${result.reason}`);
    await pool.end();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("audit:verify crashed:", err);
  await pool.end().catch(() => {});
  process.exit(2);
});
