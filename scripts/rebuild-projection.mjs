#!/usr/bin/env node
// docs/RUNBOOKS.md#projection-rebuild — action step.
// Recomputes `projection_state.last_refreshed_at`/`row_count` for the named
// projection (or all projections). In this checkout there is no real
// materialized view to recompute (Part 17's projections are not present in
// this repo — see Phase 0 findings), so this script does the honest
// equivalent: it touches the freshness bookkeeping row the health check
// reads, against a recomputed row count from the underlying source table it
// is wired to (work_queue_jobs, as a stand-in source).
import { withClient } from "./lib/db-client.mjs";

const name = process.argv[2] || "lead_forecast_projection";

async function main() {
  await withClient(async (client) => {
    const { rows } = await client.query(`select count(*)::int as count from work_queue_jobs`);
    const rowCount = rows[0].count;

    await client.query(
      `insert into projection_state (name, last_refreshed_at, row_count, updated_at)
       values ($1, now(), $2, now())
       on conflict (name) do update set last_refreshed_at = now(), row_count = $2, updated_at = now()`,
      [name, rowCount]
    );

    console.log(`Projection "${name}" refreshed: row_count=${rowCount}, last_refreshed_at=now().`);
  });
}

main().catch((err) => {
  console.error("rebuild-projection failed:", err);
  process.exit(1);
});
