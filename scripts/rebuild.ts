// LEADOS Part 01 — `db:rebuild` equivalent (no package.json script — see
// AI-SESSION-LOG.md Part 01).
//
// Drops and recomputes ALL projections from the event log, then prints a
// before/after state-hash comparison. If projections were only ever updated
// via the synchronous-on-write path and no projector has a determinism bug,
// `before` and `after` are identical — drift is then a programming error,
// not a guess.
//
// Usage: npx tsx scripts/rebuild.ts
import "dotenv/config";
import { pool } from "@/db";
import { currentProjectionHash, rebuildProjections } from "@/lib/projections/engine";
import { ensureProjectorsRegistered } from "@/lib/projections/registerAll";

async function main() {
  ensureProjectorsRegistered();
  const before = await currentProjectionHash();
  const report = await rebuildProjections();
  const after = report.stateHash;

  console.log(`[rebuild] events replayed: ${report.totalEventsReplayed}`);
  console.log("[rebuild] per-projector:");
  for (const [name, stats] of Object.entries(report.perProjector)) {
    console.log(`  - ${name}: ${stats.entityCount} entities, ${stats.eventsApplied} events applied, last=${stats.lastEventId}`);
  }
  console.log(`[rebuild] state hash BEFORE rebuild: ${before}`);
  console.log(`[rebuild] state hash AFTER  rebuild: ${after}`);
  console.log(`[rebuild] drift: ${before === after ? "NONE (identical)" : "DETECTED — investigate a non-deterministic projector"}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[rebuild] failed:", err);
    await pool.end();
    process.exit(1);
  });
