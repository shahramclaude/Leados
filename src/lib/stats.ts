import { mean, stdDev } from "./math";

// ---------------------------------------------------------------------------
// stats.ts — regression, correlation and seasonality detection primitives.
// ---------------------------------------------------------------------------

export interface OLSResult {
  slope: number;
  intercept: number;
  r2: number;
}

/**
 * Ordinary least squares regression of `series` against its index (0..n-1).
 * Standard textbook OLS — not derived from any file in this repo.
 */
export function olsRegression(series: number[]): OLSResult {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? series[0] : 0, r2: 0 };

  const xs = series.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(series);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = series[i] - yMean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  return { slope, intercept, r2 };
}

/**
 * Standard Pearson correlation coefficient:
 *   r = (n*Σxy - Σx*Σy) / sqrt((n*Σx² - (Σx)²) * (n*Σy² - (Σy)²))
 * Textbook derivation, not from any file in this repo.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export interface SeasonalitySignal {
  hasSeasonality: boolean;
  period: number;
  amplitude: number;
  noiseFloor: number;
}

/**
 * Detects a dominant seasonal period using a brute-force discrete Fourier
 * transform over candidate periods (weekly=7, bi-weekly=14, monthly=30,
 * quarterly=90). Returns the candidate period with the largest amplitude,
 * and flags seasonality when that amplitude exceeds the noise floor
 * (mean amplitude across all candidate periods) by a configurable factor.
 *
 * This is a simple, explicit implementation (not an FFT library) chosen for
 * transparency — DESIGN PARAMETER: noiseThreshold multiplier default 1.5.
 */
export function detectSeasonality(
  series: number[],
  noiseThreshold = 1.5,
): SeasonalitySignal {
  const n = series.length;
  const candidatePeriods = [7, 14, 30, 90].filter((p) => n >= p * 2);

  if (candidatePeriods.length === 0) {
    return { hasSeasonality: false, period: 0, amplitude: 0, noiseFloor: 0 };
  }

  const amplitudes: { period: number; amplitude: number }[] = [];

  for (const period of candidatePeriods) {
    let real = 0;
    let imag = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * t) / period;
      real += series[t] * Math.cos(angle);
      imag += series[t] * Math.sin(angle);
    }
    const amplitude = (2 / n) * Math.sqrt(real * real + imag * imag);
    amplitudes.push({ period, amplitude });
  }

  const noiseFloor = mean(amplitudes.map((a) => a.amplitude));
  const best = amplitudes.reduce((a, b) => (b.amplitude > a.amplitude ? b : a));

  return {
    hasSeasonality: best.amplitude > noiseThreshold * noiseFloor,
    period: best.period,
    amplitude: best.amplitude,
    noiseFloor,
  };
}

export interface RollingStats {
  mean: number;
  stdDev: number;
}

/** Rolling mean/stdDev over the trailing `window` points ending at index `endIndexExclusive`. */
export function rollingStats(
  series: number[],
  endIndexExclusive: number,
  window: number,
): RollingStats {
  const start = Math.max(0, endIndexExclusive - window);
  const slice = series.slice(start, endIndexExclusive);
  if (slice.length === 0) return { mean: 0, stdDev: 0 };
  return { mean: mean(slice), stdDev: stdDev(slice) };
}
