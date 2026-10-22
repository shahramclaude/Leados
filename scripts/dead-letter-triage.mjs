#!/usr/bin/env node
// docs/RUNBOOKS.md#dead-letter-triage — action step.
// Lists dead-lettered jobs with their last error, then either requeues
// (--requeue) or purges (--purge) them. Default (no flag) is a dry-run report
// only, which is what you want at 3am before touching anything.
import { withClient } from "./lib/db-client.mjs";

const mode = process.argv.includes("--requeue") ? "requeue" : process.argv.includes("--purge") ? "purge" : "report";

async function main() {
  await withClient(async (client) => {
    const { rows } = await client.query(
      `select id, kind, attempts, last_error, correlation_id, created_at
       from work_queue_jobs where status = 'dead_letter' order by created_at`
    );

    if (rows.length === 0) {
      console.log("No dead-lettered jobs.");
      return;
    }

    console.log(`${rows.length} dead-lettered job(s):`);
    for (const job of rows) {
      console.log(
        ` - ${job.id} kind=${job.kind} attempts=${job.attempts} correlationId=${job.correlation_id} error="${job.last_error}"`
      );
    }

    if (mode === "report") {
      console.log('\nDry run only. Re-run with "--requeue" to retry or "--purge" to drop these jobs.');
      return;
    }

    if (mode === "requeue") {
      const { rowCount } = await client.query(
        `update work_queue_jobs
         set status = 'pending', attempts = 0, available_at = now(), last_error = null, finished_at = null
         where status = 'dead_letter'`
      );
      console.log(`Requeued ${rowCount} job(s) -> status=pending, attempts reset to 0.`);
    }

    if (mode === "purge") {
      const { rowCount } = await client.query(`delete from work_queue_jobs where status = 'dead_letter'`);
      console.log(`Purged ${rowCount} dead-lettered job(s).`);
    }
  });
}

main().catch((err) => {
  console.error("dead-letter-triage failed:", err);
  process.exit(1);
});
