// scripts/evalIntelligence.ts
//
// `npm run eval:intelligence` — the gate for all future intelligence
// changes (Part 3 §8). Runs the golden dataset through every engine and
// prints a scorecard: accuracy, calibration error, latency, and coverage of
// the explainability contract. Exits non-zero if any gate fails, so it can
// be wired into CI.
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { isValidExplanation } from "../src/lib/intelligence/types";
import { explainBelief } from "../src/lib/intelligence/explain";
import { BeliefFabric } from "../src/lib/intelligence/beliefFabric";
import { runCalibrationCycle } from "../src/lib/intelligence/calibrateRules";
import { brierScore } from "../src/lib/intelligence/ruleCalibration";
import { generateAllCalibrationDatasets, generateCausalGoldenDataset, CAUSAL_GOLDEN_TRUE_EFFECT } from "../src/lib/intelligence/goldenDataset";
import { buildGtmCausalGraph } from "../src/lib/intelligence/causal";
import { estimateCausalEffect } from "../src/lib/intelligence/causalInference";
import { runMonteCarlo } from "../src/lib/intelligence/monteCarlo";
import { runScenario } from "../src/lib/intelligence/scenarioEngine";
import { generateFindings } from "../src/lib/intelligence/intelligence";
import { sampleAccounts, INTERRUPT_OPT_IN } from "../src/lib/intelligence/demoData";
import type { Finding } from "../src/lib/intelligence/types";

interface ScorecardRow {
  section: string;
  metric: string;
  value: string;
  gate: string;
  pass: boolean;
}

const rows: ScorecardRow[] = [];
let allPass = true;

function record(section: string, metric: string, value: string, gate: string, pass: boolean) {
  rows.push({ section, metric, value, gate, pass });
  if (!pass) allPass = false;
}

async function main() {
  console.log("LEADOS Intelligence Core — eval:intelligence");
  console.log(`Dataset: SYNTHETIC golden dataset (see src/lib/intelligence/goldenDataset.ts)\n`);

  // 1. Calibration: Brier score + ECE per domain, must beat "always predict
  // base rate" (Brier 0.25) by a meaningful margin, and the well-calibrated
  // control rule must show low calibration slope deviation.
  const t0 = performance.now();
  const reports = runCalibrationCycle();
  const calibrationLatency = performance.now() - t0;
  for (const report of reports) {
    const pass = report.domainBrierScore < 0.24;
    record(
      "Calibration",
      `${report.domain} Brier score`,
      report.domainBrierScore.toFixed(4),
      "< 0.24 (beats always-predict-base-rate)",
      pass,
    );
    record(
      "Calibration",
      `${report.domain} ECE`,
      report.domainExpectedCalibrationError.toFixed(4),
      "< 0.15",
      report.domainExpectedCalibrationError < 0.15,
    );
  }
  record("Calibration", "calibration cycle latency", `${calibrationLatency.toFixed(1)}ms`, "< 2000ms", calibrationLatency < 2000);

  // 2. Causal inference honesty: confounded case MUST be association-only;
  // adjusted case MUST recover an effect within a reasonable band of truth.
  const graph = buildGtmCausalGraph();
  const confounded = estimateCausalEffect(graph, generateCausalGoldenDataset(300, 1337, false), "headcount", "pipelineGenerated");
  record(
    "Causal honesty",
    "confounded case is labeled",
    confounded.kind,
    'must be "association" (never "causal")',
    confounded.kind === "association",
  );
  const adjusted = estimateCausalEffect(graph, generateCausalGoldenDataset(300, 1337, true), "headcount", "pipelineGenerated");
  const withinBand = adjusted.kind === "causal" && Math.abs(adjusted.effectPerUnit - CAUSAL_GOLDEN_TRUE_EFFECT) < 2;
  record(
    "Causal honesty",
    "adjusted estimate vs. ground truth",
    adjusted.kind === "causal" ? adjusted.effectPerUnit.toFixed(2) : "n/a",
    `within 2.0 of true effect ${CAUSAL_GOLDEN_TRUE_EFFECT}`,
    withinBand,
  );

  // 3. Forecasting: coherent predictive distribution + bounded latency.
  const t1 = performance.now();
  const forecastResult = await runMonteCarlo({
    subject: "eval-forecast",
    drivers: [{ name: "pipeline", mean: 500_000, stdDev: 80_000 }],
    trials: 5000,
    seed: 99,
  });
  const forecastLatency = performance.now() - t1;
  record(
    "Forecasting",
    "p10 <= p50 <= p90",
    `${forecastResult.distribution.p10.toFixed(0)} / ${forecastResult.distribution.p50.toFixed(0)} / ${forecastResult.distribution.p90.toFixed(0)}`,
    "monotonic ordering",
    forecastResult.distribution.p10 <= forecastResult.distribution.p50 && forecastResult.distribution.p50 <= forecastResult.distribution.p90,
  );
  record("Forecasting", "Monte Carlo latency (5000 trials)", `${forecastLatency.toFixed(1)}ms`, "< 3000ms", forecastLatency < 3000);

  // 4. Scenario simulation: counterfactual must move in the right direction.
  const hireScenario = runScenario({ name: "eval-hire", interventions: [{ type: "hire", amount: 3 }], trials: 800 });
  record("Scenario simulation", "hiring increases median revenue", hireScenario.deltaP50.toFixed(0), "> 0", hireScenario.deltaP50 > 0);

  // 5. Explainability contract coverage: every engine's public output must
  // pass isValidExplanation.
  const fabric = new BeliefFabric();
  fabric.observe("eval-belief", "eval subject", "eval", {
    source: "eval",
    evidence: { type: "metric", id: "m1", label: "m1", timestamp: new Date().toISOString() },
    successWeight: 3,
    failureWeight: 1,
  });
  const explanations = [
    explainBelief(fabric.get("eval-belief")!, "eval belief"),
    hireScenario.explanation,
    ...generateFindings(sampleAccounts(), INTERRUPT_OPT_IN).map((f: Finding) => f.explanation),
  ];
  const validCount = explanations.filter(isValidExplanation).length;
  const coverage = validCount / explanations.length;
  record(
    "Explainability contract",
    "coverage across engines",
    `${validCount}/${explanations.length} (${(coverage * 100).toFixed(0)}%)`,
    "100%",
    coverage === 1,
  );

  // Print scorecard.
  console.log("SCORECARD");
  console.log("=========");
  const bySection = new Map<string, ScorecardRow[]>();
  for (const row of rows) bySection.set(row.section, [...(bySection.get(row.section) ?? []), row]);
  for (const [section, sectionRows] of bySection.entries()) {
    console.log(`\n${section}`);
    for (const row of sectionRows) {
      console.log(`  ${row.pass ? "PASS" : "FAIL"}  ${row.metric}: ${row.value}  (gate: ${row.gate})`);
    }
  }

  const sampleBrier = brierScore(generateAllCalibrationDatasets()["rule.forecast.slipRisk"]);
  console.log(`\nSample-level control-rule Brier score: ${sampleBrier.toFixed(4)}`);
  console.log(`\nOverall: ${allPass ? "ALL GATES PASS" : "GATES FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
