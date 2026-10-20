/**
 * Minimal linear algebra (no external dependency) sized for the small
 * design matrices causal adjustment produces (a handful of covariates,
 * hundreds to low-thousands of rows).
 */

export type Matrix = number[][];
export type Vector = number[];

export function transpose(m: Matrix): Matrix {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const out: Matrix = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out[j][i] = m[i][j];
  return out;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0].length;
  const out: Matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < cols; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

export function matVec(a: Matrix, v: Vector): Vector {
  return a.map((row) => row.reduce((sum, val, j) => sum + val * v[j], 0));
}

/** Gauss-Jordan inversion. Throws if the matrix is (numerically) singular. */
export function invert(matrix: Matrix): Matrix {
  const n = matrix.length;
  const aug: Matrix = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > maxAbs) {
        maxAbs = Math.abs(aug[r][col]);
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-10) {
      throw new Error(
        "Matrix is singular or near-singular (collinear covariates in adjustment set); cannot invert for OLS/IRLS."
      );
    }
    [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

export function mean(v: Vector): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function sd(v: Vector): number {
  const m = mean(v);
  const variance = v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1);
  return Math.sqrt(variance);
}

export function pearson(x: Vector, y: Vector): number {
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}
