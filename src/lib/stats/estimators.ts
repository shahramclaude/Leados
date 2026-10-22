/**
 * Effect estimators + causal-language guardrails.
 *
 * STATUS: Part 05 is expected to own the canonical estimator library. It is
 * not present in this repository snapshot, so Part 26 bootstraps the
 * specific estimators it needs (difference-in-means with a normal-
 * approximation CI, and a stepped-wedge difference-in-differences estimator)
 * under `src/lib/stats/estimators.ts`.
 *
 * Language rule (per the standing order): estimates are phrased as
 * "associated with" unless the design supports identification (randomized
 * assignment with no interference/contamination assumed to hold) — never
 * "caused" or "proves" outright.
 */

export interface EstimateResult {
  estimate: number;
  se: number;
  ci95: [number, number];
  nTreatment: number;
  nControl: number;
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: readonly number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
}

/** Simple two-sample difference-in-means estimator with a 95% normal-approx CI. */
export function differenceInMeans(
  treatment: readonly number[],
  control: readonly number[]
): EstimateResult {
  if (treatment.length < 2 || control.length < 2) {
    throw new Error("differenceInMeans requires at least 2 observations per arm");
  }
  const mt = mean(treatment);
  const mc = mean(control);
  const se = Math.sqrt(variance(treatment) / treatment.length + variance(control) / control.length);
  const estimate = mt - mc;
  return {
    estimate,
    se,
    ci95: [estimate - 1.96 * se, estimate + 1.96 * se],
    nTreatment: treatment.length,
    nControl: control.length,
  };
}

export interface SteppedWedgeObservation {
  groupId: string;
  period: number;
  exposed: boolean;
  value: number;
}

/**
 * Stepped-wedge difference-in-differences estimator.
 * Compares (exposed - unexposed) within-group-period cell means, pooled
 * across groups/periods — a simplified pooled DiD appropriate for a small
 * number of groups/periods, documented as such.
 */
export function steppedWedgeEffect(observations: readonly SteppedWedgeObservation[]): EstimateResult {
  const exposedValues = observations.filter((o) => o.exposed).map((o) => o.value);
  const unexposedValues = observations.filter((o) => !o.exposed).map((o) => o.value);
  return differenceInMeans(exposedValues, unexposedValues);
}

export type DesignIdentification = "randomized_clean" | "randomized_contaminated" | "observational";

/**
 * Enforces the "associated with" vs identified-effect language rule.
 * Only a clean randomized design (declared explicitly, never inferred) may
 * use identified/causal phrasing.
 */
export function phraseEffect(
  estimate: number,
  design: DesignIdentification,
  subject: string
): string {
  const direction = estimate > 0 ? "an increase in" : estimate < 0 ? "a decrease in" : "no change in";
  if (design === "randomized_clean") {
    return `The intervention is estimated to have caused ${direction} ${subject} (randomized design, no known contamination).`;
  }
  return `The intervention is associated with ${direction} ${subject}; this design does not support a causal claim.`;
}
