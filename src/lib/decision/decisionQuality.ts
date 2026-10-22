// =============================================================================
// LEADOS — Part 23 — Decision-quality (DQ) scorecard
// =============================================================================
// Pure functions only — no DB access here, so they are trivially unit-testable
// and cannot have side effects on the frozen record. DQ is diagnostic: it
// scores the PROCESS used to reach a decision, never the person, and never the
// outcome. Honesty rule: DQ dimensions must be derivable from what was known
// /recorded AT DECISION TIME — nothing here looks at post-hoc outcomes.
// =============================================================================

import type {
  DecisionRecordView,
  DQDimension,
  DQLevel,
  DQScoreByDimension,
  DQScoreResult,
  Explain,
} from "./types";
import { DQ_DIMENSIONS } from "./types";

function clampLevel(n: number): DQLevel {
  if (n <= 0) return 0;
  if (n >= 2) return 2;
  return 1 as DQLevel;
}

/** Structural signals derivable purely from the record — the "floor" a rater
 * starts from. Deliberately NOT based on prose quality/length (anti-gaming:
 * writing more words does not raise the auto-suggested score). */
export interface DQSignals {
  oneSentenceQuestion: boolean;
  decisionTypeStated: boolean;
  optionCount: number;
  distinctOptions: boolean;
  optionsWithInterval: number;
  outcomeStated: boolean;
  outcomeHasInterval: boolean;
  outcomeHasReviewDate: boolean;
  reversibilityPlanPresent: boolean;
  reversibilityPlanDepth: number; // rough word count of plan, informational only
  hasReviewDate: boolean;
  hasTriggerConditions: boolean;
}

export function computeDQSignals(record: DecisionRecordView): DQSignals {
  const question = record.question?.trim() ?? "";
  const sentenceEnders = (question.match(/[.?!]/g) ?? []).length;
  const oneSentenceQuestion = question.length > 0 && sentenceEnders <= 1 && question.endsWith("?");

  const options = record.optionsConsidered ?? [];
  const distinctOptions = new Set(options.map((o) => o.trim().toLowerCase())).size === options.length && options.length >= 2;

  const evidenceEntries = Object.values(record.optionEvidence ?? {}) as Explain<unknown>[];
  const optionsWithInterval = evidenceEntries.filter((e) => Boolean(e?.interval) && Boolean(e?.confidence)).length;

  return {
    oneSentenceQuestion,
    decisionTypeStated: record.decisionType === "type1" || record.decisionType === "type2",
    optionCount: options.length,
    distinctOptions,
    optionsWithInterval,
    outcomeStated: Boolean(record.expected?.outcome && record.expected.outcome.trim().length > 0),
    outcomeHasInterval: Boolean(record.expected?.interval),
    outcomeHasReviewDate: Boolean(record.expected?.reviewAt),
    reversibilityPlanPresent: Boolean(record.reversibilityPlan && record.reversibilityPlan.trim().length > 0),
    reversibilityPlanDepth: (record.reversibilityPlan ?? "").split(/\s+/).filter(Boolean).length,
    hasReviewDate: Boolean(record.expected?.reviewAt),
    hasTriggerConditions: (record.triggerConditions ?? []).length > 0,
  };
}

/** Auto-suggested score per dimension — a deterministic, anchored heuristic.
 * This is a FLOOR / starting point for a human rater, not a final score. */
export function autoSuggestDQ(record: DecisionRecordView): DQScoreByDimension {
  const s = computeDQSignals(record);

  const frame: DQLevel = s.oneSentenceQuestion && s.decisionTypeStated ? 2 : s.decisionTypeStated || s.oneSentenceQuestion ? 1 : 0;

  const options: DQLevel = s.optionCount >= 2 && s.distinctOptions ? 2 : s.optionCount >= 2 ? 1 : 0;

  const evidence: DQLevel =
    s.optionCount > 0 && s.optionsWithInterval === s.optionCount
      ? 2
      : s.optionsWithInterval > 0
        ? 1
        : 0;

  const expectations: DQLevel =
    s.outcomeStated && s.outcomeHasInterval && s.outcomeHasReviewDate
      ? 2
      : s.outcomeStated && (s.outcomeHasInterval || s.outcomeHasReviewDate)
        ? 1
        : 0;

  const reversibility: DQLevel =
    s.reversibilityPlanPresent && s.reversibilityPlanDepth >= 8
      ? 2
      : s.reversibilityPlanPresent
        ? 1
        : 0;

  const review: DQLevel = s.hasReviewDate && s.hasTriggerConditions ? 2 : s.hasReviewDate || s.hasTriggerConditions ? 1 : 0;

  return { frame, options, evidence, expectations, reversibility, review };
}

export interface RaterScoreInput {
  scores: Partial<Record<DQDimension, number>>;
  scoredBy: string;
  notes?: string;
}

export interface ScoreDecisionResult extends DQScoreResult {
  auto: DQScoreByDimension;
  autoDq: number;
  gamingRisk: boolean;
  scoredBy: string;
  notes: string;
}

/** Pure function: validates + clamps rater input, combines with the auto
 * floor, and flags a gaming-risk heuristic (large unexplained gap between a
 * rater's final score and the structural auto-suggestion). */
export function scoreDecisionQuality(
  record: DecisionRecordView,
  rater: RaterScoreInput,
): ScoreDecisionResult {
  const auto = autoSuggestDQ(record);
  const autoDq = DQ_DIMENSIONS.reduce((sum, d) => sum + auto[d], 0);

  const scores: DQScoreByDimension = { ...auto };
  for (const dim of DQ_DIMENSIONS) {
    const provided = rater.scores[dim];
    if (typeof provided === "number" && Number.isFinite(provided)) {
      scores[dim] = clampLevel(provided);
    }
  }

  const dq = DQ_DIMENSIONS.reduce((sum, d) => sum + scores[d], 0);

  const gap = dq - autoDq;
  const gamingRisk = gap >= 3 && !(rater.notes && rater.notes.trim().length >= 20);

  return {
    scores,
    dq,
    auto,
    autoDq,
    gamingRisk,
    scoredBy: rater.scoredBy,
    notes: rater.notes ?? "",
  };
}

/** Agreement check between two independent scorings — used by the inter-rater
 * simulation test (Phase 4 gate 2): every dimension must agree within 1 point. */
export function dimensionsAgreeWithinOne(
  a: DQScoreByDimension,
  b: DQScoreByDimension,
): { agree: boolean; diffs: Record<DQDimension, number> } {
  const diffs = {} as Record<DQDimension, number>;
  let agree = true;
  for (const dim of DQ_DIMENSIONS) {
    const diff = Math.abs(a[dim] - b[dim]);
    diffs[dim] = diff;
    if (diff > 1) agree = false;
  }
  return { agree, diffs };
}
