// src/lib/monteCarlo.ts
//
// Server-side Monte Carlo revenue/runway forecast engine. This module is
// imported ONLY from API route handlers (src/app/api/metrics/forecast) and
// from src/lib/forecastCache.ts — never from a client component — so it
// never ends up in the browser bundle. The client reaches the same
// algorithm two ways, both off the main thread:
//   1. Normal case: calls the API route (this file runs on the server).
//   2. Interactive what-if slider: src/lib/computeWorkerPool.ts dispatches
//      to src/workers/computeWorker.ts, which has its OWN self-contained
//      copy of the simulation loop (workers can't import server-only code,
//      and bundling this file into a worker would defeat the point of
//      keeping it out of client bundles). Keep the two in sync by hand if
//      the formula changes — see the header comment in computeWorker.ts.
import { mulberry32, sampleStandardNormal } from "./mathUtils";
import { buildHistogram, summarizeDistribution, type DistributionSummary, type HistogramBucket } from "./stats";

export interface ForecastInput {
  currentValue: number;
  meanGrowthRate: number;
  growthVolatility: number;
  periods: number;
  trials: number;
  seed: number;
}

export interface ForecastResult {
  input: ForecastInput;
  summary: DistributionSummary;
  histogram: HistogramBucket[];
  path: { p10: number[]; p50: number[]; p90: number[] };
  computeMs: number;
}

/** Runs `trials` independent geometric-random-walk paths and returns distribution + percentile fan. */
export function runMonteCarloForecast(input: ForecastInput): ForecastResult {
  const start = performance.now();
  const { currentValue, meanGrowthRate, growthVolatility, periods, trials, seed } = input;
  const rand = mulberry32(seed);

  const finalValues = new Array<number>(trials);
  // periodSnapshots[t][trial] — only kept for a bounded number of periods so
  // memory stays O(periods * trials) and not accidentally unbounded.
  const periodSnapshots: number[][] = Array.from({ length: periods }, () => new Array(trials));

  for (let trial = 0; trial < trials; trial++) {
    let value = currentValue;
    for (let t = 0; t < periods; t++) {
      const z = sampleStandardNormal(rand);
      const rate = meanGrowthRate + z * growthVolatility;
      value = Math.max(0, value * (1 + rate));
      periodSnapshots[t][trial] = value;
    }
    finalValues[trial] = value;
  }

  const path = { p10: new Array<number>(periods), p50: new Array<number>(periods), p90: new Array<number>(periods) };
  for (let t = 0; t < periods; t++) {
    const summary = summarizeDistribution(periodSnapshots[t]);
    path.p10[t] = summary.p10;
    path.p50[t] = summary.p50;
    path.p90[t] = summary.p90;
  }

  return {
    input,
    summary: summarizeDistribution(finalValues),
    histogram: buildHistogram(finalValues, 16),
    path,
    computeMs: +(performance.now() - start).toFixed(2),
  };
}
