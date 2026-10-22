// =============================================================================
// LEADOS — Part 23: Decision Operations — shared types
// =============================================================================

/** Explain<T>: a value wrapped with its evidential interval, confidence and
 * rationale — the standard explainability envelope referenced by Parts 04/05's
 * decision-adjacent modules. Defined locally here (stand-in) because those
 * modules are not present in this sandbox; shape kept stable for forward
 * compatibility. */
export type ConfidenceClass = "low" | "medium" | "high";

export interface Interval {
  low: number;
  high: number;
  unit?: string;
}

export interface Explain<T> {
  value: T;
  interval?: Interval;
  confidence?: ConfidenceClass;
  rationale: string;
  sourceRefs?: string[];
}

export type DecisionType = "type1" | "type2"; // irreversible | reversible (Bezos framing)

export type DecisionStatus =
  | "raised"
  | "framed"
  | "evidence_gathered"
  | "decided"
  | "reviewed";

export const DECISION_FUNNEL: DecisionStatus[] = [
  "raised",
  "framed",
  "evidence_gathered",
  "decided",
  "reviewed",
];

export interface DissentEntry {
  who: string | null;
  whoName: string;
  theCase: string;
  response: string | null;
  isLate?: boolean;
}

export interface DecisionRightsSnapshot {
  role: string | null; // decider role
  consulted: string[];
  informed: string[];
}

export interface TriggerCondition {
  signal: string;
  op: "gt" | "gte" | "lt" | "lte" | "eq";
  value: number;
}

export interface ExpectedOutcome {
  outcome: string;
  interval?: Interval;
  confidenceClass: ConfidenceClass;
  reviewAt: string | null; // ISO date
}

/** The frozen decision record shape (post-commit view). */
export interface DecisionRecordView {
  id: string;
  orgId: string;
  decisionClass: string;
  status: DecisionStatus;
  question: string;
  decisionType: DecisionType;
  optionsConsidered: string[];
  optionEvidence: Record<string, Explain<unknown>>;
  chosen: string | null;
  choiceRationale: string | null;
  dissent: DissentEntry[];
  expected: ExpectedOutcome | null;
  decidedBy: string | null;
  decisionRights: DecisionRightsSnapshot | null;
  reversibilityPlan: string | null;
  triggerConditions: TriggerCondition[];
  impact: number;
  raisedBy: string | null;
  raisedAt: string;
  framedAt: string | null;
  evidenceGatheredAt: string | null;
  committedAt: string | null;
  reviewedAt: string | null;
}

// --- Decision-quality rubric -------------------------------------------------

export type DQDimension =
  | "frame"
  | "options"
  | "evidence"
  | "expectations"
  | "reversibility"
  | "review";

export const DQ_DIMENSIONS: DQDimension[] = [
  "frame",
  "options",
  "evidence",
  "expectations",
  "reversibility",
  "review",
];

export type DQLevel = 0 | 1 | 2;

export type DQScoreByDimension = Record<DQDimension, DQLevel>;

export interface DQAnchor {
  0: string;
  1: string;
  2: string;
}

/** Anchored rubric text shown in the UI and used to keep raters aligned. */
export const DQ_RUBRIC: Record<DQDimension, DQAnchor> = {
  frame: {
    0: "No clear question, or the question is unanswerable / compound (more than one decision bundled in).",
    1: "A question exists but is vague, multi-part, or missing the decision type (type1/type2).",
    2: "One clear, answerable sentence; decision type explicitly stated and correctly classified.",
  },
  options: {
    0: "Only one option considered (false choice) or options list empty.",
    1: "Two options considered, but one is a strawman or options are not meaningfully distinct.",
    2: "Two or more genuinely distinct, viable options considered.",
  },
  evidence: {
    0: "No option has supporting evidence or an interval/confidence estimate.",
    1: "Some options have evidence, but at least one lacks an interval or confidence class.",
    2: "Every considered option has an Explain<T> with interval and confidence class.",
  },
  expectations: {
    0: "No expected outcome stated, or outcome is unfalsifiable ('things will improve').",
    1: "Expected outcome stated but missing an interval or a review date.",
    2: "Expected outcome stated with interval, confidence class, and a concrete review date.",
  },
  reversibility: {
    0: "No reversibility plan; type1 (irreversible) decision treated casually.",
    1: "Reversibility plan mentioned but shallow (no concrete rollback steps).",
    2: "Concrete reversibility plan, appropriately scaled to decision type (type1 gets rigor).",
  },
  review: {
    0: "No review date and no trigger conditions — decision will never be revisited unless someone remembers.",
    1: "Either a review date or trigger conditions exist, not both.",
    2: "Both a calendar review date and reality-based trigger conditions exist.",
  },
};

export interface DQScoreResult {
  scores: DQScoreByDimension;
  dq: number; // 0-12
}
