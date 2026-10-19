// src/lib/intelligence/autoCalibrate.ts
//
// Automatic rule-weight adjustment WITH GUARDRAILS (Part 3 §3):
//   - max step size per calibration cycle (a rule's weight can't be yanked
//     from 1.0 to 3.0 in one run even if the math suggests it),
//   - every proposal requires human approval before it is applied — this
//     module only ever produces a *proposal*; nothing here mutates a rule's
//     live weight.
import type { LabeledPrediction } from "./goldenDataset";

export const MAX_WEIGHT_STEP = 0.25;
export const MIN_WEIGHT = 0.2;
export const MAX_WEIGHT = 3.0;

export interface WeightAdjustmentProposal {
  ruleId: string;
  currentWeight: number;
  proposedWeight: number;
  rawSuggestedWeight: number;
  calibrationSlope: number;
  reason: string;
  requiresApproval: true;
  approved: false;
  approvedBy?: string;
  approvedAt?: string;
}

/** Calibration slope: regress observed outcomes on (predictedProbability -
 * 0.5) via least squares. A slope of 1 means the rule's probability swings
 * map 1:1 onto real-world outcome swings (well calibrated). Slope > 1 means
 * the rule is under-confident (real effect is bigger than predicted) and
 * its weight should increase; slope < 1 means it's over-confident. This is
 * the standard calibration-slope diagnostic (Cox, 1958, "Two further
 * applications of a model for binary regression"). */
export function calibrationSlope(predictions: LabeledPrediction[]): number {
  if (predictions.length === 0) return 1;
  const xs = predictions.map((p) => p.predictedProbability - 0.5);
  const ys: number[] = predictions.map((p) => p.outcome);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a: number, b: number) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 1;
  return num / den;
}

/** Produces a weight-adjustment proposal. The raw suggestion is
 * `currentWeight * calibrationSlope` (scale the rule's confidence spread by
 * how much reality agrees with it); the guardrail clamps the ACTUAL step
 * taken to +/- MAX_WEIGHT_STEP regardless of how large the raw suggestion
 * is, and clamps the absolute weight to [MIN_WEIGHT, MAX_WEIGHT]. The
 * proposal is never auto-applied — `requiresApproval`/`approved` fields
 * exist so a human reviewer must flip `approved` before
 * `applyWeightAdjustment` will do anything. */
export function proposeWeightAdjustment(
  ruleId: string,
  currentWeight: number,
  predictions: LabeledPrediction[],
): WeightAdjustmentProposal {
  const slope = calibrationSlope(predictions);
  const rawSuggested = currentWeight * slope;
  const step = Math.max(-MAX_WEIGHT_STEP, Math.min(MAX_WEIGHT_STEP, rawSuggested - currentWeight));
  const proposedWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, currentWeight + step));

  return {
    ruleId,
    currentWeight,
    proposedWeight: Number(proposedWeight.toFixed(4)),
    rawSuggestedWeight: Number(rawSuggested.toFixed(4)),
    calibrationSlope: Number(slope.toFixed(4)),
    reason:
      slope > 1.05
        ? `Rule is under-confident (calibration slope=${slope.toFixed(2)}); proposing a weight increase of ${(proposedWeight - currentWeight).toFixed(3)} (capped at ±${MAX_WEIGHT_STEP}).`
        : slope < 0.95
          ? `Rule is over-confident (calibration slope=${slope.toFixed(2)}); proposing a weight decrease of ${(currentWeight - proposedWeight).toFixed(3)} (capped at ±${MAX_WEIGHT_STEP}).`
          : `Rule is well calibrated (slope=${slope.toFixed(2)}); no material change proposed.`,
    requiresApproval: true,
    approved: false,
  };
}

/** Applies a proposal ONLY if it has been explicitly approved by a human
 * (`approvedBy` set). Returns the weight to persist, or the unchanged
 * current weight if not approved — this function is the single guardrail
 * chokepoint so no caller can bypass the approval requirement. */
export function applyWeightAdjustment(
  proposal: WeightAdjustmentProposal,
  approvedBy?: string,
): { weight: number; applied: boolean } {
  if (!approvedBy) {
    return { weight: proposal.currentWeight, applied: false };
  }
  return { weight: proposal.proposedWeight, applied: true };
}
