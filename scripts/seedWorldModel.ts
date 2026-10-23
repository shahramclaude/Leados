// Demo/dev seed script for the Part 59 world model: creates a handful of
// metrics with ~24 months of synthetic history so the /world-model UI and
// the live (DB-backed) backtest endpoint have something real to work with.
// Run with: npm run seed:worldmodel
import "dotenv/config";
import { db, pool } from "@/db";
import { metricObservations, metrics } from "@/db/schema";
import { generateSyntheticSeries } from "@/lib/syntheticData";
import { eq } from "drizzle-orm";

const DEMO_METRICS = [
  { key: "mrr", name: "Monthly Recurring Revenue", unit: "USD", intercept: 80000, slope: 2200, noiseStd: 2500, seed: 101 },
  { key: "active-users", name: "Weekly Active Users", unit: "users", intercept: 4200, slope: 60, noiseStd: 120, seed: 202 },
  { key: "support-tickets", name: "Support Tickets Opened", unit: "tickets", intercept: 300, slope: -1.5, noiseStd: 25, seed: 303 },
];

async function main() {
  for (const spec of DEMO_METRICS) {
    const existing = await db.select().from(metrics).where(eq(metrics.key, spec.key)).limit(1);
    const metricRow =
      existing[0] ??
      (
        await db
          .insert(metrics)
          .values({ key: spec.key, name: spec.name, unit: spec.unit, description: "Seeded demo metric (synthetic)." })
          .returning()
      )[0];

    const existingObservations = await db
      .select({ id: metricObservations.id })
      .from(metricObservations)
      .where(eq(metricObservations.metricId, metricRow.id))
      .limit(1);

    if (existingObservations.length > 0) {
      console.log(`metric '${spec.key}' already has observations — skipping (append-only; re-run after a reset to reseed)`);
      continue;
    }

    const points = generateSyntheticSeries({
      n: 24,
      intercept: spec.intercept,
      slope: spec.slope,
      noiseStd: spec.noiseStd,
      seed: spec.seed,
    });

    for (const point of points) {
      await db.insert(metricObservations).values({ metricId: metricRow.id, period: point.period, value: String(point.value) });
    }
    console.log(`seeded ${points.length} observations for metric '${spec.key}'`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
