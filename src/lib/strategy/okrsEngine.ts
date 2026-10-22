// OKR semantics: progress derivation, confidence weighting, objective scoring.
//
// Policy: progress is DERIVED from evidence refs whenever at least one
// exists for the key result. Hand-asserted progress (kr.current, no
// evidence) is only used as a fallback and is always flagged
// `source: "asserted"` with a confidenceClass + confidenceWeight < 1, so the
// UI can render the "asserted" chip and the drift radar can find it later.
import {
  CONFIDENCE_WEIGHTS,
  DEFAULT_UNDECLARED_CONFIDENCE,
  healthBandFor,
  type HealthBand,
} from "./strategyModels";
import type { EvidenceRefInput, KeyResultInput } from "./strategyModels";
import type { ConfidenceClass } from "@/db/schema";

export function clip01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export interface ProgressResult {
  keyResultId: string;
  progress: number; // 0..1, already clipped
  rawRatio: number; // unclipped ratio, useful for drift magnitude
  source: "evidence" | "asserted";
  confidenceClass: ConfidenceClass;
  confidenceWeight: number;
  latestEvidenceId: string | null;
  latestEvidenceValue: number | null;
  latestEvidenceObservedAt: string | null;
  usedValue: number;
}

function ratioForLinear(kr: KeyResultInput, value: number): number {
  const span = kr.target - kr.baseline;
  if (span === 0) return value >= kr.target ? 1 : 0;
  if (kr.direction === "up") {
    return (value - kr.baseline) / span;
  }
  // direction === "down": progress increases as value falls from baseline to target
  return (kr.baseline - value) / (kr.baseline - kr.target);
}

function ratioForMilestone(kr: KeyResultInput, value: number): number {
  // `value` is interpreted as "milestones complete" when evidence-derived;
  // when asserted, kr.milestonesComplete is used directly.
  const total = kr.milestonesTotal && kr.milestonesTotal > 0 ? kr.milestonesTotal : null;
  if (!total) return 0;
  return value / total;
}

function ratioForThreshold(kr: KeyResultInput, value: number): number {
  const threshold = kr.thresholdValue ?? kr.target;
  const crossed = kr.direction === "up" ? value >= threshold : value <= threshold;
  if (crossed) return 1;
  // Partial credit: linear approach toward the threshold from baseline,
  // capped at 0.99 so "almost there" never displays as "done".
  const partial = ratioForLinear({ ...kr, target: threshold }, value);
  return Math.min(0.99, Math.max(0, partial));
}

function ratioFor(kr: KeyResultInput, value: number): number {
  switch (kr.progressMode) {
    case "linear":
      return ratioForLinear(kr, value);
    case "milestone":
      return ratioForMilestone(kr, value);
    case "threshold":
      return ratioForThreshold(kr, value);
    default:
      return ratioForLinear(kr, value);
  }
}

/** Pick the most recent evidence ref by observedAt. */
export function latestEvidence(refs: EvidenceRefInput[]): EvidenceRefInput | null {
  if (refs.length === 0) return null;
  return refs.reduce((latest, r) =>
    new Date(r.observedAt).getTime() > new Date(latest.observedAt).getTime() ? r : latest,
  );
}

export function computeKeyResultProgress(
  kr: KeyResultInput,
  evidence: EvidenceRefInput[],
): ProgressResult {
  const refsForKr = evidence.filter((e) => e.keyResultId === kr.id);
  const latest = latestEvidence(refsForKr);

  if (latest) {
    const rawRatio = ratioFor(kr, latest.value);
    return {
      keyResultId: kr.id,
      progress: clip01(rawRatio),
      rawRatio,
      source: "evidence",
      confidenceClass: "verified",
      confidenceWeight: CONFIDENCE_WEIGHTS.verified,
      latestEvidenceId: latest.id,
      latestEvidenceValue: latest.value,
      latestEvidenceObservedAt: latest.observedAt,
      usedValue: latest.value,
    };
  }

  // No evidence: fall back to the hand-asserted `current` value.
  const confidenceClass: ConfidenceClass = kr.confidenceClass ?? DEFAULT_UNDECLARED_CONFIDENCE;
  const value = kr.progressMode === "milestone" ? kr.milestonesComplete ?? 0 : kr.current;
  const rawRatio = ratioFor(kr, value);
  return {
    keyResultId: kr.id,
    progress: clip01(rawRatio),
    rawRatio,
    source: "asserted",
    confidenceClass,
    confidenceWeight: CONFIDENCE_WEIGHTS[confidenceClass],
    latestEvidenceId: null,
    latestEvidenceValue: null,
    latestEvidenceObservedAt: null,
    usedValue: value,
  };
}

export interface ObjectiveScoreResult {
  objectiveId: string;
  score: number; // weighted avg of clip(progress,0,1) * confidenceWeight, weights normalized to sum 1
  rawWeightedSum: number; // same but without weight normalization (audit trail)
  totalWeight: number;
  health: HealthBand;
  keyResultCount: number;
  keyResultProgress: ProgressResult[];
  stretch: boolean;
  /** Display-only calibrated score for stretch objectives (score / 0.7, capped at 1). Never used for anything but UI framing. */
  calibratedDisplayScore: number;
}

/**
 * Objective score = sum(w_i * clip(progress_i, 0, 1) * confidenceWeight_i),
 * with weights normalized to sum to 1 across the objective's key results so
 * the final score stays in [0, 1] regardless of how KR weights were entered.
 */
export function computeObjectiveScore(
  objectiveId: string,
  stretch: boolean,
  keyResults: KeyResultInput[],
  evidence: EvidenceRefInput[],
): ObjectiveScoreResult {
  const krs = keyResults.filter((k) => k.objectiveId === objectiveId);
  const progresses = krs.map((kr) => computeKeyResultProgress(kr, evidence));

  const totalWeight = krs.reduce((sum, kr) => sum + (kr.weight || 0), 0);
  let rawWeightedSum = 0;
  if (totalWeight > 0) {
    for (let i = 0; i < krs.length; i++) {
      const kr = krs[i];
      const p = progresses[i];
      rawWeightedSum += (kr.weight / totalWeight) * p.progress * p.confidenceWeight;
    }
  }

  const score = clip01(rawWeightedSum);
  const health = healthBandFor(score, stretch);
  const calibratedDisplayScore = stretch ? clip01(score / 0.7) : score;

  return {
    objectiveId,
    score,
    rawWeightedSum,
    totalWeight,
    health,
    keyResultCount: krs.length,
    keyResultProgress: progresses,
    stretch,
    calibratedDisplayScore,
  };
}
