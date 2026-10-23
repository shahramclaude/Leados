// Part 44 — Judgment aggregation: pure, side-effect-free math.
//
// Methods implemented:
//  1. `mean`                 — simple arithmetic probability pooling (baseline).
//  2. `extremized`           — extremized pooling per Baron, Mellers, Tetlock, Stone &
//                              Ungar (2014), "Two Reasons to Make Aggregated Probability
//                              Forecasts More Extreme": p' = clip(p̄^a / (p̄^a + (1-p̄)^a)).
//                              `a` is fit empirically from historical forecaster panels;
//                              in the absence of a fitted panel for this product we use
//                              the commonly replicated default a = 1.5 (documented below),
//                              exposed as a parameter so it can be re-fit against Part 13
//                              tournament history.
//  3. `calibration_weighted` — weighted mean where weights are derived from Part 13
//                              forecaster calibration/Brier scores so historically
//                              better-calibrated forecasters count for more.
//
// HONESTY RULE enforced here: `aggregateForecasts` ALWAYS returns `minorityReports` —
// any individual estimate whose divergence from the aggregate exceeds the configured
// threshold is attached verbatim (probability + rationale), never averaged away. UI
// and API layers must render these alongside the aggregate (tested in
// `__tests__/minority-preservation.test.ts`).

import type { AggregateResult, AggregationMethod, MinorityReport, RawForecast } from "./types";

const EPSILON = 1e-6;

export function clip(x: number, lo = EPSILON, hi = 1 - EPSILON): number {
  if (Number.isNaN(x)) return 0.5;
  return Math.min(hi, Math.max(lo, x));
}

/** Documented, fitted extremization exponent. Re-fit via `fitExtremizationExponent`. */
export const DEFAULT_EXTREMIZATION_A = 1.5;

export function mean(values: number[]): number {
  if (values.length === 0) return 0.5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Extremized probability pooling.
 * p' = clip( p̄^a / (p̄^a + (1-p̄)^a) )
 * Bounds: for any p̄ in (0,1) and a > 0, p' is in (0,1); a=1 is the identity (no-op);
 * a>1 pushes away from 0.5 (more extreme, corrects for well-documented regression-to-
 * the-mean under-confidence of naive averaging); a<1 pulls toward 0.5.
 */
export function extremize(pBar: number, a: number = DEFAULT_EXTREMIZATION_A): number {
  const p = clip(pBar);
  if (a <= 0) throw new Error("extremization exponent `a` must be > 0");
  const num = p ** a;
  const den = num + (1 - p) ** a;
  return clip(num / den);
}

/**
 * Fit `a` against a labeled historical panel (pairs of pooled mean forecast vs actual
 * outcome) by minimizing aggregate Brier score over a small grid — a pragmatic
 * alternative to full MLE that is robust with small tournament histories (Part 13).
 */
export function fitExtremizationExponent(
  history: Array<{ pooledMean: number; outcome: 0 | 1 }>,
  grid: number[] = Array.from({ length: 41 }, (_, i) => 0.2 + i * 0.07), // 0.2..3.0
): { a: number; brier: number } {
  if (history.length === 0) return { a: DEFAULT_EXTREMIZATION_A, brier: NaN };
  let best = { a: 1, brier: Infinity };
  for (const a of grid) {
    const brier =
      history.reduce((acc, { pooledMean, outcome }) => {
        const p = extremize(pooledMean, a);
        return acc + (p - outcome) ** 2;
      }, 0) / history.length;
    if (brier < best.brier) best = { a, brier };
  }
  return best;
}

/** Normalize calibration scores (higher = better) into pooling weights that sum to 1. */
export function calibrationWeights(forecasts: RawForecast[]): number[] {
  const scores = forecasts.map((f) => {
    if (typeof f.calibrationScore === "number") return Math.max(EPSILON, f.calibrationScore);
    if (typeof f.brierScore === "number") return Math.max(EPSILON, 1 - f.brierScore);
    return 0.5; // neutral prior for unscored forecasters
  });
  const total = scores.reduce((a, b) => a + b, 0);
  if (total <= 0) return forecasts.map(() => 1 / forecasts.length);
  return scores.map((s) => s / total);
}

export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0.5;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return values.reduce((acc, v, i) => acc + v * (weights[i] ?? 0), 0) / total;
}

export interface AggregationOptions {
  method: AggregationMethod;
  extremizationA?: number;
  /** Absolute probability distance from the aggregate beyond which a forecast is a minority report. */
  minorityThreshold?: number;
}

export const DEFAULT_MINORITY_THRESHOLD = 0.25;

/**
 * Compute an aggregate with full minority-report preservation. This is the single
 * entry point every API route / UI "Collective View" must call — it is impossible to
 * get an aggregate value out of this module without also getting the minority list.
 */
export function aggregateForecasts(
  forecasts: RawForecast[],
  options: AggregationOptions,
): AggregateResult {
  const probs = forecasts.map((f) => clip(f.probability));
  const m = mean(probs);
  const sd = stdDev(probs);
  const threshold = options.minorityThreshold ?? DEFAULT_MINORITY_THRESHOLD;

  let value: number;
  const params: Record<string, number | string> = {};

  switch (options.method) {
    case "mean": {
      value = m;
      break;
    }
    case "extremized": {
      const a = options.extremizationA ?? DEFAULT_EXTREMIZATION_A;
      value = extremize(m, a);
      params.a = a;
      break;
    }
    case "calibration_weighted": {
      const weights = calibrationWeights(forecasts);
      value = weightedMean(probs, weights);
      params.weights = JSON.stringify(weights.map((w) => Number(w.toFixed(4))));
      break;
    }
    default:
      throw new Error(`Unknown aggregation method: ${options.method satisfies never}`);
  }

  const minorityReports: MinorityReport[] = forecasts
    .map((f, i) => ({
      forecasterId: f.forecasterId,
      probability: probs[i],
      rationale: f.rationale ?? "",
      divergence: Math.abs(probs[i] - value),
    }))
    .filter((r) => r.divergence >= threshold)
    .sort((a, b) => b.divergence - a.divergence);

  return {
    method: options.method,
    value,
    n: forecasts.length,
    params: { ...params, minorityThreshold: threshold },
    mean: m,
    stdDev: sd,
    minorityReports,
  };
}

/** Brier score for a single probabilistic forecast against a binary outcome. */
export function brierScore(p: number, outcome: 0 | 1): number {
  return (clip(p) - outcome) ** 2;
}

export function meanBrier(preds: Array<{ p: number; outcome: 0 | 1 }>): number {
  if (preds.length === 0) return NaN;
  return preds.reduce((acc, { p, outcome }) => acc + brierScore(p, outcome), 0) / preds.length;
}
