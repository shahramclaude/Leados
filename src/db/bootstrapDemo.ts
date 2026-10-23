import "dotenv/config";
import { db, pool } from "@/db";
import { metrics } from "@/db/schema";
import { runSimulation, runRollingBacktest } from "@/lib/worldModel";
import { discoverCausalGraph, runDetectionSweep } from "@/lib/causal";
import { optimizePortfolio } from "@/lib/strategy";
import { runEvalSuite } from "@/lib/evalFabric";
import { remeasureAllGates, runDailyPulse } from "@/lib/autonomy";
import { evalSuites } from "@/db/schema";

async function main() {
  console.log("Running demo pipelines end-to-end...");
  const allMetrics = await db.select().from(metrics);

  for (const m of allMetrics) {
    await runSimulation({
      metricId: m.id,
      horizonPeriods: 6,
      n: 3000,
      seed: 7,
      interventionDelta: 0,
      interventionFromPeriod: 1,
      label: "baseline",
      createdBy: "bootstrap",
    });
    const bt = await runRollingBacktest(m.id);
    console.log(`backtest ${m.key}: coverage=${(bt.coverageRate * 100).toFixed(1)}% mape=${bt.mape.toFixed(1)}%`);
  }

  const edges = await discoverCausalGraph(3);
  console.log(`causal discovery: ${edges.length} edges`);

  const incidentsCreated = await runDetectionSweep();
  console.log(`detection sweep: ${incidentsCreated} incidents created`);

  const portfolio = await optimizePortfolio();
  console.log(`portfolio: ${portfolio.selected.length} selected, ${portfolio.dropped.length} dropped`);

  const suites = await db.select().from(evalSuites);
  for (const s of suites) {
    const result = await runEvalSuite(s.id);
    console.log(`eval suite ${s.name}: ${(result.passRate * 100).toFixed(0)}% pass`);
  }

  const gates = await remeasureAllGates();
  console.log("grand gates:", gates.map((g) => `${g.gateKey}=${g.status}`).join(", "));

  const pulse = await runDailyPulse();
  console.log("daily pulse verdict:", pulse.verdict);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
