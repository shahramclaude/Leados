// Shared types + documented policy tables for the strategy engine (Part 07).
//
// Everything in this file is pure data / types — no DB, no I/O — so it can be
// imported by both server code and unit tests without a database connection.

import type {
  ConfidenceClass,
  EvidenceSourceType,
  InitiativeStatus,
  KeyResultDirection,
  KeyResultProgressMode,
  MilestoneStatus,
  ObjectiveLevel,
  ObjectiveLinkType,
  ObjectiveStatus,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Plain (non-ORM) domain shapes used by the pure engine functions. Keeping
// these separate from the Drizzle row types means alignmentEngine/okrsEngine/
// portfolioMath are 100% unit-testable with in-memory fixtures (used for the
// cascade-integrity and 100-objective perf tests).
// ---------------------------------------------------------------------------

export interface ObjectiveNode {
  id: string;
  title: string;
  level: ObjectiveLevel;
  timeframe: string;
  ownerName: string;
  status: ObjectiveStatus;
  stretch: boolean;
  isNorthStarAligned: boolean;
  parentId: string | null;
  priorityRank: number;
}

export interface ObjectiveLinkEdge {
  id: string;
  fromObjectiveId: string;
  toObjectiveId: string;
  linkType: ObjectiveLinkType;
}

export interface KeyResultInput {
  id: string;
  objectiveId: string;
  title: string;
  baseline: number;
  target: number;
  current: number;
  unit: string;
  direction: KeyResultDirection;
  progressMode: KeyResultProgressMode;
  weight: number;
  stretch: boolean;
  confidenceClass: ConfidenceClass | null;
  milestonesTotal: number | null;
  milestonesComplete: number | null;
  thresholdValue: number | null;
}

export interface EvidenceRefInput {
  id: string;
  keyResultId: string;
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  value: number;
  observedAt: string; // ISO
  note: string | null;
}

export interface InitiativeNode {
  id: string;
  objectiveId: string;
  teamId: string | null;
  title: string;
  status: InitiativeStatus;
  blockerNote: string | null;
  budgetAllocated: number;
  budgetSpent: number;
  timeCriticality: number;
  riskReduction: number;
  userValue: number;
  jobSize: number;
  requiredSkill: string | null;
  requiredHoursPerWeek: number;
  startDate: string | null;
  targetEndDate: string | null;
}

export interface MilestoneNode {
  id: string;
  initiativeId: string;
  name: string;
  sequence: number;
  dependsOnMilestoneId: string | null;
  optimisticDays: number;
  mostLikelyDays: number;
  pessimisticDays: number;
  status: MilestoneStatus;
}

export interface TeamNode {
  id: string;
  name: string;
  capacityHoursPerWeek: number;
  skills: string[];
}

// ---------------------------------------------------------------------------
// POLICY TABLE: confidence weighting for hand-asserted OKR progress.
//
// Evidence-derived progress always carries confidenceWeight = 1.0 (the value
// came from a metric series / task event / milestone state, not a human
// guess). Hand-asserted progress (no evidence refs) MUST declare a
// confidenceClass and is downweighted in objective scoring, and is rendered
// in the UI with an "asserted" chip so nobody mistakes a guess for a fact.
// ---------------------------------------------------------------------------
export const CONFIDENCE_WEIGHTS: Record<ConfidenceClass, number> = {
  verified: 1.0, // human-verified against a source of truth, but not wired to live evidence yet
  high: 0.8,
  medium: 0.5,
  low: 0.25,
};

// Default applied when a KR has no evidence AND no confidenceClass was set.
// This is deliberately the lowest band — silence about confidence is not
// rewarded.
export const DEFAULT_UNDECLARED_CONFIDENCE: ConfidenceClass = "low";

// ---------------------------------------------------------------------------
// POLICY TABLE: stretch calibration.
//
// Committed (non-stretch) OKRs are expected to land at/near 1.0. Stretch OKRs
// are deliberately set beyond comfortable reach, so the healthy threshold is
// calibrated lower: landing at 0.7 of a stretch target is a success, not a
// miss. This table is the single source of truth for health-banding so the
// Strategy Map and Execution Board never diverge on what counts as
// "healthy".
// ---------------------------------------------------------------------------
export type HealthBand = "healthy" | "at_risk" | "off_track";

export interface HealthThresholds {
  healthyAt: number; // score >= this => healthy
  atRiskAt: number; // score >= this (and < healthyAt) => at_risk; below => off_track
}

export const COMMITTED_HEALTH_THRESHOLDS: HealthThresholds = {
  healthyAt: 0.9,
  atRiskAt: 0.6,
};

export const STRETCH_HEALTH_THRESHOLDS: HealthThresholds = {
  healthyAt: 0.7,
  atRiskAt: 0.4,
};

export function healthBandFor(score: number, stretch: boolean): HealthBand {
  const t = stretch ? STRETCH_HEALTH_THRESHOLDS : COMMITTED_HEALTH_THRESHOLDS;
  if (score >= t.healthyAt) return "healthy";
  if (score >= t.atRiskAt) return "at_risk";
  return "off_track";
}

// Drift/health colors aligned to the traffic-light semantics assumed from
// Part 02 (not present in this sandbox's repository — documented assumption,
// see AI-SESSION-LOG.md). Kept centralized so every surface uses the same
// palette.
export const HEALTH_COLORS: Record<HealthBand, { bg: string; text: string; dot: string }> = {
  healthy: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  at_risk: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  off_track: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
};

// ---------------------------------------------------------------------------
// POLICY TABLE: WSJF anchors (1-10 scale) per dimension.
//
// These anchors exist so two different people scoring the same initiative
// converge on the same number. They are intentionally coarse (low / mid /
// high / extreme) rather than 10 unique descriptions per point.
// ---------------------------------------------------------------------------
export const WSJF_DIMENSION_ANCHORS: Record<
  "timeCriticality" | "riskReduction" | "userValue" | "jobSize",
  { points: number; label: string }[]
> = {
  timeCriticality: [
    { points: 1, label: "No time pressure; can slip a year with no consequence" },
    { points: 3, label: "Soft deadline; slipping a quarter is annoying but survivable" },
    { points: 5, label: "Firm deadline this quarter (e.g. seasonal, partner commitment)" },
    { points: 8, label: "Regulatory/contractual deadline or active revenue leak" },
    { points: 10, label: "Immediate, compounding cost of delay (e.g. outage-class, legal)" },
  ],
  riskReduction: [
    { points: 1, label: "No risk or opportunity-enablement value" },
    { points: 3, label: "Reduces a known, low-severity risk" },
    { points: 5, label: "Removes a real operational or security risk" },
    { points: 8, label: "Unblocks a major downstream initiative or removes a severe risk" },
    { points: 10, label: "Existential risk removal or unlocks an entire roadmap" },
  ],
  userValue: [
    { points: 1, label: "Negligible or internal-only value" },
    { points: 3, label: "Noticeable improvement for a small user segment" },
    { points: 5, label: "Clear value for a majority of active users" },
    { points: 8, label: "High-demand capability requested by key accounts/segments" },
    { points: 10, label: "Transformational value across the entire user base" },
  ],
  jobSize: [
    { points: 1, label: "Under 1 person-week" },
    { points: 3, label: "2-4 person-weeks" },
    { points: 5, label: "1 quarter for a small team" },
    { points: 8, label: "Multi-quarter, multi-team effort" },
    { points: 10, label: "Year-plus program-level effort" },
  ],
};

// ---------------------------------------------------------------------------
// POLICY TABLE: portfolio tie-break rules (deterministic WSJF ranking and
// greedy knapsack selection both use this exact order).
// ---------------------------------------------------------------------------
export const WSJF_TIE_BREAK_RULES = [
  "1. Higher WSJF score wins.",
  "2. If WSJF ties, smaller jobSize wins (faster time-to-value).",
  "3. If still tied, higher timeCriticality wins (cost of delay compounds fastest).",
  "4. If still tied, lower initiative id wins (stable, deterministic ordering).",
] as const;

// ---------------------------------------------------------------------------
// Findings (shared shape across alignmentEngine, driftRadar, briefGenerator)
// ---------------------------------------------------------------------------
export type FindingSeverity = "info" | "warning" | "critical";

export interface Finding {
  id: string;
  kind: string;
  severity: FindingSeverity;
  summary: string;
  detail: string;
  relatedObjectiveIds: string[];
  relatedInitiativeIds: string[];
  evidenceRefIds: string[];
}
