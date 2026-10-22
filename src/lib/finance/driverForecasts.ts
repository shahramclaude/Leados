// Part 08 — rolling forecast: EWMA trend + month-of-year seasonality, with
// a SELF-CALIBRATED uncertainty band.
//
// Method (documented, not hidden "magic numbers"):
//   1. Seasonal index per calendar month, via ratio-to-trailing-moving-
//      -average (detrend each point against its own trailing 12-month
//      average, then average the ratio per calendar month). This avoids
//      conflating trend with seasonality the way a naive "mean of all
//      Januaries" estimate would.
//   2. Deseasonalize history, fit an EWMA level (alpha = EWMA_ALPHA) and a
//      linear drift (OLS slope of the last DRIFT_WINDOW EWMA levels).
//   3. Point forecast h months ahead: (level + dampedDrift(h)) * seasonalIndex[moy],
//      where dampedDrift decays geometrically (phi=DAMPING_PHI) so a 24-month
//      horizon flattens out instead of extrapolating a straight line forever.
//   4. Uncertainty band: rather than trusting the in-sample EWMA residual
//      (which is measured against the very smoothing that was fit to it,
//      and tends to understate true forecast error), we CALIBRATE the band
//      empirically: re-run steps 1-3 at every historical origin far enough
//      back to leave a one-step-ahead holdout, collect the realized
//      (actual - predicted) errors, and use their stdev as `residualStd`.
//      This is a simple out-of-sample ("rolling-origin") self-backtest
//      baked into the forecaster itself, which is what makes the P10/P90
//      band calibrate close to a genuine 80% interval (see
//      `scripts/finance-backtest.ts` and the coverage table in
//      AI-SESSION-LOG.md). Band width grows with sqrt(horizon) (random-walk
//      style uncertainty accumulation).

import { monthOfYear } from "./timeline";
import { Z_P80 } from "./montecarlo";

export const EWMA_ALPHA = 0.3;
export const DRIFT_WINDOW = 9;
/** Minimum history length before we trust a one-step self-backtest point. */
export const MIN_CALIBRATION_HISTORY = 13;
/** Damped-trend factor (Gardner & McKenzie damped exponential smoothing).
 * Without damping, a 24-month-ahead forecast just keeps extrapolating the
 * most recent trend in a straight line, which compounds into absurd values
 * over a 2-year horizon (e.g. services volume or headcount growing forever
 * at the same monthly rate). With phi < 1 the trend's contribution decays
 * geometrically with horizon, so forecasts flatten out rather than diverge
 * — a standard, documented technique, not a hidden fudge factor. */
export const DAMPING_PHI: number = 0.9;

/** Sum_{k=1..h} drift * phi^k = drift * phi * (1 - phi^h) / (1 - phi) */
function cumulativeDampedDrift(drift: number, h: number): number {
  if (DAMPING_PHI >= 1) return drift * h;
  return (drift * DAMPING_PHI * (1 - Math.pow(DAMPING_PHI, h))) / (1 - DAMPING_PHI);
}

export interface ForecastOptions {
  min?: number;
  max?: number;
}

export interface ForecastResult {
  values: number[];
  p10: number[];
  p90: number[];
  seasonalIndex: number[]; // index 0 = January ... index 11 = December
  level: number;
  drift: number;
  residualStd: number;
  calibrationSamples: number;
}

function seasonalIndexFromHistory(history: number[], historyStartIndex: number): number[] {
  const n = history.length;
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < n; i++) {
    const windowStart = Math.max(0, i - 11);
    const window = history.slice(windowStart, i + 1);
    if (window.length < 6) continue; // need a reasonably sized trailing baseline
    const tma = window.reduce((a, b) => a + b, 0) / window.length;
    if (tma === 0) continue;
    const moy = monthOfYear(historyStartIndex + i) - 1;
    buckets[moy].push(history[i] / tma);
  }
  const rawIndex = buckets.map((arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 1));
  const meanIndex = rawIndex.reduce((a, b) => a + b, 0) / 12;
  return rawIndex.map((v) => (meanIndex !== 0 ? v / meanIndex : 1));
}

function ewma(series: number[], alpha: number): number[] {
  const out: number[] = [];
  let level = series[0];
  for (let i = 0; i < series.length; i++) {
    level = i === 0 ? series[i] : alpha * series[i] + (1 - alpha) * level;
    out.push(level);
  }
  return out;
}

function olsSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (y[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function clamp(v: number, opts: ForecastOptions): number {
  let out = v;
  if (opts.min !== undefined) out = Math.max(opts.min, out);
  if (opts.max !== undefined) out = Math.min(opts.max, out);
  return out;
}

/** Fits level+drift+seasonality on `history` and returns the one-step
 * (h=1) point prediction. Shared by the main forecaster and its internal
 * self-backtest calibration loop so the calibration measures exactly the
 * method being used for real forecasts. */
function fitAndPredictOneStep(history: number[], historyStartIndex: number): number {
  const seasonalIndex = seasonalIndexFromHistory(history, historyStartIndex);
  const deseason = history.map((v, i) => v / (seasonalIndex[monthOfYear(historyStartIndex + i) - 1] || 1));
  const levels = ewma(deseason, EWMA_ALPHA);
  const level = levels[levels.length - 1];
  const driftWindow = levels.slice(Math.max(0, levels.length - DRIFT_WINDOW));
  const drift = olsSlope(driftWindow);
  const nextMoy = monthOfYear(historyStartIndex + history.length) - 1;
  const seasonal = seasonalIndex[nextMoy] || 1;
  return (level + cumulativeDampedDrift(drift, 1)) * seasonal;
}

/** Self-backtest: for every origin from MIN_CALIBRATION_HISTORY to the end
 * of history, predict one step ahead using only data available at that
 * origin, and collect the realized error against the held-out actual. */
function calibrateResidualStd(history: number[], historyStartIndex: number): { std: number; samples: number } {
  const errors: number[] = [];
  for (let origin = MIN_CALIBRATION_HISTORY; origin < history.length; origin++) {
    const trainHistory = history.slice(0, origin);
    const predicted = fitAndPredictOneStep(trainHistory, historyStartIndex);
    const actual = history[origin];
    errors.push(actual - predicted);
  }
  if (errors.length < 4) {
    // Not enough data for a trustworthy empirical std; fall back to a
    // conservative 15% of the mean level so bands are wide rather than
    // falsely confident.
    const meanAbs = history.reduce((a, b) => a + Math.abs(b), 0) / (history.length || 1);
    return { std: meanAbs * 0.15, samples: errors.length };
  }
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const variance = errors.reduce((a, b) => a + (b - mean) ** 2, 0) / (errors.length - 1);
  return { std: Math.sqrt(variance), samples: errors.length };
}

/**
 * Forecasts `horizon` months beyond the end of `history`.
 * `historyStartIndex` is the 0-based model month index of history[0]
 * (needed to compute calendar-month-of-year for seasonality).
 */
export function forecastDriver(
  history: number[],
  horizon: number,
  historyStartIndex: number,
  opts: ForecastOptions = {},
): ForecastResult {
  const seasonalIndex = seasonalIndexFromHistory(history, historyStartIndex);
  const deseason = history.map((v, i) => v / (seasonalIndex[monthOfYear(historyStartIndex + i) - 1] || 1));
  const levels = ewma(deseason, EWMA_ALPHA);
  const level = levels[levels.length - 1];
  const driftWindow = levels.slice(Math.max(0, levels.length - DRIFT_WINDOW));
  const drift = olsSlope(driftWindow);

  const { std: residualStd, samples: calibrationSamples } = calibrateResidualStd(history, historyStartIndex);

  const values: number[] = [];
  const p10: number[] = [];
  const p90: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const moy = monthOfYear(historyStartIndex + history.length - 1 + h) - 1;
    const seasonal = seasonalIndex[moy] || 1;
    const base = (level + cumulativeDampedDrift(drift, h)) * seasonal;
    // Uncertainty grows with sqrt(horizon) (random-walk style accumulation).
    const spread = residualStd * seasonal * Math.sqrt(h) * Z_P80;
    values.push(clamp(base, opts));
    p10.push(clamp(base - spread, opts));
    p90.push(clamp(base + spread, opts));
  }

  return { values, p10, p90, seasonalIndex, level, drift, residualStd, calibrationSamples };
}
