/**
 * src/lib/causal/counterfactual.ts
 * Counterfactual simulator: "if X had been Z, the model estimates Y would
 * have been ... (interval)". Includes a sensitivity slider that widens the
 * interval as the assumed strength of the strongest unmeasured confounder
 * increases — this is a transparency device, NOT a new estimator: it never
 * narrows a CI and never changes `class` to a more confident one.
 */
import type { Explain } from "../belief/explain";
import { explainFromInterval } from "../belief/explain";
import type { CausalClaim } from "./types";

export interface CounterfactualInput {
  claim: CausalClaim;
  /** The new hypothetical treatment level, expressed as a multiple of the observed treatment change (1.0 = same as observed). */
  treatmentScale: number;
  /**
   * 0..1 slider: 0 = trust the stated identification strategy fully, 1 = assume
   * the strongest known confounder is as strong as the sensitivity bound
   * implies is possible without flipping the sign of the effect.
   */
  confounderSensitivity: number;
}

export interface CounterfactualOutput {
  baselineOutcome: Explain<number>;
  counterfactualOutcome: Explain<number>;
  /** Multiplicative widening applied to the interval because of the sensitivity slider. */
  intervalWideningFactor: number;
  explanation: string;
}

/**
 * Linearly scale the point estimate by `treatmentScale` (the only assumption
 * this makes is local linearity of the dose-response curve around the
 * observed treatment change — stated explicitly in the explanation string)
 * and widen the interval according to the sensitivity slider and the claim's
 * own sensitivity bound. This never fabricates certainty: as
 * confounderSensitivity -> 1, the interval widens toward (and can cross) zero,
 * which is the correct behavior when a user stress-tests the "no unmeasured
 * confounding" assumption.
 */
export function simulateCounterfactual(input: CounterfactualInput): CounterfactualOutput {
  const { claim, treatmentScale, confounderSensitivity } = input;
  const baseline = claim.estimate;
  const scaledValue = baseline.value * treatmentScale;
  const scaledLow = baseline.low * treatmentScale;
  const scaledHigh = baseline.high * treatmentScale;

  // Widening factor: at sensitivity=0, factor=1 (use stated interval). At
  // sensitivity=1, factor grows large enough that the interval plausibly
  // straddles zero whenever the diagnostics flagged real fragility
  // (small E-value / small Gamma), and grows more modestly when the
  // diagnostics suggested the finding is robust (large E-value / large Gamma).
  const fragility = fragilityScore(claim);
  const intervalWideningFactor = 1 + confounderSensitivity * fragility * 4;

  const halfWidthBase = (scaledHigh - scaledLow) / 2;
  const widenedHalfWidth = halfWidthBase * intervalWideningFactor;
  const counterfactualOutcome = explainFromInterval(
    scaledValue,
    scaledValue - widenedHalfWidth,
    scaledValue + widenedHalfWidth,
    baseline.coverage,
    `${baseline.method}+counterfactual-scale(${treatmentScale.toFixed(2)})+sensitivity(${confounderSensitivity.toFixed(2)})`,
    [
      ...baseline.caveats,
      "Assumes the dose-response relationship is roughly linear near the observed change — large extrapolations (treatmentScale far from 1) are less trustworthy than small ones.",
    ],
  );

  const crossesZero = counterfactualOutcome.low < 0 && counterfactualOutcome.high > 0;

  return {
    baselineOutcome: baseline,
    counterfactualOutcome,
    intervalWideningFactor,
    explanation: crossesZero
      ? `At this level of assumed unmeasured confounding, the estimate is no longer distinguishable from "no effect" — the interval now straddles zero.`
      : `Even under this level of assumed unmeasured confounding, the direction of the effect holds, though the size is less certain.`,
  };
}

/** Lower fragility score = diagnostics suggest a robust claim; higher = fragile to hidden confounding. */
function fragilityScore(claim: CausalClaim): number {
  const bound = claim.diagnostics.sensitivityBounds;
  if (bound.type === "e-value" && bound.value != null) {
    // E-value of 1 = trivially fragile; E-value of ~3+ = fairly robust for social-science-scale confounding.
    return Math.max(0, Math.min(1, 1 - (bound.value - 1) / 3));
  }
  if (bound.type === "rosenbaum-gamma" && bound.value != null) {
    return Math.max(0, Math.min(1, 1 - (bound.value - 1) / 3));
  }
  // No sensitivity bound computed at all -> treat as maximally fragile.
  return 1;
}
