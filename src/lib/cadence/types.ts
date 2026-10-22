// LEADOS Part 25 — Operating Rhythm Engine: shared types.
// The cadence graph is DATA, not hard-coded cron: a `Ritual` is a row plus
// an `anchor` (wall-clock recipe) resolved by occurrenceClock.ts, and
// `adaptivityRules` are policy rows evaluated by policyEngine.ts.

export type RitualKind =
  | "daily_brief"
  | "weekly_review"
  | "monthly_business_review"
  | "quarterly_strategy"
  | "annual_plan";

export const RITUAL_KINDS: RitualKind[] = [
  "daily_brief",
  "weekly_review",
  "monthly_business_review",
  "quarterly_strategy",
  "annual_plan",
];

/** A reference to a signal the ritual consumes (not the signal's value itself). */
export interface SignalRef {
  kind:
    | "decision_trigger_watch"
    | "sensor_signal"
    | "key_result"
    | "budget_line"
    | "team_pulse_aggregate"
    | "action_due_date"
    | "dependent_ritual_occurrence";
  label: string;
}

/** A reference to an artifact the ritual is expected to produce. */
export interface ArtifactRef {
  kind: "agenda" | "capture_record" | "decision" | "action" | "hypothesis";
  label: string;
}

/** Wall-clock recipe for the ritual's *undegraded* cadence. Exactly one of
 * weekday / dayOfMonth+month / dayOfMonth applies depending on `kind`. */
export interface RitualAnchor {
  weekday?: number; // 0=Sun..6=Sat, for daily_brief (ignored) / weekly_review
  dayOfMonth?: number; // for monthly_business_review / quarterly_strategy / annual_plan
  month?: number; // 1-12, for annual_plan (and the quarter-start month for quarterly_strategy)
  hour: number; // 0-23, local to `timezone`
  minute: number; // 0-59, local to `timezone`
}

export type CadenceMode = "full" | "async_checklist";

export interface Ritual {
  id: string;
  orgId: string;
  kind: RitualKind;
  name: string;
  participantRoles: string[];
  inputs: SignalRef[];
  outputs: ArtifactRef[];
  durationMinutes: number;
  quorum: number;
  timezone: string;
  anchor: RitualAnchor;
  dependsOnRitualId: string | null;
  active: boolean;
}

// --- Adaptive cadence rule DSL -----------------------------------------------

/** "if variance < X% and no anomalies for N occurrences, degrade to async_checklist" */
export interface VarianceAnomalyDegradeRule {
  kind: "variance_anomaly_degrade";
  varianceThresholdPct: number; // e.g. 2 means 2%
  anomalyFreeOccurrences: number; // consecutive prior occurrences required
  degradeTo: CadenceMode;
}

/** Never degrade — always run at full cadence. The explicit no-op policy. */
export interface AlwaysFullRule {
  kind: "always_full";
}

export type CadenceRule = VarianceAnomalyDegradeRule | AlwaysFullRule;

/** One historical occurrence's summary, the unit the policy engine reasons over. */
export interface OccurrenceSummary {
  occurrenceKey: string;
  scheduledFor: string; // ISO
  variancePct: number; // max abs variance observed in the window feeding this occurrence
  anomalyCount: number; // anomalies observed in the window feeding this occurrence
}

export interface PolicyDecisionResult {
  mode: CadenceMode;
  reason: string; // concrete, numeric — passes the zero-filler lint
}

export interface SimulationResult {
  totalOccurrences: number;
  wouldDegradeCount: number;
  wouldDegradeOccurrenceKeys: string[];
  details: Array<{ occurrenceKey: string; mode: CadenceMode; reason: string }>;
}

// --- Agenda -------------------------------------------------------------------

export type AgendaItemType =
  | "decision_near_trigger"
  | "anomaly"
  | "kr_drift"
  | "budget_variance"
  | "people_signal_aggregate"
  | "action_overdue"
  | "cadence_rollup";

export interface EvidenceRef {
  type: string;
  id: string | null;
  note: string;
}

export interface AgendaItemDraft {
  itemType: AgendaItemType;
  title: string;
  whyOnAgenda: string;
  evidenceRefs: EvidenceRef[];
  sourceValue: number | null;
  thresholdValue: number | null;
  severity: number; // 1-5
}

// --- Capture ------------------------------------------------------------------

export interface CaptureDecisionInput {
  question: string;
  decisionClass: string;
  chosen?: string;
  choiceRationale?: string;
  impact: number; // 1-5
  raisedBy?: string;
}

export interface CaptureActionInput {
  title: string;
  ownerRole?: string;
  ownerUserId?: string;
  dueAt?: string; // ISO
}

export interface CaptureHypothesisInput {
  statement: string;
  raisedBy?: string;
}

export interface CaptureOpenQuestion {
  question: string;
  ownerRole: string;
}

export interface CaptureInput {
  capturedBy?: string;
  attendeeCount: number;
  decisions: CaptureDecisionInput[];
  actions: CaptureActionInput[];
  hypotheses: CaptureHypothesisInput[];
  openQuestions: CaptureOpenQuestion[];
  notes?: string;
}
