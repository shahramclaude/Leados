/**
 * Minimal causal estimators used to judge whether an automation/decision
 * actually moved an outcome metric, vs. naive correlation.
 *
 * - `estimateDifferenceInMeans`: naive estimator, biased under confounding.
 * - `estimateIPW`: inverse-propensity-weighted estimator — unbiased for the
 *   average treatment effect (ATE) when propensities are correctly specified,
 *   even under confounding. Ground-truth recovery is property-tested in
 *   `causal.test.ts` against synthetic data generated via the seeded PRNG.
 */
export type Unit = {
  treated: boolean;
  outcome: number;
  /** Known/estimated probability of being treated, given covariates (propensity score). */
  propensity: number;
};

export function estimateDifferenceInMeans(units: readonly Unit[]): number {
  const treated = units.filter((u) => u.treated);
  const control = units.filter((u) => !u.treated);
  if (treated.length === 0 || control.length === 0) {
    throw new Error("Need at least one treated and one control unit");
  }
  const mean = (xs: readonly Unit[]) => xs.reduce((a, u) => a + u.outcome, 0) / xs.length;
  return mean(treated) - mean(control);
}

/**
 * Inverse propensity weighting (Horvitz-Thompson) estimator of the Average
 * Treatment Effect:
 *   ATE = (1/n) * sum_i [ T_i*Y_i/e_i - (1-T_i)*Y_i/(1-e_i) ]
 */
export function estimateIPW(units: readonly Unit[]): number {
  if (units.length === 0) throw new Error("Need at least one unit");
  let sum = 0;
  for (const u of units) {
    if (u.propensity <= 0 || u.propensity >= 1) {
      throw new Error("Propensity scores must be strictly between 0 and 1 (positivity)");
    }
    sum += u.treated
      ? u.outcome / u.propensity
      : -u.outcome / (1 - u.propensity);
  }
  return sum / units.length;
}
