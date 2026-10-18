// monteCarlo.ts — a dependency-free Monte Carlo simulation engine.
//
// Supports correlated sampling across multiple input distributions via a
// Gaussian copula: correlated standard-normal draws are produced with a
// Cholesky decomposition of the supplied correlation matrix, then each draw
// is pushed through the standard normal CDF to get a uniform(0,1) value,
// which is finally pushed through the inverse CDF of the input's own
// distribution. This lets normal / log-normal / triangular / uniform inputs
// all be correlated consistently with one another.

export type Distribution = "normal" | "lognormal" | "triangular" | "uniform";

export interface SimInput {
  name: string;
  distribution: Distribution;
  /** mean (normal / lognormal) */
  mean?: number;
  /** standard deviation (normal / lognormal) */
  stdDev?: number;
  /** lower bound (triangular / uniform) */
  min?: number;
  /** most likely value (triangular) */
  mode?: number;
  /** upper bound (triangular / uniform) */
  max?: number;
}

export interface SimResult {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
  /** [binMidpoint, count][] suitable for drawing a histogram */
  histogram: [number, number][];
  /** Value-at-risk: how far the 5th percentile sits below the mean. */
  varAtP5: number;
  samples: number;
}

export interface SensitivityResult {
  name: string;
  low: number;
  high: number;
  /** |high - low|, i.e. how much swinging this input alone moves the output */
  effect: number;
  baseOutput: number;
}

// --- Statistics helpers -----------------------------------------------------

/** Abramowitz & Stegun 7.1.26 approximation of the error function. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF, Phi(x). */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Acklam's rational approximation of the inverse standard normal CDF
 * (probit function). Accurate to ~1.15e-9.
 */
export function normalInvCdf(p: number): number {
  const pClamped = Math.min(Math.max(p, 1e-10), 1 - 1e-10);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let q: number;
  let r: number;
  if (pClamped < pLow) {
    q = Math.sqrt(-2 * Math.log(pClamped));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (pClamped <= 1 - pLow) {
    q = pClamped - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - pClamped));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Box-Muller transform producing one standard normal sample. */
function sampleStdNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Cholesky decomposition of a symmetric positive (semi-)definite matrix. */
function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const value = matrix[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(value, 1e-12));
      } else {
        L[i][j] = (matrix[i][j] - sum) / (L[j][j] || 1e-12);
      }
    }
  }
  return L;
}

function identityMatrix(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function expectedValue(input: SimInput): number {
  switch (input.distribution) {
    case "normal":
      return input.mean ?? 0;
    case "lognormal":
      return input.mean ?? 1;
    case "triangular": {
      const min = input.min ?? 0;
      const mode = input.mode ?? (min + (input.max ?? 1)) / 2;
      const max = input.max ?? 1;
      return (min + mode + max) / 3;
    }
    case "uniform":
      return ((input.min ?? 0) + (input.max ?? 1)) / 2;
    default:
      return 0;
  }
}

/** Inverse CDF of `input`'s distribution, evaluated at uniform quantile `u`. */
function inverseCdf(input: SimInput, u: number): number {
  const uClamped = Math.min(Math.max(u, 1e-9), 1 - 1e-9);
  switch (input.distribution) {
    case "normal":
      return (input.mean ?? 0) + (input.stdDev ?? 1) * normalInvCdf(uClamped);
    case "lognormal": {
      const mean = input.mean ?? 1;
      const sd = input.stdDev ?? mean * 0.25;
      const sigma2 = Math.log(1 + (sd * sd) / (mean * mean || 1e-9));
      const sigma = Math.sqrt(Math.max(sigma2, 1e-9));
      const mu = Math.log(Math.max(mean, 1e-9)) - sigma2 / 2;
      return Math.exp(mu + sigma * normalInvCdf(uClamped));
    }
    case "triangular": {
      const min = input.min ?? 0;
      const max = input.max ?? 1;
      const mode = input.mode ?? (min + max) / 2;
      const c = (mode - min) / (max - min || 1e-9);
      if (uClamped < c) {
        return min + Math.sqrt(uClamped * (max - min) * (mode - min));
      }
      return max - Math.sqrt((1 - uClamped) * (max - min) * (max - mode));
    }
    case "uniform": {
      const min = input.min ?? 0;
      const max = input.max ?? 1;
      return min + uClamped * (max - min);
    }
    default:
      return 0;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildHistogram(values: number[], bins = 20): [number, number][] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor(((v - min) / span) * bins);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  return counts.map((count, i) => [min + (i + 0.5) * (span / bins), count]);
}

/**
 * Default aggregation: sum the (correlated) sampled value of every input.
 * Callers can supply their own `aggregate` function to combine inputs in a
 * domain-specific way (e.g. revenue - cost - risk penalty).
 */
function defaultAggregate(values: Record<string, number>): number {
  return Object.values(values).reduce((a, b) => a + b, 0);
}

export function runSimulation(
  inputs: SimInput[],
  correlationMatrix: number[][],
  n = 10000,
  aggregate: (values: Record<string, number>) => number = defaultAggregate,
): SimResult {
  const k = inputs.length;
  const matrix =
    correlationMatrix && correlationMatrix.length === k && correlationMatrix.every((row) => row.length === k)
      ? correlationMatrix
      : identityMatrix(k);
  const L = cholesky(matrix);

  const samples: number[] = new Array(n);
  for (let s = 0; s < n; s++) {
    const z = Array.from({ length: k }, () => sampleStdNormal());
    const correlated = L.map((row) => row.reduce((acc, Lij, j) => acc + Lij * z[j], 0));
    const values: Record<string, number> = {};
    inputs.forEach((input, i) => {
      const u = normalCdf(correlated[i]);
      values[input.name] = inverseCdf(input, u);
    });
    samples[s] = aggregate(values);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const m = mean(samples);
  const sd = stdDev(samples, m);
  const p5 = percentile(sorted, 0.05);

  return {
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    mean: m,
    stdDev: sd,
    histogram: buildHistogram(sorted),
    varAtP5: m - p5,
    samples: n,
  };
}

/**
 * Tornado-chart style sensitivity analysis: for each input in turn, sample
 * its distribution while holding every other input at its expected value,
 * and measure how much the target function's output swings (p10 -> p90).
 * Results are sorted by effect size, largest first.
 */
export function sensitivityAnalysis(
  baseInputs: SimInput[],
  targetFn: (values: Record<string, number>) => number,
  n = 1000,
): SensitivityResult[] {
  const baseValues: Record<string, number> = {};
  for (const input of baseInputs) baseValues[input.name] = expectedValue(input);
  const baseOutput = targetFn(baseValues);

  const results: SensitivityResult[] = baseInputs.map((input) => {
    const outputs: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const sampled = inverseCdf(input, u);
      outputs[i] = targetFn({ ...baseValues, [input.name]: sampled });
    }
    const sorted = outputs.sort((a, b) => a - b);
    const low = percentile(sorted, 0.1);
    const high = percentile(sorted, 0.9);
    return {
      name: input.name,
      low,
      high,
      effect: Math.abs(high - low),
      baseOutput,
    };
  });

  return results.sort((a, b) => b.effect - a.effect);
}
