// Generic Monte Carlo simulation engine.
//
// Historically this module was only wired into the scenario layer to turn a
// single point-probability into a distribution. Part 5 (strategic
// intelligence layer) reuses the exact same primitives for:
//   - decision outcome distributions (`simulateDecisionOutcomes`)
//   - financial runway projections (`simulateRunway`)
//   - delivery-date confidence (`simulateDeliveryConfidence`)
// so the same statistical core backs every probabilistic view in the app.

import type { Decision } from "./types";
import { toNumber } from "./types";

export interface MonteCarloResult {
  iterations: number;
  mean: number;
  median: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  /** Histogram with a fixed number of buckets across [min, max] for charting. */
  histogram: { bucketStart: number; bucketEnd: number; count: number }[];
}

/** Box-Muller transform producing a standard-normal random sample. */
function sampleStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function buildHistogram(samples: number[], buckets = 12): MonteCarloResult["histogram"] {
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const width = span / buckets;
  const counts = new Array(buckets).fill(0);
  for (const s of samples) {
    const idx = Math.min(buckets - 1, Math.floor((s - min) / width));
    counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    bucketStart: min + i * width,
    bucketEnd: min + (i + 1) * width,
    count,
  }));
}

function summarize(samples: number[]): MonteCarloResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const pct = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * n)))];
  return {
    iterations: n,
    mean,
    median: pct(0.5),
    stdDev: Math.sqrt(variance),
    p10: pct(0.1),
    p50: pct(0.5),
    p90: pct(0.9),
    min: sorted[0],
    max: sorted[n - 1],
    histogram: buildHistogram(sorted),
  };
}

/** Core driver: simulate a drift/volatility random walk `horizonSteps` ahead. */
export function runMonteCarlo(params: {
  base: number;
  volatility: number; // as a fraction, e.g. 0.3 = 30%
  drift?: number; // expected fractional change over the horizon
  iterations?: number;
}): MonteCarloResult {
  const { base, volatility, drift = 0, iterations = 1000 } = params;
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const shock = sampleStandardNormal() * volatility;
    samples.push(Math.max(0, base * (1 + drift + shock)));
  }
  return summarize(samples);
}

/**
 * Outcome distribution for a strategic decision: the "base" payoff is derived
 * from impact x probability, volatility scales with how uncertain/novel the
 * decision context is (we use optionVolatility as a stand-in).
 */
export function simulateDecisionOutcomes(
  decision: Decision,
  iterations = 1000,
): MonteCarloResult {
  const impact = toNumber(decision.impact, 3);
  const probability = toNumber(decision.probability, 0.5);
  const volatility = toNumber(decision.optionVolatility, 0.35);
  const base = impact * 20000 * probability; // heuristic expected-value baseline
  return runMonteCarlo({ base, volatility, drift: 0, iterations });
}

/** Financial runway projection: months of cash remaining under burn uncertainty. */
export function simulateRunway(params: {
  cashOnHand: number;
  monthlyBurn: number;
  burnVolatility?: number;
  iterations?: number;
}): MonteCarloResult {
  const { cashOnHand, monthlyBurn, burnVolatility = 0.2, iterations = 1000 } = params;
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const shock = sampleStandardNormal() * burnVolatility;
    const effectiveBurn = Math.max(1, monthlyBurn * (1 + shock));
    samples.push(cashOnHand / effectiveBurn);
  }
  return summarize(samples);
}

/** Delivery-date confidence: distribution of completion days for an estimate. */
export function simulateDeliveryConfidence(params: {
  estimateDays: number;
  varianceFraction?: number;
  iterations?: number;
}): MonteCarloResult {
  const { estimateDays, varianceFraction = 0.4, iterations = 1000 } = params;
  return runMonteCarlo({
    base: estimateDays,
    volatility: varianceFraction,
    drift: 0.1, // delivery dates skew late more often than early
    iterations,
  });
}
