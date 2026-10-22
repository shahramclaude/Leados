/**
 * src/lib/mathUtils.ts
 * Shared numeric primitives for the causal-inference layer.
 * Pure functions only — no I/O, no randomness except the explicit PRNG below.
 */

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return sum(xs) / xs.length;
}

export function variance(xs: number[], ddof = 1): number {
  if (xs.length <= ddof) return NaN;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - ddof);
}

export function std(xs: number[], ddof = 1): number {
  return Math.sqrt(variance(xs, ddof));
}

export function weightedMean(xs: number[], w: number[]): number {
  const wsum = sum(w);
  if (wsum === 0) return NaN;
  return sum(xs.map((x, i) => x * w[i])) / wsum;
}

export function weightedVariance(xs: number[], w: number[], ddof = 1): number {
  const wm = weightedMean(xs, w);
  const wsum = sum(w);
  const n = w.filter((x) => x > 0).length;
  if (n <= ddof) return NaN;
  const correction = wsum / Math.max(wsum - ddof * (wsum / n), 1e-9);
  return correction * (sum(xs.map((x, i) => w[i] * (x - wm) ** 2)) / wsum);
}

export function quantile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function linspace(start: number, stop: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (stop - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

/** Deterministic, seedable PRNG (mulberry32) for reproducible synthetic ground truth. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller, driven by an injected PRNG for reproducibility. */
export function randNormal(rand: () => number, mu = 0, sigma = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mu + sigma * z;
}

export function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26 approximation, max error ~1.5e-7
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

export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

/** Two-sided p-value for a z-statistic under the standard normal. */
export function zTwoSidedPValue(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function logistic(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Solve (X'X) b = X'y via Gauss-Jordan elimination. X is n x k (first column should be 1s for intercept). */
export function olsFit(X: number[][], y: number[]): { coef: number[]; fitted: number[]; residuals: number[] } {
  const n = X.length;
  const k = X[0].length;
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) {
        XtX[a][b] += X[i][a] * X[i][b];
      }
    }
  }
  const coef = solveLinearSystem(XtX, Xty);
  const fitted = X.map((row) => row.reduce((s, v, j) => s + v * coef[j], 0));
  const residuals = y.map((v, i) => v - fitted[i]);
  return { coef, fitted, residuals };
}

/** Gauss-Jordan elimination with partial pivoting + ridge fallback for near-singular systems. */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const ridge = 1e-8;
  const M = A.map((row, i) => [...row.map((v, j) => v + (i === j ? ridge : 0)), b[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) {
        maxVal = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivot = M[col][col] || 1e-12;
    for (let j = col; j <= n; j++) M[col][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

/** Standard errors of OLS coefficients under homoskedasticity. */
export function olsStandardErrors(X: number[][], residuals: number[]): number[] {
  const n = X.length;
  const k = X[0].length;
  const dof = Math.max(n - k, 1);
  const sigma2 = sum(residuals.map((r) => r * r)) / dof;
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) {
        XtX[a][b] += X[i][a] * X[i][b];
      }
    }
  }
  const inv = invertMatrix(XtX);
  return inv.map((row, i) => Math.sqrt(Math.max(sigma2 * row[i], 0)));
}

export function invertMatrix(A: number[][]): number[][] {
  const n = A.length;
  const I: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  const cols: number[][] = [];
  for (let c = 0; c < n; c++) {
    cols.push(solveLinearSystem(A, I.map((row) => row[c])));
  }
  // cols[c] is the c-th column of the inverse
  const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) inv[r][c] = cols[c][r];
  }
  return inv;
}

/** Logistic regression via simple gradient descent (sufficient for propensity scores on small/medium N). */
export function logisticRegressionFit(
  X: number[][],
  y: number[],
  opts: { iters?: number; lr?: number; l2?: number } = {},
): { coef: number[]; predict: (row: number[]) => number } {
  const { iters = 2000, lr = 0.1, l2 = 1e-4 } = opts;
  const n = X.length;
  const k = X[0].length;
  let coef = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const grad = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const pred = logistic(sum(X[i].map((v, j) => v * coef[j])));
      const err = pred - y[i];
      for (let j = 0; j < k; j++) grad[j] += err * X[i][j];
    }
    for (let j = 0; j < k; j++) {
      coef[j] -= (lr * (grad[j] / n + l2 * coef[j]));
    }
  }
  return {
    coef,
    predict: (row: number[]) => logistic(sum(row.map((v, j) => v * coef[j]))),
  };
}
