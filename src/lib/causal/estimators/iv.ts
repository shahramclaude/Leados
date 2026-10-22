/**
 * src/lib/causal/estimators/iv.ts
 * Two-stage least squares (2SLS) instrumental-variables estimator, with a
 * first-stage F-statistic reported as a weak-instrument diagnostic
 * (rule of thumb: F < 10 => weak instrument, downgrade the claim).
 */
import { olsFit, olsStandardErrors, mean } from "../../mathUtils";

export interface IVInput {
  outcome: number[];
  treatment: number[];
  instrument: number[];
  covariates?: number[][]; // optional additional exogenous controls, row-aligned
}

export interface IVResult {
  late: number;
  se: number;
  ci90: [number, number];
  firstStageF: number;
  firstStageCoef: number;
  weakInstrument: boolean;
}

export function run2SLS(input: IVInput): IVResult {
  const n = input.outcome.length;
  const covs = input.covariates ?? [];
  const buildRow = (i: number, extra: number) => [1, ...(covs[i] ?? []), extra];

  // First stage: treatment ~ instrument + covariates
  const X1 = input.treatment.map((_, i) => buildRow(i, input.instrument[i]));
  const fit1 = olsFit(X1, input.treatment);
  const fittedTreatment = X1.map((row) => row.reduce((s, v, j) => s + v * fit1.coef[j], 0));

  // First-stage F-stat for instrument relevance (restricted vs unrestricted RSS)
  const X1Restricted = input.treatment.map((_, i) => [1, ...(covs[i] ?? [])]);
  const fitRestricted = olsFit(X1Restricted, input.treatment);
  const rssR = fitRestricted.residuals.reduce((s, r) => s + r * r, 0);
  const rssU = fit1.residuals.reduce((s, r) => s + r * r, 0);
  const dfU = n - X1[0].length;
  const firstStageF = dfU > 0 ? ((rssR - rssU) / 1) / (rssU / dfU) : 0;

  // Second stage: outcome ~ fitted treatment + covariates
  const X2 = fittedTreatment.map((ft, i) => buildRow(i, ft));
  const fit2 = olsFit(X2, input.outcome);
  const se2 = olsStandardErrors(X2, fit2.residuals);
  const lateIdx = X2[0].length - 1;

  return {
    late: fit2.coef[lateIdx],
    se: se2[lateIdx],
    ci90: [fit2.coef[lateIdx] - 1.645 * se2[lateIdx], fit2.coef[lateIdx] + 1.645 * se2[lateIdx]],
    firstStageF,
    firstStageCoef: fit1.coef[fit1.coef.length - 1],
    weakInstrument: firstStageF < 10,
  };
}

export function meanOf(xs: number[]): number {
  return mean(xs);
}
