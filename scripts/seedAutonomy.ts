// =============================================================================
// Seed data for the Part 4 autonomous automation system.
// Run with: npx tsx scripts/seedAutonomy.ts
// =============================================================================
import "dotenv/config";
import { db, pool } from "@/db";
import { findings, goldenDatasetCases, metricReadings, rules } from "@/db/schema";

async function main() {
  console.log("Seeding autonomy demo data...");

  const [rule] = await db
    .insert(rules)
    .values({ name: "People risk threshold", domain: "people", weight: 1, threshold: 0.5 })
    .returning();
  console.log(`Created rule #${rule.id}`);

  await db.insert(goldenDatasetCases).values([
    { name: "high-severity-fires", domain: "people", input: { severity: 5 }, expectedOutcome: true },
    { name: "mid-severity-fires", domain: "people", input: { severity: 4 }, expectedOutcome: true },
    { name: "low-severity-quiet", domain: "people", input: { severity: 1 }, expectedOutcome: false },
    { name: "low-severity-quiet-2", domain: "people", input: { severity: 2 }, expectedOutcome: false },
    { name: "mid-low-boundary", domain: "people", input: { severity: 3 }, expectedOutcome: false },
  ]);
  console.log("Seeded golden dataset cases");

  const [critical] = await db
    .insert(findings)
    .values({
      domain: "people",
      severity: 5,
      title: "Key engineering lead flagged at critical flight risk",
      description: "Sentiment and workload signals both crossed critical thresholds for a single-point-of-failure role.",
      status: "open",
    })
    .returning();

  await db.insert(findings).values([
    {
      domain: "financial",
      severity: 4,
      title: "Burn rate accelerated 22% month-over-month",
      description: "Runway forecast dropped below 9 months at current spend.",
      status: "open",
    },
    {
      domain: "execution",
      severity: 2,
      title: "Milestone slipped by 3 days",
      description: "Non-blocking schedule slip on a secondary workstream.",
      status: "open",
    },
  ]);
  console.log(`Created findings, critical=#${critical.id}`);

  const now = Date.now();
  const baseline = Array.from({ length: 10 }, (_, i) => ({
    key: "org_health_score",
    value: 72 + Math.sin(i) * 1.5,
    observedAt: new Date(now - (10 - i) * 3600_000),
  }));
  baseline.push({ key: "org_health_score", value: 40, observedAt: new Date(now) }); // anomalous drop
  await db.insert(metricReadings).values(baseline);
  console.log("Seeded metric readings (with one anomalous drop)");

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
