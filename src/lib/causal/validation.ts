/**
 * Validation & falsification (Part 05, section E): placebo tests, negative
 * controls, and claim-expiry bookkeeping. These run AFTER an estimate
 * exists and attempt to break it; a claim that fails falsification should
 * not be trusted even if identification "passed".
 */

import { doublyRobustEstimate, regressionAdjustmentEstimate } from "./estimation";
import type { Row } from "./estimation";
import { mulberry32, shuffle, type Rng } from "./rng";
import type { CausalClaim, ClaimFreshness, FalsificationReport } from "./types";

export interface PlaceboOptions {
  permutations?: number;
  rng?: Rng;
  method?: "regression" | "doubly-robust";
}

/**
 * Placebo / permutation test: shuffle the treatment column (breaking any
 * real treatment-outcome link while preserving marginal distributions),
 * re-estimate, and repeat. A trustworthy estimator should produce an
 * effect centered near zero under placebo treatment. We flag "passed" when
 * the REAL observed effect sits outside +/-2 placebo standard deviations of
 * the placebo-effect distribution's mean (i.e. the real effect is
 * distinguishable from noise) while the placebo distribution itself is
 * centered near zero.
 */
export function placeboTest(
  data: Row[],
  treatment: string,
  outcome: string,
  adjustmentSet: string[],
  observedEffect: number,
  opts: PlaceboOptions = {}
): FalsificationReport["placebo"] {
  const permutations = opts.permutations ?? 100;
  const rng = opts.rng ?? mulberry32(7);
  const method = opts.method ?? "regression";

  const effects: number[] = [];
  for (let i = 0; i < permutations; i++) {
    const shuffled = shuffle(
      data.map((r) => r[treatment]),
      rng
    );
    const placeboData = data.map((r, idx) => ({ ...r, [treatment]: shuffled[idx] }));
    const est =
      method === "doubly-robust"
        ? doublyRobustEstimate(placeboData, treatment, outcome, adjustmentSet, { crossFit: false })
        : regressionAdjustmentEstimate(placeboData, treatment, outcome, adjustmentSet);
    effects.push(est.ate);
  }

  const placeboMean = effects.reduce((a, b) => a + b, 0) / effects.length;
  const variance = effects.reduce((a, b) => a + (b - placeboMean) ** 2, 0) / Math.max(1, effects.length - 1);
  const placeboSd = Math.sqrt(variance);

  const placeboCenteredAtZero = Math.abs(placeboMean) < Math.max(0.25 * placeboSd, 1e-6) + 0.1;
  const realEffectDistinguishable = Math.abs(observedEffect - placeboMean) > 2 * placeboSd;

  return {
    permutations,
    observedEffect,
    placeboMean,
    placeboSd,
    passed: placeboCenteredAtZero && realEffectDistinguishable,
    note: placeboCenteredAtZero
      ? realEffectDistinguishable
        ? "Placebo (shuffled-treatment) effect vanishes near zero and the real effect is distinguishable from the placebo distribution."
        : "Placebo effect is near zero, but the real effect is not clearly distinguishable from placebo noise at this sample size."
      : "Placebo (shuffled-treatment) effect did NOT vanish — the estimator may be picking up a spurious pattern unrelated to treatment; treat the estimate with caution.",
  };
}

/**
 * Negative control: estimate the same "treatment" against an outcome that
 * the DAG says it should NOT affect. A non-zero effect here signals
 * residual confounding or a leaky estimator.
 */
export function negativeControlTest(
  data: Row[],
  treatment: string,
  negativeControlOutcome: string,
  adjustmentSet: string[]
): FalsificationReport["negativeControl"] {
  const est = regressionAdjustmentEstimate(data, treatment, negativeControlOutcome, adjustmentSet);
  const passed = est.ci[0] <= 0 && est.ci[1] >= 0;
  return {
    controlOutcome: negativeControlOutcome,
    effectOnControl: est.ate,
    ci: est.ci,
    passed,
    note: passed
      ? "No significant effect detected on the negative-control outcome, as expected."
      : "Unexpected significant effect on a negative-control outcome — investigate residual confounding or model misspecification before trusting the main estimate.",
  };
}

export function buildFalsificationReport(
  claimId: string,
  placebo: FalsificationReport["placebo"],
  negativeControl: FalsificationReport["negativeControl"] | undefined,
  crossFitted: boolean
): FalsificationReport {
  return {
    claimId,
    placebo,
    negativeControl,
    crossFitted,
    generatedAt: new Date().toISOString(),
  };
}

// --- Claim expiry -------------------------------------------------------

const AGING_WINDOW_DAYS = 14; // claims entering this window before revalidateBy are shown as "aging"

export function claimFreshness(claim: Pick<CausalClaim, "revalidateBy">, now: Date = new Date()): ClaimFreshness {
  const revalidateBy = new Date(claim.revalidateBy).getTime();
  const agingStart = revalidateBy - AGING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const t = now.getTime();
  if (t >= revalidateBy) return "expired";
  if (t >= agingStart) return "aging";
  return "fresh";
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
