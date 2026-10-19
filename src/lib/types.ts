// ─────────────────────────────────────────────────────────────
// LEADOS core domain types — org physics data model
// Adapted for this sandbox build (Part 3 — Intelligence View).
// ─────────────────────────────────────────────────────────────

export type DomainKey = "finance" | "people" | "strategy" | "ops" | "rd" | "compliance" | "manufacturing" | "cs";

export const DOMAINS: DomainKey[] = ["finance", "people", "strategy", "ops", "rd", "compliance", "manufacturing", "cs"];

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  finance: "Finance",
  people: "People",
  strategy: "Strategy",
  ops: "Operations",
  rd: "R&D",
  compliance: "Compliance",
  manufacturing: "Manufacturing",
  cs: "Customer Success",
};

/** Fixed hex per domain — used for the dot under the domain name in the velocity matrix. */
export const DOMAIN_COLORS: Record<DomainKey, string> = {
  finance: "#34d399",
  people: "#60a5fa",
  strategy: "#a78bfa",
  ops: "#fbbf24",
  rd: "#22d3ee",
  compliance: "#f87171",
  manufacturing: "#fb923c",
  cs: "#f472b6",
};

export type Confidence = "high" | "med" | "low";

export interface Person {
  id: string;
  name: string;
  title: string;
  createdAt: string; // ISO — tenure start
  reportsTo: string | null;
}

export interface Goal {
  id: string;
  title: string;
  ownerId: string | null;
  ts: string;
  lastProgressTs?: string;
}

export interface DecisionRec {
  id: string;
  title: string;
  ts: string;
  resolvedTs?: string;
}

export type LeadosEventType =
  | "signal.raised"
  | "goal.set"
  | "goal.progress"
  | "goal.closed"
  | "decision.logged"
  | "decision.outcome"
  | "info.pipeline.check"
  | "plan.closed"
  | "ops.milestone.updated"
  | "conflict.resolved"
  | "culture.signal"
  | "commitment.made";

export interface LeadosEvent {
  id: string;
  ts: string; // ISO
  type: LeadosEventType;
  data: Record<string, any>;
}

export interface Projection {
  people: Person[];
  peopleById: Record<string, Person>;
  openGoals: Goal[];
  openDecisions: DecisionRec[];
  decisionById: Record<string, DecisionRec>;
  lines: { broken: string[] };
  state: { events: LeadosEvent[] };
}

export interface Finding {
  id: string;
  domain: DomainKey;
  sev: number;
  title: string;
}
