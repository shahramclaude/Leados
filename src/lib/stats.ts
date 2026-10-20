/**
 * stats.ts — shared numerical helpers used across the simulation stack:
 * quantiles (for p10/p50/p90 KPI reporting), OLS regression with R²
 * (goodness-of-fit for calibration), MAE/CRPS (backtest scoring vs naive
 * baseline), and basic descriptive stats.
 */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

export function stdDev(xs: readonly number[]): number {
  return Math.sqrt(variance(xs));
}

/** Standard error of the mean. */
export function stdErr(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return stdDev(xs) / Math.sqrt(xs.length);
}

/** Linear interpolation quantile (type-7, matches numpy default). */
export function quantile(xsIn: readonly number[], q: number): number {
  if (xsIn.length === 0) return NaN;
  const xs = [...xsIn].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  const frac = pos - lo;
  return xs[lo] * (1 - frac) + xs[hi] * frac;
}

export interface Distribution {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdErr: number;
  n: number;
}

export function summarize(xs: readonly number[]): Distribution {
  return {
    p10: quantile(xs, 0.1),
    p50: quantile(xs, 0.5),
    p90: quantile(xs, 0.9),
    mean: mean(xs),
    stdErr: stdErr(xs),
    n: xs.length,
  };
}

export interface OlsResult {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

/** Ordinary least squares for y = intercept + slope * x, with R². */
export function ols(xs: readonly number[], ys: readonly number[]): OlsResult {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0, n };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = intercept + slope * xs[i];
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

/** Mean absolute error. */
export function mae(pred: readonly number[], actual: readonly number[]): number {
  const n = Math.min(pred.length, actual.length);
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i] - actual[i]);
  return s / n;
}

/**
 * Continuous Ranked Probability Score, estimated from an ensemble of
 * samples via the standard pairwise-distance (energy-score-style)
 * approximation:
 *   CRPS(F, y) = E|X - y| - 0.5 * E|X - X'|
 * where X, X' are iid draws from the predictive ensemble.
 * Lower is better; CRPS reduces to MAE when the ensemble is a point mass.
 */
export function crps(ensemble: readonly number[], actual: number): number {
  const n = ensemble.length;
  if (n === 0) return NaN;
  let term1 = 0;
  for (let i = 0; i < n; i++) term1 += Math.abs(ensemble[i] - actual);
  term1 /= n;

  let term2 = 0;
  // O(n^2) is fine for the ensemble sizes used in backtests here (<= 500).
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) term2 += Math.abs(ensemble[i] - ensemble[j]);
  }
  term2 /= n * n;

  return term1 - 0.5 * term2;
}

/** Naive persistence baseline: forecast = last observed value, repeated. */
export function naivePersistenceForecast(history: readonly number[], horizon: number): number[] {
  const last = history.length > 0 ? history[history.length - 1] : 0;
  return new Array(horizon).fill(last);
}

/** Simple 1-D coordinate-descent / line-search minimizer (no external deps). */
export function minimizeCoordinateDescent(
  initial: number[],
  bounds: Array<[number, number]>,
  objective: (params: number[]) => number,
  opts: { rounds?: number; stepsPerDim?: number } = {},
): { params: number[]; value: number } {
  const rounds = opts.rounds ?? 6;
  const stepsPerDim = opts.stepsPerDim ?? 12;
  let params = [...initial];
  let best = objective(params);
  for (let round = 0; round < rounds; round++) {
    for (let d = 0; d < params.length; d++) {
      const [lo, hi] = bounds[d];
      let bestVal = params[d];
      let bestObj = best;
      // Shrinking search window each round for coarse-to-fine refinement.
      const span = (hi - lo) / Math.pow(2, round);
      const center = params[d];
      const windowLo = Math.max(lo, center - span);
      const windowHi = Math.min(hi, center + span);
      for (let s = 0; s <= stepsPerDim; s++) {
        const candidate = windowLo + ((windowHi - windowLo) * s) / stepsPerDim;
        const trial = [...params];
        trial[d] = candidate;
        const val = objective(trial);
        if (val < bestObj) {
          bestObj = val;
          bestVal = candidate;
        }
      }
      params[d] = bestVal;
      best = bestObj;
    }
  }
  return { params, value: best };
}
