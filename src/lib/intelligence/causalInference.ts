// src/lib/intelligence/causalInference.ts
//
// Honest causal inference (Part 3 §4). The output TYPE distinguishes
// correlation from causation — callers (and the UI) cannot accidentally
// treat one as the other because they are different discriminated-union
// members (`kind: "association"` vs `kind: "causal"`).
//
// Identification strategy: the back-door criterion (Pearl, "Causality",
// 2009, §3.3.1). Given a causal graph, a treatment X and outcome Y:
//   - Find common causes ("confounders") of X and Y implied by the graph.
//   - If every confounder is measured and included in the adjustment set,
//     the back-door criterion is satisfied: regression-adjusting for that
//     set identifies the causal effect under linearity (this is the
//     standard "adjustment formula" implementation of do-calculus for
//     linear SCMs: E[Y | do(X=x)] = E[Y | X=x, Z] averaged over Z).
//   - If any confounder is NOT measured, identification fails. We refuse to
//     label the estimate causal and fall back to an association-only
//     estimate, explicitly naming the unmeasured confounder(s).
import { CausalGraph, parents, directedPaths } from "./causal";

export interface AssociationEstimate {
  kind: "association";
  treatment: string;
  outcome: string;
  /** Pearson correlation coefficient, for reference only */
  correlation: number;
  /** naive (unadjusted) OLS slope — explicitly NOT a causal effect */
  effectPerUnit: number;
  interval: { low: number; high: number; level: number };
  sampleSize: number;
  reason: string;
  confounderWarnings: string[];
}

export interface CausalEstimate {
  kind: "causal";
  treatment: string;
  outcome: string;
  /** back-door-adjusted effect of a one-unit change in treatment on outcome */
  effectPerUnit: number;
  interval: { low: number; high: number; level: number };
  sampleSize: number;
  identification: "backdoor-adjustment" | "no-confounding-assumed";
  adjustmentSet: string[];
  /** every assumption this causal claim depends on — stated, not implied */
  assumptions: string[];
  confounderWarnings: string[];
}

export type CausalFinding = AssociationEstimate | CausalEstimate;

export interface CausalDataRow {
  [variable: string]: number;
}

/** Finds nodes that are (a) direct parents of the treatment in the graph and
 * (b) ancestors of the outcome (i.e. plausible common causes), per the
 * graph's declared edges. This is a graph-based confounder search, not a
 * statistical test — the standing order requires stated assumptions, and
 * "the graph is correct" is the assumption we state explicitly in output. */
function findConfounders(graph: CausalGraph, treatment: string, outcome: string): string[] {
  const treatmentParents = parents(graph, treatment);
  return treatmentParents.filter((p) => directedPaths(graph, p, outcome).length > 0 && p !== treatment);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

/** Ordinary least squares via normal equations (X^T X)^-1 X^T y. Small
 * matrices only (<=6 regressors), so a naive Gauss-Jordan inverse is fine
 * and keeps this dependency-free and auditable. */
function ols(X: number[][], y: number[]): { coefficients: number[]; residualStdErr: number } {
  const n = X.length;
  const k = X[0].length;
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const XtXInv = invert(XtX);
  const Xty = multiply(Xt, y.map((v) => [v]));
  const betaMatrix = multiply(XtXInv, Xty);
  const coefficients = betaMatrix.map((row) => row[0]);

  const residuals = y.map((yi, i) => {
    const predicted = X[i].reduce((sum, xij, j) => sum + xij * coefficients[j], 0);
    return yi - predicted;
  });
  const dof = Math.max(1, n - k);
  const rss = residuals.reduce((sum, r) => sum + r * r, 0);
  const residualStdErr = Math.sqrt(rss / dof);
  return { coefficients, residualStdErr };
}

function transpose(m: number[][]): number[][] {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

function multiply(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    result.push([]);
    for (let j = 0; j < b[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) sum += a[i][k] * b[k][j];
      result[i].push(sum);
    }
  }
  return result;
}

function invert(m: number[][]): number[][] {
  const n = m.length;
  const augmented = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) pivotRow = row;
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
    const pivot = augmented[col][col] || 1e-9;
    for (let j = 0; j < 2 * n; j++) augmented[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = 0; j < 2 * n; j++) augmented[row][j] -= factor * augmented[col][j];
    }
  }
  return augmented.map((row) => row.slice(n));
}

const Z_90 = 1.645;

/** Produces an association-only estimate (simple linear regression of
 * outcome on treatment, no adjustment). Always safe to compute. */
export function estimateAssociation(
  data: CausalDataRow[],
  treatment: string,
  outcome: string,
  reason: string,
  confounderWarnings: string[] = [],
): AssociationEstimate {
  const xs = data.map((r) => r[treatment]);
  const ys = data.map((r) => r[outcome]);
  const correlation = pearsonCorrelation(xs, ys);
  const X = xs.map((x) => [1, x]);
  const { coefficients, residualStdErr } = ols(X, ys);
  const slope = coefficients[1];
  const se = residualStdErr / Math.sqrt(xs.length);
  return {
    kind: "association",
    treatment,
    outcome,
    correlation,
    effectPerUnit: slope,
    interval: { low: slope - Z_90 * se, high: slope + Z_90 * se, level: 0.9 },
    sampleSize: data.length,
    reason,
    confounderWarnings,
  };
}

/** Attempts to identify and estimate the causal effect of `treatment` on
 * `outcome` using the graph's structure. Falls back to association-only if
 * identification assumptions are not met. */
export function estimateCausalEffect(
  graph: CausalGraph,
  data: CausalDataRow[],
  treatment: string,
  outcome: string,
): CausalFinding {
  const confounders = findConfounders(graph, treatment, outcome);
  const measuredColumns = new Set(Object.keys(data[0] ?? {}));
  const unmeasuredConfounders = confounders.filter((c) => !measuredColumns.has(c));

  if (unmeasuredConfounders.length > 0) {
    return estimateAssociation(
      data,
      treatment,
      outcome,
      `Back-door criterion not satisfied: confounder(s) [${unmeasuredConfounders.join(", ")}] are not measured, so the causal effect is not identifiable from this data. Reporting association only.`,
      unmeasuredConfounders.map(
        (c) => `"${c}" is a common cause of "${treatment}" and "${outcome}" but has no observed data — any causal claim would be confounded.`,
      ),
    );
  }

  const adjustmentSet = confounders.filter((c) => measuredColumns.has(c));
  const xs = data.map((r) => r[treatment]);
  const ys = data.map((r) => r[outcome]);
  const X = data.map((r) => [1, r[treatment], ...adjustmentSet.map((a) => r[a])]);
  const { coefficients, residualStdErr } = ols(X, ys);
  const treatmentCoefficient = coefficients[1];
  const se = residualStdErr / Math.sqrt(xs.length);

  const assumptions = [
    "The causal graph's edges correctly describe all relevant cause/effect relationships (no missing arrows).",
    adjustmentSet.length > 0
      ? `Adjusting for [${adjustmentSet.join(", ")}] blocks all back-door paths between "${treatment}" and "${outcome}" (back-door criterion).`
      : `No common causes of "${treatment}" and "${outcome}" are implied by the graph, so no adjustment is required.`,
    "The functional relationship is approximately linear in the adjusted variables (OLS adjustment formula).",
    "No selection bias or measurement error in the observed sample.",
  ];

  return {
    kind: "causal",
    treatment,
    outcome,
    effectPerUnit: treatmentCoefficient,
    interval: { low: treatmentCoefficient - Z_90 * se, high: treatmentCoefficient + Z_90 * se, level: 0.9 },
    sampleSize: data.length,
    identification: adjustmentSet.length > 0 ? "backdoor-adjustment" : "no-confounding-assumed",
    adjustmentSet,
    assumptions,
    confounderWarnings: [],
  };
}
