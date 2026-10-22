// src/lib/twin/ensemble.ts
//
// Ensemble aggregation: runs N simulations with seeded streams, applies
// antithetic pairing and a control-variate variance-reduction diagnostic, and
// aggregates into P10/P50/P90 bands per metric per week.
//
// Variance reduction, precisely:
//  - Antithetic pairs: for each pair index i we run the model twice with the
//    SAME seed, once normal and once with every uniform draw mirrored
//    (u -> 1-u). The pair's trajectories are averaged week-by-week into one
//    "logical run" before percentiles are computed. For any monotone
//    response to the underlying uniforms this reduces variance of the
//    cross-run mean without changing its expectation.
//  - Control variate: `totalArrivals` (sum of Poisson arrivals over the
//    horizon) has a known analytic expectation (sum of the scenario's
//    per-week arrival rate). We use it as a control variate on the
//    cumulative net value metric: adjustedMean = rawMean - c*(X̄-E[X]) with
//    c = Cov(Y,X)/Var(X) estimated from the ensemble itself. This is reported
//    as a diagnostic (`controlVariateDiagnostics`) alongside the raw mean; it
//    does NOT alter the P10/P50/P90 bands (control variates target the mean
//    estimator, not order statistics — adjusting quantiles directly would be
//    dishonest post-hoc smoothing).

import type {
  ControlVariateDiagnostics,
  EnsembleResult,
  MetricKey,
  PercentileSeriesPoint,
  ScenarioInput,
  SimulationRunResult,
  WeeklyMetrics,
} from "./types";
import { seedHash } from "./prng";
import { runBatch, type RunSpec } from "./monteCarloWorker";
import { MODEL_VERSION } from "./modelVersion";
import { scenarioHash as computeScenarioHash } from "./simulationScenario";
import type { ShockEvent } from "./types";

export const METRIC_KEYS: MetricKey[] = [
  "backlogLength",
  "completedThisWeek",
  "cascadeActivatedFraction",
  "avgFatigue",
  "avgMotivation",
  "netValueThisWeek",
  "cumulativeNetValue",
  "activeHeadcount",
];

export interface EnsembleOptions {
  runs?: number;
  seedBase?: number;
  useAntithetic?: boolean;
  useControlVariate?: boolean;
  onProgress?: (completed: number, total: number) => void;
  isCancelled?: () => boolean;
}

export interface RunPlan {
  specs: RunSpec[];
  pairKeys: string[][]; // groups of runIds that form one logical run (1 or 2 members)
  hash: string;
}

export function buildEnsemblePlan(
  scenario: ScenarioInput,
  runs: number,
  seedBase: number,
  useAntithetic: boolean,
): RunPlan {
  const hash = computeScenarioHash(scenario);
  const { specs, pairKeys } = buildRunSpecs(scenario, hash, { runs, seedBase, useAntithetic });
  return { specs, pairKeys, hash };
}

function buildRunSpecs(scenario: ScenarioInput, hash: string, opts: Required<Pick<EnsembleOptions, "runs" | "seedBase" | "useAntithetic">>): {
  specs: RunSpec[];
  pairKeys: string[][]; // groups of runIds that form one logical run (1 or 2 members)
} {
  const specs: RunSpec[] = [];
  const pairKeys: string[][] = [];
  if (opts.useAntithetic) {
    const pairs = Math.ceil(opts.runs / 2);
    for (let i = 0; i < pairs; i++) {
      const seed = seedHash(hash, opts.seedBase, "pair", i);
      const idA = `run-${i}-a`;
      const idB = `run-${i}-b`;
      specs.push({ runId: idA, seed, antithetic: false });
      specs.push({ runId: idB, seed, antithetic: true });
      pairKeys.push([idA, idB]);
    }
  } else {
    for (let i = 0; i < opts.runs; i++) {
      const seed = seedHash(hash, opts.seedBase, "run", i);
      const id = `run-${i}`;
      specs.push({ runId: id, seed, antithetic: false });
      pairKeys.push([id]);
    }
  }
  return { specs, pairKeys };
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function metricValue(m: WeeklyMetrics, key: MetricKey): number {
  return m[key] as number;
}

function analyticExpectedArrivals(scenario: ScenarioInput): number {
  // Walk the deterministic multiplier schedule (demand surges are known in
  // advance) to get an exact analytic E[sum of Poisson arrivals].
  let arrivalMultiplier = 1;
  let expiresWeek: number | null = null;
  let total = 0;
  const surges = scenario.shocks.filter((s): s is Extract<ShockEvent, { type: "demandSurge" }> => s.type === "demandSurge");
  for (let week = 1; week <= scenario.horizonWeeks; week++) {
    if (expiresWeek !== null && week >= expiresWeek) {
      arrivalMultiplier = 1;
      expiresWeek = null;
    }
    const due = surges.find((s) => s.weekApplied === week);
    if (due) {
      arrivalMultiplier = due.arrivalMultiplier;
      expiresWeek = week + due.durationWeeks;
    }
    total += scenario.arrivalRateLambda * scenario.demandMultiplier * arrivalMultiplier;
  }
  return total;
}

export function runEnsemble(scenario: ScenarioInput, opts: EnsembleOptions = {}): EnsembleResult {
  const start = Date.now();
  const runs = opts.runs ?? scenario.ensembleRuns;
  const seedBase = opts.seedBase ?? scenario.seedBase;
  const useAntithetic = opts.useAntithetic ?? true;
  const useControlVariate = opts.useControlVariate ?? true;
  const { specs, pairKeys, hash } = buildEnsemblePlan(scenario, runs, seedBase, useAntithetic);

  const BATCH_SIZE = 250;
  const allResults = new Map<string, SimulationRunResult>();
  let cancelled = false;
  for (let i = 0; i < specs.length; i += BATCH_SIZE) {
    if (opts.isCancelled?.()) {
      cancelled = true;
      break;
    }
    const batch = specs.slice(i, i + BATCH_SIZE);
    const batchResults = runBatch(scenario, batch);
    for (const r of batchResults) allResults.set(r.runId, r);
    opts.onProgress?.(Math.min(specs.length, i + batch.length), specs.length);
  }

  return aggregateEnsemble(scenario, {
    hash,
    pairKeys,
    allResults,
    runs,
    seedBase,
    useAntithetic,
    useControlVariate,
    cancelled,
    durationMs: Date.now() - start,
  });
}

export interface AggregateInput {
  hash: string;
  pairKeys: string[][];
  allResults: Map<string, SimulationRunResult>;
  runs: number;
  seedBase: number;
  useAntithetic: boolean;
  useControlVariate: boolean;
  cancelled: boolean;
  durationMs: number;
}

export function aggregateEnsemble(scenario: ScenarioInput, input: AggregateInput): EnsembleResult {
  const { hash, pairKeys, allResults, runs, seedBase, useAntithetic, useControlVariate, cancelled, durationMs } = input;

  // IMPORTANT: percentile bands (P10/P50/P90) are computed from every RAW,
  // INDIVIDUAL run's trajectory — never from antithetic-pair AVERAGES. A
  // pair's average has structurally smaller spread than a genuine single
  // future draw (that's the whole point of antithetic variance reduction),
  // so using paired averages as the "samples" for quantile estimation would
  // make the predictive bands artificially narrow and under-cover realized
  // outcomes (caught by the backtest gate — see AI-SESSION-LOG.md). Antithetic
  // pairing is instead used ONLY for the separate mean-variance-reduction
  // diagnostic below (`antitheticDiagnostics`), which is the estimator it is
  // actually valid for.
  const rawRuns: SimulationRunResult[] = Array.from(allResults.values());
  const runsCompleted = rawRuns.length;

  const bands: Record<MetricKey, PercentileSeriesPoint[]> = {} as Record<MetricKey, PercentileSeriesPoint[]>;
  const finalValues: Record<MetricKey, number[]> = {} as Record<MetricKey, number[]>;

  for (const key of METRIC_KEYS) {
    const horizon = scenario.horizonWeeks;
    const seriesBands: PercentileSeriesPoint[] = [];
    for (let w = 0; w < horizon; w++) {
      const values = rawRuns.map((r) => metricValue(r.weeks[w], key)).sort((a, b) => a - b);
      seriesBands.push({
        week: w + 1,
        p10: percentile(values, 0.1),
        p50: percentile(values, 0.5),
        p90: percentile(values, 0.9),
        mean: avg(values),
      });
    }
    bands[key] = seriesBands;
    finalValues[key] = rawRuns.map((r) => metricValue(r.weeks[horizon - 1], key));
  }

  // Control variate diagnostic on cumulativeNetValue using totalArrivals,
  // computed over the raw per-run sample (targets the MEAN estimator only;
  // does not touch the bands above).
  let controlVariateDiagnostics: ControlVariateDiagnostics | null = null;
  if (useControlVariate && runsCompleted > 1) {
    const Y = finalValues.cumulativeNetValue;
    const X = rawRuns.map((r) => r.totalArrivals);
    const meanY = avg(Y);
    const meanX = avg(X);
    const covXY = avg(Y.map((y, i) => (y - meanY) * (X[i] - meanX)));
    const varX = avg(X.map((x) => (x - meanX) ** 2));
    const c = varX > 0 ? covXY / varX : 0;
    const expectedX = analyticExpectedArrivals(scenario);
    const adjusted = Y.map((y, i) => y - c * (X[i] - expectedX));
    const rawStdErr = stdErr(Y);
    const adjustedStdErr = stdErr(adjusted);
    controlVariateDiagnostics = {
      metric: "cumulativeNetValue",
      instrument: "totalArrivals",
      rawMean: meanY,
      rawStdErr,
      adjustedMean: avg(adjusted),
      adjustedStdErr,
      varianceReductionPct: rawStdErr > 0 ? (1 - adjustedStdErr / rawStdErr) * 100 : 0,
    };
  }

  // Antithetic mean-variance-reduction diagnostic: compare the std err of the
  // mean treating every run as independent vs. the std err of the mean of
  // paired averages (the valid antithetic estimator).
  let antitheticDiagnostics: EnsembleResult["antitheticDiagnostics"] = null;
  if (useAntithetic) {
    const pairedMeans: number[] = [];
    for (const group of pairKeys) {
      const members = group.map((id) => allResults.get(id)).filter((r): r is SimulationRunResult => !!r);
      if (members.length === 0) continue;
      const horizon = scenario.horizonWeeks;
      const vals = members.map((m) => metricValue(m.weeks[horizon - 1], "cumulativeNetValue"));
      pairedMeans.push(avg(vals));
    }
    if (pairedMeans.length > 1) {
      const independentStdErr = stdErr(finalValues.cumulativeNetValue);
      const pairedStdErr = stdErr(pairedMeans);
      antitheticDiagnostics = {
        metric: "cumulativeNetValue",
        pairs: pairedMeans.length,
        independentStdErr,
        pairedStdErr,
        varianceReductionPct: independentStdErr > 0 ? (1 - pairedStdErr / independentStdErr) * 100 : 0,
      };
    }
  }

  return {
    scenarioHash: hash,
    modelVersion: MODEL_VERSION,
    seedBase,
    runsRequested: runs,
    runsCompleted,
    antitheticPairs: useAntithetic,
    controlVariateApplied: useControlVariate,
    controlVariateMetric: controlVariateDiagnostics?.metric ?? null,
    durationMs,
    bands,
    finalValues,
    cancelled,
    controlVariateDiagnostics,
    antitheticDiagnostics,
  };
}

function stdErr(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  const variance = xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance / xs.length);
}
