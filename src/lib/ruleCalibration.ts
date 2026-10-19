const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 3.0;

/**
 * Adjusts a signal-board rule's weight based on its observed Brier score
 * (0 = perfectly calibrated, 1 = worst possible). A perfect score nudges the
 * weight up (the rule is trustworthy, amplify it); a terrible score nudges it
 * down. The result is always clamped into [0.1, 3.0] so a single extreme
 * observation can never zero-out or blow up a rule's influence.
 */
export function calibrateRuleWeight(currentWeight: number, brierScore: number): number {
  const clampedBrier = Math.min(1, Math.max(0, brierScore));
  const adjustment = (0.5 - clampedBrier) * 4;
  const next = currentWeight + adjustment;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, next));
}

export const RULE_WEIGHT_BOUNDS = { min: MIN_WEIGHT, max: MAX_WEIGHT };
