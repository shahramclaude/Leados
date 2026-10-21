/**
 * scripts/eval-intelligence.ts — `npm run eval:intelligence`
 *
 * Runs the calibration harness (synthetic + synthetic-historical binary
 * scenarios, synthetic continuous scenarios) and the Monte Carlo
 * convergence check, prints a scorecard, and writes artifacts to `reports/`:
 *   reports/calibration-latest.json       (machine-readable, served by
 *                                           /api/calibration/latest)
 *   reports/calibration-reliability.csv   (10-bin reliability diagram)
 *   reports/calibration-reliability.txt   (human-readable reliability table)
 *
 * Exits non-zero if any gate fails, so it can be wired into CI (`npm run verify`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildScorecard } from "../src/lib/intelligence/calibration";
import { reliabilityBinsToCsv, reliabilityBinsToText } from "../src/lib/stats";
import { runMonteCarloScenario } from "../src/lib/intelligence/montecarlo";
import { McScenarioSpec } from "../src/lib/intelligence/workerPool";

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

async function runMonteCarloConvergenceCheck() {
  const scenario: McScenarioSpec = {
    label: "eval-harness-mc-check",
    budget: 500000,
    variables: [
      { id: "engineering", mean: 220000, sd: 35000, weight: 1 },
      { id: "vendor", mean: 150000, sd: 50000, weight: 1 },
      { id: "infra", mean: 90000, sd: 15000, weight: 1 },
      { id: "contingency-draw", mean: 20000, sd: 25000, weight: 1 },
    ],
  };
  const result = await runMonteCarloScenario({
    seed: "eval-intelligence-mc-check-v1",
    scenario,
    totalPairs: 40000,
    strategy: "inline",
  });

  const probExceedErrVsTruth = Math.abs(result.probExceed.mean - result.groundTruth.probExceed);
  const overrunErrVsTruth = Math.abs(result.expectedOverrun.mean - result.groundTruth.expectedOverrun);

  return {
    converged: result.probExceed.converged && result.expectedOverrun.converged,
    probExceed: result.probExceed,
    expectedOverrun: result.expectedOverrun,
    groundTruth: result.groundTruth,
    probExceedErrVsTruth,
    overrunErrVsTruth,
  };
}

async function main() {
  console.log("=== LEADOS eval:intelligence ===\n");

  const scorecard = buildScorecard();
  const mc = await runMonteCarloConvergenceCheck();

  console.log("--- Binary calibration (synthetic + synthetic-historical, combined) ---");
  console.log(`N                : ${scorecard.binary.n}`);
  console.log(`Brier score      : ${scorecard.binary.brierScore.toFixed(4)}  (gate: <= 0.15)  ${scorecard.gates.brierOk ? "PASS" : "FAIL"}`);
  console.log(`Log loss         : ${scorecard.binary.logLoss.toFixed(4)}`);
  console.log(`ECE (10 bins)    : ${scorecard.binary.ece.toFixed(4)}  (gate: <= 0.05)  ${scorecard.gates.eceOk ? "PASS" : "FAIL"}`);
  console.log(`Rate 80% coverage: ${pct(scorecard.rateCoverage80)}  (gate: 75-85%)  ${scorecard.gates.rateCoverageOk ? "PASS" : "FAIL"}`);
  console.log();
  console.log("Reliability diagram (bin lo-hi | n | avg confidence | avg accuracy | gap):");
  console.log(reliabilityBinsToText(scorecard.binary.bins));
  console.log();

  console.log("--- Continuous (LevelBelief) interval coverage ---");
  console.log(`Mean-interval 80% coverage      : ${pct(scorecard.levelMeanCoverage80)}  ${scorecard.gates.levelCoverageOk ? "PASS" : "FAIL"}`);
  console.log(`Predictive-interval 80% coverage: ${pct(scorecard.levelPredictiveCoverage80)} (reported, not gated)`);
  console.log();

  console.log("--- Monte Carlo convergence check (closed-form ground truth) ---");
  console.log(`P(exceed budget): MC=${pct(mc.probExceed.mean)} truth=${pct(mc.groundTruth.probExceed)} |err|=${pct(mc.probExceedErrVsTruth)} relErr=${pct(mc.probExceed.relativeError)} converged=${mc.probExceed.converged}`);
  console.log(`Expected overrun: MC=$${mc.expectedOverrun.mean.toFixed(0)} truth=$${mc.groundTruth.expectedOverrun.toFixed(0)} |err|=$${mc.overrunErrVsTruth.toFixed(0)} relErr=${pct(mc.expectedOverrun.relativeError)} converged=${mc.expectedOverrun.converged}`);
  console.log();

  const allOk = scorecard.gates.allOk && mc.converged;
  console.log(`=== SCORECARD: ${allOk ? "PASS" : "FAIL"} ===`);

  const reportsDir = path.join(process.cwd(), "reports");
  await mkdir(reportsDir, { recursive: true });

  await writeFile(
    path.join(reportsDir, "calibration-latest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        binary: scorecard.binary,
        binaryCombined: scorecard.binaryCombined,
        rateCoverage80: scorecard.rateCoverage80,
        levelMeanCoverage80: scorecard.levelMeanCoverage80,
        levelPredictiveCoverage80: scorecard.levelPredictiveCoverage80,
        gates: scorecard.gates,
        monteCarlo: {
          probExceed: mc.probExceed,
          expectedOverrun: mc.expectedOverrun,
          groundTruth: mc.groundTruth,
          converged: mc.converged,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(reportsDir, "calibration-reliability.csv"), reliabilityBinsToCsv(scorecard.binary.bins));
  await writeFile(path.join(reportsDir, "calibration-reliability.txt"), reliabilityBinsToText(scorecard.binary.bins));

  console.log(`\nArtifacts written to ${reportsDir}/`);

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
