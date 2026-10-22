// =============================================================================
// LEADOS — Part 32: Executive Cockpit & Briefing Compiler — shared types
// =============================================================================
// Read-before-write note: `ConfidenceClass` below is copied verbatim from the
// real repo's `src/lib/finance/types.ts` (Part 08). We do not invent a
// parallel vocabulary for "how sure are we" — the whole point of Part 32 is
// that executive simplification must not erase the uncertainty machinery
// Part 08/11 already built. Every answer/sentence in this part carries one of
// these four classes through to the UI.

export type ConfidenceClass = "actual" | "evidence" | "forecast" | "asserted";

export const CONFIDENCE_RANK: Record<ConfidenceClass, number> = {
  actual: 0,
  evidence: 0,
  forecast: 1,
  asserted: 2,
};

export const CONFIDENCE_LABEL: Record<ConfidenceClass, string> = {
  actual: "Actual (observed)",
  evidence: "Evidence-derived",
  forecast: "Forecast (modeled)",
  asserted: "Asserted (unverified override)",
};

/** Worst (least trustworthy) confidence wins when combining facts — same
 * propagation rule as Part 08's DAG so a briefing can't launder a forecast
 * number into looking like an actual. */
export function worstConfidence(a: ConfidenceClass, b: ConfidenceClass): ConfidenceClass {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

export interface Interval {
  p10: number;
  p50: number;
  p90: number;
}

export type Domain = "strategy" | "finance" | "people" | "risk" | "operations" | "market";

export type TrendDirection = "up" | "down" | "flat";

export interface Trend {
  direction: TrendDirection;
  deltaPct: number | null;
  sinceLabel: string;
}

export interface EvidenceRef {
  factId: number;
  label: string;
  domain: Domain;
  /** Where clicking this footnote should land — a source view route key. */
  sourceView: string;
}

export interface Driver {
  label: string;
  /** Fact ids in the shared FactLedger this driver's magnitude is cited to. */
  refs: number[];
  contributionPct: number | null;
}

export interface RecommendedAction {
  label: string;
  /** 'decision' routes to the decision/approval inbox; 'note' is read-only. */
  kind: "decision" | "approval" | "note";
  refId?: string;
}

/**
 * The canonical typed answer every question in the ontology resolves to
 * (Phase 1 contract). `notAnswerable` is a first-class state, not an error —
 * an honest cockpit says "we don't track that yet" rather than fabricating.
 */
export interface QuestionAnswer {
  questionId: string;
  headline: string;
  interval?: Interval;
  trend: Trend | null;
  confidenceClass: ConfidenceClass;
  drivers: Driver[];
  actions: RecommendedAction[];
  evidenceRefs: EvidenceRef[];
  domain: Domain;
  notAnswerable: false;
}

export interface NotAnswerableYet {
  questionId: string;
  notAnswerable: true;
  reason: string;
  /** What would need to exist for this to become answerable. */
  whatWouldUnlockIt: string;
  domain: Domain;
}

export type AnswerResult = QuestionAnswer | NotAnswerableYet;

export function isAnswerable(a: AnswerResult): a is QuestionAnswer {
  return a.notAnswerable === false;
}
