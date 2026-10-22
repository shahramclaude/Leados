/**
 * src/lib/causal/estimators/matching.ts
 * Propensity-score weighting (IPW / ATT weights) with balance diagnostics
 * (standardized mean differences before/after weighting).
 */
import { logisticRegressionFit, mean, clamp } from "../../mathUtils";
import { balanceTable, type BalanceRow } from "../../stats";

export interface MatchingInput {
  covariateNames: string[];
  rows: { covariates: number[]; treated: boolean; outcome: number }[];
}

export interface MatchingResult {
  ate: number;
  se: number;
  ci90: [number, number];
  propensityScores: number[];
  weights: number[];
  balance: BalanceRow[];
  overlapWarning: boolean;
}

/**
 * Estimates the ATE via inverse-probability-of-treatment weighting (IPTW)
 * using a logistic-regression propensity model, with balance diagnostics
 * (SMD < 0.1 target) reported pre/post weighting.
 */
export function runMatching(input: MatchingInput): MatchingResult {
  const { rows, covariateNames } = input;
  const X = rows.map((r) => [1, ...r.covariates]); // intercept + covariates
  const treatmentLabels = rows.map((r) => (r.treated ? 1 : 0));
  const { predict } = logisticRegressionFit(X, treatmentLabels, { iters: 1500, lr: 0.3, l2: 1e-3 });
  const propensityScoresRaw = X.map((row) => predict(row));
  const propensityScores = propensityScoresRaw.map((p) => clamp(p, 0.02, 0.98));

  const weights = rows.map((r, i) => (r.treated ? 1 : propensityScores[i] / (1 - propensityScores[i])));

  const treatedOutcomes = rows.filter((r) => r.treated).map((r) => r.outcome);
  const controlOutcomes: number[] = [];
  const controlWeights: number[] = [];
  rows.forEach((r, i) => {
    if (!r.treated) {
      controlOutcomes.push(r.outcome);
      controlWeights.push(weights[i]);
    }
  });

  const weightedControlMean =
    controlWeights.reduce((s, w, i) => s + w * controlOutcomes[i], 0) / controlWeights.reduce((s, w) => s + w, 0);
  const ate = mean(treatedOutcomes) - weightedControlMean;

  // Standard error via a simple weighted-bootstrap-free sandwich approximation:
  // variance of treated mean + variance of weighted control mean.
  const nT = treatedOutcomes.length;
  const varT = variance(treatedOutcomes) / Math.max(nT, 1);
  const wSum = controlWeights.reduce((s, w) => s + w, 0);
  const wSum2 = controlWeights.reduce((s, w) => s + w * w, 0);
  const effectiveN = wSum > 0 ? (wSum * wSum) / Math.max(wSum2, 1e-9) : 1;
  const varC = variance(controlOutcomes) / Math.max(effectiveN, 1);
  const se = Math.sqrt(varT + varC);

  const treatedRows = rows.filter((r) => r.treated).map((r) => r.covariates);
  const controlRows = rows.filter((r) => !r.treated).map((r) => r.covariates);
  const balance = balanceTable(covariateNames, treatedRows, controlRows, controlWeights);

  const overlapWarning = propensityScoresRaw.some((p) => p < 0.03 || p > 0.97);

  return {
    ate,
    se,
    ci90: [ate - 1.645 * se, ate + 1.645 * se],
    propensityScores,
    weights,
    balance,
    overlapWarning,
  };
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
