// Projection rebuild — the `db:rebuild` runbook step. Safe to run any time:
// it recomputes `projection_org_stats` from `event_log` from scratch.
import "dotenv/config";
import { pool } from "../src/db";
import { refreshProjection, projectionLagSeconds } from "../src/lib/ops/projection";

async function main() {
  console.log("Rebuilding projection_org_stats from event_log...");
  const result = await refreshProjection();
  const lag = await projectionLagSeconds();
  console.log(JSON.stringify({ ...result, ...lag }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
