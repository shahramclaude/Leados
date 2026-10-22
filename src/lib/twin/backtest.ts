// src/lib/twin/backtest.ts
//
// Backtest / calibration harness.
//
// HONESTY — READ BEFORE USING THIS MODULE'S OUTPUT ANYWHERE:
// There is no real historical organisational outcome data available in this
// project (see AI-SESSION-LOG.md Phase 0). This backtest CANNOT validate the
// twin against reality. What it DOES do, and all it claims to do, is a
// self-consistency / coverage calibration check:
//
//   1. Generate N synthetic "historical org states" (seeded scenario
//      variations — different org size, arrival rate, effort distribution —
//      standing in for "different periods/snapshots of an organisation").
//   2. For each one, draw a single "realized outcome" path using a seed the
//      prediction step never sees (`groundTruthSeed`).
//   3. Separately, run a prediction ensemble for the SAME scenario config
//      using disjoint seeds (`predictionSeedBase`) to get an 80% prediction
//      interval [P10, P90].
//   4. Check whether the realized value falls inside the predicted interval,
//      and report empirical coverage across all cases.
//
// If the engine's quantile machinery is implemented correctly, empirical
// coverage of an 80% PI should land close to 80% (gate: 70-90%). This is a
// calibration/engineering correctness check on the simulator, NOT evidence
// that the simulator predicts real organisations.

import type { BacktestCaseResult, BacktestReport, MetricKey, ScenarioInput } from "./types";
import { createRng, seedHash } from "./prng";
import { DEFAULT_SCENARIO } from "./simulationScenario";
import { runSingleSimulation } from "./orgSimulation";
import { runEnsemble } from "./ensemble";
import { MODEL_VERSION } from "./modelVersion";

export interface BacktestOptions {
  cases?: number;
  predictionRuns?: number;
  metric?: MetricKey;
  horizonWeeks?: number;
}

function buildCaseScenario(caseIndex: number, horizonWeeks: number): ScenarioInput {
  const rng = createRng(seedHash("backtest-case-config", caseIndex));
  return {
    ...DEFAULT_SCENARIO,
    name: `backtest-case-${caseIndex}`,
    horizonWeeks,
    orgSize: Math.round(rng.uniform(80, 180)),
    arrivalRateLambda: DEFAULT_SCENARIO.arrivalRateLambda * rng.uniform(0.75, 1.3),
    effortMeanHrs: rng.uniform(280, 520),
    wipLimit: Math.round(rng.uniform(10, 22)),
  };
}

export function runBacktest(opts: BacktestOptions = {}): BacktestReport {
  const cases = opts.cases ?? 40;
  const predictionRuns = opts.predictionRuns ?? 150;
  const metric: MetricKey = opts.metric ?? "cumulativeNetValue";
  const horizonWeeks = opts.horizonWeeks ?? 26;

  const results: BacktestCaseResult[] = [];

  for (let i = 0; i < cases; i++) {
    const scenario = buildCaseScenario(i, horizonWeeks);
    const groundTruthSeed = seedHash("backtest-truth", i);
    const predictionSeedBase = seedHash("backtest-pred", i);

    const truthRun = runSingleSimulation(scenario, groundTruthSeed, false, `truth-${i}`);
    const realized = truthRun.weeks[truthRun.weeks.length - 1][metric] as number;

    const prediction = runEnsemble(scenario, {
      runs: predictionRuns,
      seedBase: predictionSeedBase,
      useAntithetic: true,
      useControlVariate: false,
    });
    const band = prediction.bands[metric][prediction.bands[metric].length - 1];

    results.push({
      caseId: `case-${i}`,
      metric,
      realized,
      p10: band.p10,
      p50: band.p50,
      p90: band.p90,
      covered: realized >= band.p10 && realized <= band.p90,
    });
  }

  const casesCovered = results.filter((r) => r.covered).length;
  const empiricalCoveragePct = (casesCovered / cases) * 100;

  return {
    modelVersion: MODEL_VERSION,
    metric,
    nominalCoverage: 0.8,
    casesEvaluated: cases,
    casesCovered,
    empiricalCoveragePct,
    withinGate: empiricalCoveragePct >= 70 && empiricalCoveragePct <= 90,
    cases: results,
  };
}
