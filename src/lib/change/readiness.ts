import { explain, type Explain } from "@/lib/explain";
import type { GroupReadinessInputs } from "./types";

/**
 * Readiness = f(training completion, capacity headroom, prior change load).
 * Pure function, monotone by construction:
 *  - non-decreasing in trainingCompletionRate
 *  - non-decreasing in capacityHeadroom
 *  - non-increasing in priorChangeLoad
 *
 * Weighting is a documented, inspectable constant set (no hidden ML model),
 * so the score can be explained and challenged.
 */
export const READINESS_WEIGHTS = {
  training: 0.5,
  capacity: 0.3,
  loadPenaltyPerConcurrentProgram: 0.08,
} as const;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function readinessScore(inputs: GroupReadinessInputs): Explain<number> {
  const training = clamp01(inputs.trainingCompletionRate);
  const capacity = clamp01(inputs.capacityHeadroom);
  const loadPenalty = Math.max(0, inputs.priorChangeLoad) * READINESS_WEIGHTS.loadPenaltyPerConcurrentProgram;

  const raw =
    training * READINESS_WEIGHTS.training + capacity * READINESS_WEIGHTS.capacity - loadPenalty;
  const value = clamp01(raw);

  return explain(value, "readiness_weighted_v1", {
    trainingCompletionRate: training,
    capacityHeadroom: capacity,
    priorChangeLoad: inputs.priorChangeLoad,
    loadPenalty,
  }, {
    confidence: "medium",
    caveats: [
      "Capacity headroom is sourced from a capacity-planning stand-in pending the Part 06 digital-twin integration.",
      "Weights are fixed and documented, not fit to outcomes — treat the absolute number as indicative, not calibrated probability.",
      "This is a group-aggregate score; it says nothing about any individual's readiness.",
    ],
  });
}

export interface ReadinessAction {
  lever: keyof GroupReadinessInputs;
  suggestion: string;
  estimatedScoreGain: number;
}

/**
 * "What would raise readiness" suggestions for the Group Readiness Card.
 * Computed by perturbing one lever at a time and reporting the marginal
 * gain — fully derived from the same pure scoring function (no separate
 * model to keep in sync).
 */
export function readinessActions(inputs: GroupReadinessInputs): ReadinessAction[] {
  const base = readinessScore(inputs).value;
  const candidates: ReadinessAction[] = [];

  const trainingBump = readinessScore({
    ...inputs,
    trainingCompletionRate: Math.min(1, inputs.trainingCompletionRate + 0.2),
  }).value;
  candidates.push({
    lever: "trainingCompletionRate",
    suggestion: "Raise training completion by 20 percentage points (e.g. targeted reminder campaign or protected training time).",
    estimatedScoreGain: Number((trainingBump - base).toFixed(3)),
  });

  const capacityBump = readinessScore({
    ...inputs,
    capacityHeadroom: Math.min(1, inputs.capacityHeadroom + 0.15),
  }).value;
  candidates.push({
    lever: "capacityHeadroom",
    suggestion: "Free up capacity headroom (defer non-critical work, add temporary support) by ~15 points.",
    estimatedScoreGain: Number((capacityBump - base).toFixed(3)),
  });

  if (inputs.priorChangeLoad > 0) {
    const loadDrop = readinessScore({
      ...inputs,
      priorChangeLoad: Math.max(0, inputs.priorChangeLoad - 1),
    }).value;
    candidates.push({
      lever: "priorChangeLoad",
      suggestion: "Sequence or pause one concurrent change program for this group.",
      estimatedScoreGain: Number((loadDrop - base).toFixed(3)),
    });
  }

  return candidates.sort((a, b) => b.estimatedScoreGain - a.estimatedScoreGain);
}
