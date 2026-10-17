// fatigue.ts — session-scoped decision-fatigue heuristic.
// ORIGINAL to this build. Decision fatigue (the idea that decision QUALITY
// degrades after many consecutive choices) is a real, studied phenomenon in
// the psychology literature in general terms, but the specific per-type
// weights below are illustrative, not measured — labeled explicitly as a
// HEURISTIC, reset every session, not a clinical or validated instrument.

import type { DecisionType } from "./types";

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
