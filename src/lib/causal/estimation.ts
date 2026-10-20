/**
 * Effect estimation, strictly downstream of identification
 * (`identification.ts`). Nothing here decides *whether* an effect is
 * identified -- it only computes numbers once the caller has already
 * confirmed an adjustment set (backdoor) or mediator set (frontdoor), or
 * has confirmed the query is NOT identifiable and only wants an
 * association-only summary.
 *
 * Methods implemented:
 *  - OLS regression adjustment
 *  - Inverse probability weighting (IPW) with a logistic propensity model
 *  - Augmented IPW / doubly-robust (AIPW), optionally cross-fitted
 *  - Pearson-correlation association-only summary (used whenever a query is
 *    not identifiable, or N is below the method's minimum)
 *  - E-value sensitivity analysis (VanderWeele & Ding, 2017)
 */

import { invert, matVec, mean, pearson, sd, transpose, type Matrix } from "./linalg";
import { mulberry32, shuffle, type Rng } from "./rng";
import type { AssociationOnly, EstimateMethod, PointEstimate, SensitivityAnalysis } from "./types";

export type Row = Record<string, number>;

// --- Minimum-N policy -------------------------------------------------
// Below these thresholds the estimator is considered unreliable (wide,
// untrustworthy confidence intervals / unstable propensity tails) and the
// caller MUST degrade to association-only even when the query is
// identifiable in principle. These are deliberately conservative rules of
// thumb (10-20 observations per estimated parameter), not derived from a
// formal power analysis for any specific LEADOS metric.
export const MINIMUM_N = {
  regression: 50,
  ipw: 100,
  "doubly-robust": 200,
  frontdoor: 150,
} as const satisfies Record<EstimateMethod, number>;

function designMatrix(rows: Row[], cols: string[], intercept: boolean): Matrix {
  return rows.map((r) => [...(intercept ? [1] : []), ...cols.map((c) => r[c] ?? 0)]);
}

export interface OlsFit {
  coefficients: number[]; // [intercept, ...cols]
  columns: string[];
  se: number[];
  residualSd: number;
}

export function ols(rows: Row[], outcome: string, cols: string[]): OlsFit {
  const X = designMatrix(rows, cols, true);
  const y = rows.map((r) => r[outcome]);
  const Xt = transpose(X);
  const XtXReal = matMulManual(Xt, X);
  const XtXInv = invert(XtXReal);
  const Xty = Xt.map((row) => row.reduce((sum, v, i) => sum + v * y[i], 0));
  const beta = matVec(XtXInv, Xty);

  const fitted = X.map((row) => row.reduce((sum, v, j) => sum + v * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const n = rows.length;
  const p = cols.length + 1;
  const sigma2 = resid.reduce((a, b) => a + b * b, 0) / Math.max(1, n - p);
  const se = XtXInv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i])));

  return {
    coefficients: beta,
    columns: ["(intercept)", ...cols],
    se,
    residualSd: Math.sqrt(sigma2),
  };
}

function matMulManual(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
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

/** Regression-adjustment ATE: coefficient on `treatment` in outcome ~ treatment + Z. */
export function regressionAdjustmentEstimate(
  rows: Row[],
  treatment: string,
  outcome: string,
  adjustmentSet: string[]
): PointEstimate {
  const fit = ols(rows, outcome, [treatment, ...adjustmentSet]);
  const idx = fit.columns.indexOf(treatment);
  const ate = fit.coefficients[idx];
  const se = fit.se[idx];
  return {
    ate,
    ci: [ate - 1.96 * se, ate + 1.96 * se],
    method: "regression",
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** IRLS logistic regression: treatment (binary) ~ covariates. */
export function logisticRegression(
  rows: Row[],
  treatment: string,
  cols: string[],
  iters = 25
): number[] {
  const X = designMatrix(rows, cols, true);
  const y = rows.map((r) => r[treatment]);
  const p = cols.length + 1;
  let beta = new Array(p).fill(0);

  for (let iter = 0; iter < iters; iter++) {
    const eta = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
    const mu = eta.map(sigmoid);
    const w = mu.map((m) => Math.max(m * (1 - m), 1e-6));

    // Weighted least squares normal equations: (X'WX) beta = X'W z
    const z = eta.map((e, i) => e + (y[i] - mu[i]) / w[i]);
    const XtWX: Matrix = Array.from({ length: p }, () => new Array(p).fill(0));
    const XtWz = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      for (let a = 0; a < p; a++) {
        XtWz[a] += X[i][a] * w[i] * z[i];
        for (let b = 0; b < p; b++) {
          XtWX[a][b] += X[i][a] * w[i] * X[i][b];
        }
      }
    }
    try {
      const inv = invert(XtWX);
      beta = matVec(inv, XtWz);
    } catch {
      break; // keep previous beta if the step becomes singular
    }
  }
  return beta;
}

export function predictPropensity(beta: number[], rows: Row[], cols: string[]): number[] {
  const X = designMatrix(rows, cols, true);
  return X.map((row) => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
}

/** Inverse-probability-weighted ATE for a binary treatment. */
export function ipwEstimate(
  rows: Row[],
  treatment: string,
  outcome: string,
  adjustmentSet: string[],
  rng: Rng = mulberry32(42)
): PointEstimate {
  const beta = logisticRegression(rows, treatment, adjustmentSet);
  const ps = predictPropensity(beta, rows, adjustmentSet).map((p) =>
    Math.min(0.98, Math.max(0.02, p))
  );

  const ate = weightedDifference(rows, treatment, outcome, ps);
  const boot: number[] = [];
  for (let b = 0; b < 200; b++) {
    const sample = bootstrapSample(rows, rng);
    const bb = logisticRegression(sample, treatment, adjustmentSet);
    const bps = predictPropensity(bb, sample, adjustmentSet).map((p) =>
      Math.min(0.98, Math.max(0.02, p))
    );
    boot.push(weightedDifference(sample, treatment, outcome, bps));
  }
  const bootSd = sd(boot);
  return { ate, ci: [ate - 1.96 * bootSd, ate + 1.96 * bootSd], method: "ipw" };
}

function weightedDifference(rows: Row[], treatment: string, outcome: string, ps: number[]): number {
  let numT = 0;
  let denT = 0;
  let numC = 0;
  let denC = 0;
  rows.forEach((r, i) => {
    const w = r[treatment] === 1 ? 1 / ps[i] : 1 / (1 - ps[i]);
    if (r[treatment] === 1) {
      numT += w * r[outcome];
      denT += w;
    } else {
      numC += w * r[outcome];
      denC += w;
    }
  });
  return numT / denT - numC / denC;
}

function bootstrapSample(rows: Row[], rng: Rng): Row[] {
  const n = rows.length;
  const out: Row[] = [];
  for (let i = 0; i < n; i++) out.push(rows[Math.floor(rng() * n)]);
  return out;
}

/**
 * Augmented inverse-probability-weighted (doubly robust) ATE, optionally
 * cross-fitted (sample-split nuisance estimation, Chernozhukov et al. 2018,
 * "Double/Debiased Machine Learning") to avoid overfitting bias from
 * reusing the same rows to fit nuisance models and evaluate the effect.
 */
export function doublyRobustEstimate(
  rows: Row[],
  treatment: string,
  outcome: string,
  adjustmentSet: string[],
  opts: { crossFit?: boolean; folds?: number } = {}
): PointEstimate & { crossFitted: boolean } {
  const crossFit = opts.crossFit ?? rows.length >= MINIMUM_N["doubly-robust"];
  const folds = opts.folds ?? 5;
  const n = rows.length;
  const phi = new Array(n).fill(0);

  const foldAssignment = Array.from({ length: n }, (_, i) => i % (crossFit ? folds : 1));

  for (let f = 0; f < (crossFit ? folds : 1); f++) {
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    foldAssignment.forEach((fa, i) => (fa === f ? testIdx.push(i) : trainIdx.push(i)));
    const trainRows = crossFit ? trainIdx.map((i) => rows[i]) : rows;
    const testRowsIdx = crossFit ? testIdx : rows.map((_, i) => i);

    const beta = logisticRegression(trainRows, treatment, adjustmentSet);
    const treated = trainRows.filter((r) => r[treatment] === 1);
    const control = trainRows.filter((r) => r[treatment] === 0);
    const fit1 = treated.length > adjustmentSet.length + 1 ? ols(treated, outcome, adjustmentSet) : null;
    const fit0 = control.length > adjustmentSet.length + 1 ? ols(control, outcome, adjustmentSet) : null;

    for (const i of testRowsIdx) {
      const row = rows[i];
      const ps = Math.min(0.98, Math.max(0.02, predictPropensity(beta, [row], adjustmentSet)[0]));
      const mu1 = fit1 ? predictOls(fit1, row, adjustmentSet) : mean(treated.map((r) => r[outcome]));
      const mu0 = fit0 ? predictOls(fit0, row, adjustmentSet) : mean(control.map((r) => r[outcome]));
      const t = row[treatment];
      phi[i] =
        mu1 -
        mu0 +
        (t * (row[outcome] - mu1)) / ps -
        ((1 - t) * (row[outcome] - mu0)) / (1 - ps);
    }
  }

  const ate = mean(phi);
  const se = sd(phi) / Math.sqrt(n);
  return { ate, ci: [ate - 1.96 * se, ate + 1.96 * se], method: "doubly-robust", crossFitted: crossFit };
}

function predictOls(fit: OlsFit, row: Row, cols: string[]): number {
  const x = [1, ...cols.map((c) => row[c] ?? 0)];
  return x.reduce((s, v, j) => s + v * fit.coefficients[j], 0);
}

/**
 * Frontdoor-criterion estimator for a single mediator M: in a linear SCM
 * where X has no direct edge to Y (frontdoor requires M to intercept every
 * directed path), the total effect of X on Y equals
 * effect(X -> M) * effect(M -> Y | adjusting for X), because adjusting for
 * X blocks the M<-...<-U->Y backdoor path (Pearl, 2009, *Causality*, ch.3.3).
 */
export function frontdoorEstimate(
  rows: Row[],
  treatment: string,
  mediator: string,
  outcome: string,
  rng: Rng = mulberry32(99)
): PointEstimate {
  const compute = (data: Row[]): number => {
    const fitM = ols(data, mediator, [treatment]);
    const a = fitM.coefficients[fitM.columns.indexOf(treatment)];
    const fitY = ols(data, outcome, [mediator, treatment]);
    const b = fitY.coefficients[fitY.columns.indexOf(mediator)];
    return a * b;
  };

  const point = compute(rows);
  const boot: number[] = [];
  for (let i = 0; i < 200; i++) {
    boot.push(compute(bootstrapSample(rows, rng)));
  }
  const bootSd = sd(boot);
  return { ate: point, ci: [point - 1.96 * bootSd, point + 1.96 * bootSd], method: "frontdoor" };
}

/** Fisher z-transform CI for a Pearson correlation. Used whenever a query is non-identifiable. */
export function associationOnly(rows: Row[], x: string, y: string): AssociationOnly {
  const xs = rows.map((r) => r[x]);
  const ys = rows.map((r) => r[y]);
  const r = pearson(xs, ys);
  const n = rows.length;
  if (n < 4) return { r, ci: [-1, 1] };
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const lo = Math.tanh(z - 1.96 * se);
  const hi = Math.tanh(z + 1.96 * se);
  return { r, ci: [lo, hi] };
}

// --- Sensitivity analysis: E-value (VanderWeele & Ding, 2017) ----------

/**
 * Converts a standardized mean difference to an approximate odds ratio via
 * Chinn's (2000) relationship (logOR = d * pi/sqrt(3)), then treats OR as a
 * stand-in for RR, which VanderWeele & Ding note is a reasonable
 * approximation when the outcome is not extremely common. This is a
 * documented approximation for continuous outcomes; for binary outcomes we
 * compute the risk ratio directly from the data instead (see `eValueBinary`).
 */
export function approxRiskRatioFromAte(ate: number, outcomeSd: number): number {
  if (outcomeSd === 0) return 1;
  const d = ate / outcomeSd;
  const logOr = d * (Math.PI / Math.sqrt(3));
  return Math.exp(logOr);
}

export function eValueFromRiskRatio(rr: number): number {
  const rrAdj = rr >= 1 ? rr : 1 / rr;
  if (rrAdj <= 1) return 1;
  return rrAdj + Math.sqrt(rrAdj * (rrAdj - 1));
}

export function sensitivityForEstimate(
  ate: number,
  outcomeValues: number[],
  ciBoundTowardsNull: number
): SensitivityAnalysis {
  const outcomeSd = sd(outcomeValues);
  const rrPoint = approxRiskRatioFromAte(ate, outcomeSd);
  const rrCi = approxRiskRatioFromAte(ciBoundTowardsNull, outcomeSd);
  return {
    eValue: eValueFromRiskRatio(rrPoint),
    eValueCi: eValueFromRiskRatio(rrCi),
    note:
      "E-value (VanderWeele & Ding, 2017): minimum confounder-treatment and confounder-outcome risk-ratio association, on the risk-ratio scale, needed to fully explain away the estimate. Continuous outcomes are converted via a standardized-effect-to-odds-ratio approximation (Chinn, 2000); treat as indicative, not exact.",
  };
}

export { shuffle };
