// Pure domain types. No framework, no I/O, no Drizzle imports here —
// that's the whole point of the domain layer (see ARCHITECTURE.md).

export type ViewerRole = "self" | "manager" | "hr" | "exec" | "peer";

export interface Viewer {
  /** Person id of whoever is making the request. */
  id: number;
  role: ViewerRole;
}

/**
 * Attributes LEADOS must never accept as a model input, never use to compute
 * a risk/readiness/performance score, and never allow to appear in an
 * explanation payload. This list is enforced at runtime (see
 * `assertNoProtectedAttributes` in privacy.ts) and exercised by the fairness
 * test suite in tests/fairness.test.ts.
 */
export const PROTECTED_ATTRIBUTES = [
  "age",
  "gender",
  "sex",
  "ethnicity",
  "race",
  "nationality",
  "religion",
  "disability",
  "pregnancyStatus",
  "maritalStatus",
  "sexualOrientation",
  "veteranStatus",
] as const;

export type ProtectedAttribute = (typeof PROTECTED_ATTRIBUTES)[number];

export interface Person {
  id: number;
  displayName: string;
  email: string;
  title: string;
  teamId: number | null;
  managerId: number | null;
  hireDate: string;
  location: string;
  employmentStatus: string;
  compaRatio: number | null;
  skills: SkillRecord[];
  goals: GoalRecord[];
  tenureMonths: number;
}

export interface SkillRecord {
  skill: string;
  level: number; // 1-5
  evidence?: string[];
  updatedAt?: string;
}

export interface GoalRecord {
  title: string;
  status: "on_track" | "at_risk" | "completed" | "not_started";
  dueDate?: string;
}

export interface Team {
  id: number;
  name: string;
  department: string;
  leadId: number | null;
}

/** A single named, signed contribution to a score. */
export interface Driver {
  key: string;
  label: string;
  /** Positive = increases the risk/score, negative = decreases it. */
  contribution: number;
  /** Plain-language reason, safe to show to the subject. */
  explanation: string;
}

/**
 * The explainability contract every people-intelligence score must satisfy.
 * Enforced structurally by TypeScript and verified behaviourally by
 * tests/explainability.test.ts.
 */
export interface ExplainableScore {
  /** 0..1 estimated probability/propensity, calibrated, not a raw heuristic sum. */
  value: number;
  /** 90% credible interval around `value`. Never omitted — this is a model, not a fact. */
  confidenceInterval: { low: number; high: number; level: number };
  /** Named, signed drivers behind the estimate. Must be non-empty. */
  drivers: Driver[];
  /** Model inputs actually used (field names only, no raw sensitive values). */
  inputsUsed: string[];
  /** Attributes explicitly excluded from this computation, always includes PROTECTED_ATTRIBUTES. */
  excludedAttributes: readonly string[];
  /** Why LEADOS is allowed to compute this at all (purpose limitation, GDPR Art. 5(1)(b) style). */
  lawfulPurpose: string;
  /** Actions, not labels — what a manager/HR can actually do next. */
  recommendations: string[];
  /** Human-readable caveat about what this estimate is and isn't. */
  decisionSupportNotice: string;
  asOf: string;
}

export interface Commitment {
  id: string;
  text: string;
  owner: "manager" | "person";
  dueDate: string | null;
  status: "open" | "done" | "missed";
  completedAt: string | null;
}

export interface OneOnOne {
  id: number;
  personId: number;
  managerId: number;
  scheduledAt: string;
  status: "scheduled" | "completed" | "canceled";
  sharedAgenda: string[];
  talkingPointSuggestions: TalkingPointSuggestion[];
  commitments: Commitment[];
  sharedSummary: string | null;
  completedAt: string | null;
  // privateManagerNotes intentionally omitted from this shape; it is only
  // ever attached by the repository layer for an authorized viewer.
}

export interface TalkingPointSuggestion {
  topic: string;
  reason: string;
  sourceSignal: string;
  dismissed?: boolean;
}

export interface GrowthMilestone {
  id: number;
  planId: number;
  title: string;
  skill: string;
  targetDate: string | null;
  completedAt: string | null;
  evidence: string[];
}

export interface GrowthPlan {
  id: number;
  personId: number;
  title: string;
  status: "active" | "completed" | "paused";
  milestones: GrowthMilestone[];
}

export type Readiness = "ready_now" | "ready_later" | "develop";

export interface SuccessionCandidate {
  personId: number;
  displayName: string;
  readiness: Readiness;
  confidence: number;
  evidence: string[];
  gapPlan: string | null;
}

export interface SuccessionRoleBoard {
  roleId: number;
  title: string;
  teamId: number | null;
  criticality: "low" | "medium" | "high" | "critical";
  incumbentId: number | null;
  coverageRisk: ExplainableScore;
  readyNow: SuccessionCandidate[];
  readyLater: SuccessionCandidate[];
  develop: SuccessionCandidate[];
}

export interface TimelineEntry {
  id: number;
  type: string;
  occurredAt: string;
  summary: string;
  payload: unknown;
}
