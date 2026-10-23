// src/lib/cognitiveLoad.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Stand-in for the
// earlier cognitive-load module. Exposes Part 23's referenced "DQ
// dimensions" (decision-quality dimensions) plus a reversibility class, and
// a pure weighting function. This module is intentionally generic (no
// storage, no identity) so it can be reused by both org-level workload
// features (outside this part's scope) and the self-only leader-state model
// in src/lib/leaderState/decisionLoad.ts.

/** 1 (low) .. 5 (high) rating scale used across all DQ dimensions. */
export type DQScale = 1 | 2 | 3 | 4 | 5;

export interface DecisionQualityDimensions {
  /** How high the stakes of the decision are. */
  stakes: DQScale;
  /** How much time pressure surrounded the decision. */
  timePressure: DQScale;
  /** How complete the available information felt (5 = very complete). */
  informationCompleteness: DQScale;
  /** How clear the decision criteria felt (5 = very clear). */
  clarity: DQScale;
}

export type ReversibilityClass = "reversible" | "costly-to-reverse" | "irreversible";

export const REVERSIBILITY_MULTIPLIER: Record<ReversibilityClass, number> = {
  reversible: 1,
  "costly-to-reverse": 1.5,
  irreversible: 2,
};

/**
 * Cognitive weight of a single decision, roughly on a 0..10 scale.
 * Higher stakes, higher time pressure, lower information, lower clarity,
 * and lower reversibility all push the weight up.
 */
export function decisionCognitiveWeight(
  dims: DecisionQualityDimensions,
  reversibility: ReversibilityClass,
): number {
  const demandFactors = [
    dims.stakes,
    dims.timePressure,
    6 - dims.informationCompleteness,
    6 - dims.clarity,
  ];
  const avgDemand = demandFactors.reduce((a, b) => a + b, 0) / demandFactors.length; // 1..5
  const base = (avgDemand - 1) * 2.5; // rescale 1..5 -> 0..10
  const weighted = base * REVERSIBILITY_MULTIPLIER[reversibility];
  return Math.round(weighted * 100) / 100;
}

export function isHighStakes(dims: DecisionQualityDimensions, reversibility: ReversibilityClass): boolean {
  return dims.stakes >= 4 || reversibility === "irreversible";
}
