#!/usr/bin/env node
// Backup -> restore drill (docs/RUNBOOKS.md#restore-drill, Phase 4 gate 3).
//
// 1. Snapshots row counts on the live database.
// 2. Runs scripts/backup.sh to produce a checksummed pg_dump.
// 3. Runs scripts/restore.sh to restore that dump into a separate staging
//    database (never touches the live db).
// 4. Compares row counts between source and restored staging db.
// 5. Records the outcome in `backup_drills` (on the source db) so the
//    RPO/RTO claims in docs/SLO.md are evidence-backed.
import { execFileSync } from "node:child_process";
import { withClient } from "./lib/db-client.mjs";

const TABLES = [
  "work_queue_jobs",
  "agent_runs",
  "projection_state",
  "notifications",
  "audit_events",
  "trace_spans",
  "system_settings",
  "deferred_writes",
];

const STAGING_URL =
  process.env.RESTORE_TARGET_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db_restore_drill";

async function rowCounts(url) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const counts = {};
    for (const t of TABLES) {
      const { rows } = await client.query(`select count(*)::int as c from ${t}`);
      counts[t] = rows[0].c;
    }
    return counts;
  } finally {
    await client.end();
  }
}

function sh(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const out = execFileSync(cmd, args, { encoding: "utf8", env: process.env });
  process.stdout.write(out);
  return out;
}

async function main() {
  const start = Date.now();

  console.log("== Step 1: source row counts ==");
  const sourceCounts = await rowCounts(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db");
  console.log(JSON.stringify(sourceCounts, null, 2));

  console.log("\n== Step 2: run backup.sh ==");
  const backupOutput = sh("bash", ["scripts/backup.sh"]);
  const match = backupOutput.match(/\[backup\] done: (.+)$/m);
  if (!match) throw new Error("could not determine backup file path from backup.sh output");
  const backupFile = match[1].trim();

  console.log("\n== Step 3: run restore.sh into staging db ==");
  sh("bash", ["scripts/restore.sh", backupFile, STAGING_URL]);

  console.log("\n== Step 4: staging row counts ==");
  const restoredCounts = await rowCounts(STAGING_URL);
  console.log(JSON.stringify(restoredCounts, null, 2));

  const mismatches = TABLES.filter((t) => sourceCounts[t] !== restoredCounts[t]);
  const checksumMatch = mismatches.length === 0;
  const durationMs = Date.now() - start;

  console.log("\n== Step 5: compare ==");
  if (checksumMatch) {
    console.log(`PASS: row counts match for all ${TABLES.length} tables. Drill took ${durationMs}ms.`);
  } else {
    console.error(`FAIL: row count mismatch in tables: ${mismatches.join(", ")}`);
  }

  await withClient(async (client) => {
    await client.query(
      `insert into backup_drills (backup_file, source_row_counts, restored_row_counts, checksum_match, duration_ms)
       values ($1, $2, $3, $4, $5)`,
      [backupFile, JSON.stringify(sourceCounts), JSON.stringify(restoredCounts), checksumMatch, durationMs]
    );
  });

  if (!checksumMatch) process.exit(1);
}

main().catch((err) => {
  console.error("backup-drill failed:", err);
  process.exit(1);
});
