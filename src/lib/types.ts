// ─────────────────────────────────────────────────────────────────────────
// Shared types for the LeadOS probabilistic intelligence layer.
// ─────────────────────────────────────────────────────────────────────────

export type Domain = "people" | "finance" | "sales" | "ops" | "strategy";
export type Severity = 1 | 2 | 3 | 4 | 5;

/** The closed set of raw signal types the event log accepts. */
export type EventType =
  | "people.oneonone.logged"
  | "people.pulse.logged"
  | "people.feedback.logged"
  | "people.comp.reviewed"
  | "hr.flightrisk.flag"
  | "hr.attrition"
  | "engagement.decline"
  | "decision.logged"
  | "decision.escalate"
  | "decision.resolved"
  | "ops.incident"
  | "sales.pipeline.snapshot"
  | "pipeline.thin"
  | "fin.runway.snapshot"
  | "fin.runway.drop"
  | "fin.pl.logged"
  | "strategy.okr.review";

export type PersonId = string;

export interface Person {
  id: PersonId;
  name: string;
  role: string;
  team: string;
  tenureStartAt: Date;
}

export interface LeadosEvent {
  id: string;
  type: EventType | string;
  domain: Domain;
  personId: PersonId | null;
  data: Record<string, unknown>;
  occurredAt: Date;
}

/** A single detected condition produced by the intelligence engine. */
export interface Finding {
  /** Stable key used to diff findings across autonomous runs (rule+entity). */
  key: string;
  rule: string;
  domain: Domain;
  sev: Severity;
  personId?: PersonId;
  personName?: string;
  title: string;
  detail: string;
  suggestedAction?: string;
  /** Posterior probability (0-1) backing this finding, when available. */
  probability?: number;
}

export interface AppState {
  events: LeadosEvent[];
  roster: Person[];
}

// ───────────────────────── Work queue ─────────────────────────

export type WorkItemStatus = "pending" | "in_progress" | "resolved" | "dismissed";

export interface WorkItem {
  id: number;
  title: string;
  steps: string[];
  status: WorkItemStatus;
  domain: Domain;
  /** The rule key of the finding that generated this item. */
  source: string;
  findingKey: string;
  priority: Severity;
  dueAt: Date | null;
  assignedTo: number | null;
  assignedToName?: string | null;
  blockedBy: number[];
  outcomeNotes: string | null;
  suggestedAction?: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface NewWorkItemInput {
  title: string;
  steps: string[];
  domain: Domain;
  source: string;
  findingKey: string;
  priority: Severity;
  dueAt: Date;
  suggestedAction?: string;
}

// ───────────────────────── Notifications ─────────────────────────

export type NotificationType = "finding_new" | "finding_resolved" | "work_item" | "escalation" | "system";

export interface AppNotification {
  id: number;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  entityType: string | null;
  entityId: number | null;
}

export interface NewNotificationInput {
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  entityType?: string;
  entityId?: number;
}

// ───────────────────────── Autonomous runs ─────────────────────────

export interface AutonomousRunSummary {
  id: number;
  ranAt: string;
  findingsCount: number;
  actionsTaken: number;
  escalations: number;
  durationMs: number;
  summary: string;
}

export interface AutonomousRunResult {
  runAt: string;
  durationMs: number;
  findings: Finding[];
  newFindings: Finding[];
  resolvedFindings: Finding[];
  newWorkItems: NewWorkItemInput[];
  staleWorkItemIds: number[];
  escalations: Finding[];
  notifications: NewNotificationInput[];
  counts: {
    findings: number;
    newFindings: number;
    resolvedFindings: number;
    newWorkItems: number;
    escalations: number;
  };
  summary: string;
}
