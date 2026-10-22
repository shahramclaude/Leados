// Lightweight STL-style seasonal decomposition: trend via centered moving
// average over one period, seasonal index via average detrended value per
// phase, residual = observed - trend - seasonal. An EWMA control chart is
// then run on the residual so that a "seasonal break" (the usual seasonal
// shape stops matching) shows up as a residual blowing through its band,
// while ordinary seasonal swings do not.

import { runEwma, type EwmaResult } from "./ewma";

export interface SeasonalDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

function centeredMovingAverage(values: number[], period: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n).fill(NaN);
  const half = Math.floor(period / 2);
  for (let t = 0; t < n; t++) {
    const start = t - half;
    const end = t + half;
    if (start < 0 || end >= n) continue;
    const window = values.slice(start, end + 1);
    out[t] = window.reduce((a, b) => a + b, 0) / window.length;
  }
  return out;
}

export function decompose(values: number[], period: number): SeasonalDecomposition {
  const n = values.length;
  const trend = centeredMovingAverage(values, period);

  const detrended: number[] = values.map((v, i) => (Number.isNaN(trend[i]) ? NaN : v - trend[i]));
  const phaseSums = new Array(period).fill(0);
  const phaseCounts = new Array(period).fill(0);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(detrended[i])) {
      const phase = i % period;
      phaseSums[phase] += detrended[i];
      phaseCounts[phase] += 1;
    }
  }
  const phaseAvg = phaseSums.map((s, i) => (phaseCounts[i] > 0 ? s / phaseCounts[i] : 0));
  // Normalize so seasonal indices sum to ~0 across a period.
  const phaseMean = phaseAvg.reduce((a, b) => a + b, 0) / period;
  const seasonalByPhase = phaseAvg.map((v) => v - phaseMean);

  const seasonal = values.map((_, i) => seasonalByPhase[i % period]);

  // Fill trend gaps at the edges with the nearest available trend value so
  // residuals are still defined there (using naive forward/back fill).
  const filledTrend = [...trend];
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(filledTrend[i])) {
      let j = i;
      while (j < n && Number.isNaN(filledTrend[j])) j++;
      if (j < n) filledTrend[i] = filledTrend[j];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isNaN(filledTrend[i])) {
      let j = i;
      while (j >= 0 && Number.isNaN(filledTrend[j])) j--;
      if (j >= 0) filledTrend[i] = filledTrend[j];
    }
  }

  const residual = values.map((v, i) => v - filledTrend[i] - seasonal[i]);

  return { trend: filledTrend, seasonal, residual };
}

export interface SeasonalEwmaResult extends EwmaResult {
  decomposition: SeasonalDecomposition;
}

// Seasonal residuals are typically lower-variance and "spikier" than raw
// series, so the residual EWMA chart uses its own tuned defaults (lambda
// 0.35, L 2.3) rather than inheriting the general-purpose EWMA defaults --
// tuned on the eval:sensing harness, see docs/eval-sensing-log.txt.
const SEASONAL_RESIDUAL_EWMA_DEFAULTS: Parameters<typeof runEwma>[1] = {
  lambda: 0.35,
  L: 2.3,
  baselineWindow: 20,
  minBaseline: 8,
};

export function runSeasonalEwma(
  values: number[],
  period: number,
  ewmaOptions?: Parameters<typeof runEwma>[1],
): SeasonalEwmaResult {
  const decomposition = decompose(values, period);
  const ewma = runEwma(decomposition.residual, { ...SEASONAL_RESIDUAL_EWMA_DEFAULTS, ...ewmaOptions });
  return { ...ewma, decomposition };
}
