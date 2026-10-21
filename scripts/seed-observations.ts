/**
 * scripts/seed-observations.ts — seeds a small, clearly-synthetic set of
 * observations so the live /intelligence dashboard has something to fit
 * belief primitives against (otherwise every forecast correctly renders as
 * "assumed / no data yet", per the honesty rules).
 *
 * Run with: npx tsx scripts/seed-observations.ts
 */
import { db } from "../src/db";
import { observations } from "../src/db/schema";
import { Rng } from "../src/lib/prng";

async function main() {
  const rng = new Rng("leados-seed-observations-v1");
  const rows: (typeof observations.$inferInsert)[] = [];

  // task_completion_rate: ~82% true rate, 60 Bernoulli trials
  for (let i = 0; i < 60; i++) {
    rows.push({ metric: "task_completion_rate", kind: "rate", success: rng.bernoulli(0.82) });
  }

  // cycle_time_days: Normal(6.5, 1.8), 40 samples
  for (let i = 0; i < 40; i++) {
    rows.push({ metric: "cycle_time_days", kind: "level", value: Math.max(0.2, rng.normal(6.5, 1.8)) });
  }

  // weekly_engagement_score: slow upward drift over 16 weekly points
  let score = 58;
  for (let i = 0; i < 16; i++) {
    score += rng.normal(0.6, 1.4);
    rows.push({ metric: "weekly_engagement_score", kind: "drift", value: Math.round(score * 10) / 10 });
  }

  await db.insert(observations).values(rows);
  console.log(`Seeded ${rows.length} synthetic observations.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
