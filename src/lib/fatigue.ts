// fatigue.ts — decision/signal-fatigue heuristic.
// Decision fatigue (decision QUALITY degrading after many consecutive
// choices) is a studied phenomenon in the psychology literature in general
// terms, but the specific per-type weights and thresholds below are
// illustrative, not measured — labeled explicitly as a HEURISTIC, not a
// clinical or validated instrument.
//
// WIRED: src/lib/peopleIntelligence.ts reuses `levelFor` to translate a
// person's 0-100 burnout score into the same LOW/MODERATE/HIGH/CRITICAL
// taxonomy used elsewhere in the app, and `clampScore` for generic 0-100
// clamping, instead of re-declaring clamp logic.

export type DecisionType = "termination-prep" | "hire" | "strategy.decision" | "budget" | "vendor" | "other";

export const DECISION_WEIGHTS: Record<DecisionType, number> = {
  "termination-prep": 12,
  hire: 10,
  "strategy.decision": 8,
  budget: 6,
  vendor: 5,
  other: 4,
};

export const FATIGUE_THRESHOLDS = {
  MODERATE: 30,
  HIGH: 60,
  CRITICAL: 85,
};

export function levelFor(score: number): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (score >= FATIGUE_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (score >= FATIGUE_THRESHOLDS.HIGH) return "HIGH";
  if (score >= FATIGUE_THRESHOLDS.MODERATE) return "MODERATE";
  return "LOW";
}

/** Adjusts a stated confidence (0..1) downward as session fatigue rises.
 *  Pure illustrative linear decay — NOT a validated psychometric model. */
export function fatigueAdjustedConfidence(confidence: number, fatigueScore: number): number {
  const penalty = Math.min(0.6, (fatigueScore / 100) * 0.6);
  return Math.max(0, +(confidence * (1 - penalty)).toFixed(3));
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
