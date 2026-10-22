#!/usr/bin/env node
// docs/RUNBOOKS.md#stuck-run — action step.
// Finds agent_runs stuck in "running" past the stuck-run threshold and marks
// them "timed_out" so the health check clears and downstream consumers stop
// waiting on them forever.
import { withClient } from "./lib/db-client.mjs";

const STUCK_THRESHOLD_MINUTES = Number(process.env.STUCK_THRESHOLD_MINUTES || 10);

async function main() {
  await withClient(async (client) => {
    const { rows: stuck } = await client.query(
      `select id, kind, started_at, correlation_id from agent_runs
       where status = 'running' and started_at < now() - ($1 || ' minutes')::interval`,
      [STUCK_THRESHOLD_MINUTES]
    );

    if (stuck.length === 0) {
      console.log(`No runs stuck past ${STUCK_THRESHOLD_MINUTES} minutes.`);
      return;
    }

    console.log(`Found ${stuck.length} stuck run(s):`);
    for (const run of stuck) {
      console.log(` - ${run.id} kind=${run.kind} started_at=${run.started_at.toISOString()} correlationId=${run.correlation_id}`);
    }

    const { rowCount } = await client.query(
      `update agent_runs
       set status = 'timed_out', finished_at = now(), error = 'reaped by scripts/run-reaper.mjs: exceeded ${STUCK_THRESHOLD_MINUTES}m running threshold'
       where status = 'running' and started_at < now() - ($1 || ' minutes')::interval`,
      [STUCK_THRESHOLD_MINUTES]
    );

    console.log(`Reaped ${rowCount} run(s) -> status=timed_out.`);
  });
}

main().catch((err) => {
  console.error("run-reaper failed:", err);
  process.exit(1);
});
