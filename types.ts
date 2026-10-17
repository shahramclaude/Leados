/**
 * LEADOS — shared types for this sandbox build.
 *
 * DISCLOSURE: none of these shapes are copy-pasted from the real
 * github.com/wbweve/Leados repo. They are a fresh, minimal data model
 * designed to make the pasted "Organizational Physics" + "Temporal
 * Velocity" briefs runnable end-to-end. Two names ARE deliberately
 * borrowed from facts independently verified this session by raw-fetching
 * the real repo's store.js / engine.js (see AI-SESSION-LOG.md):
 *   - the decay constant 0.85            (real repo: heatmapDecayFactor)
 *   - the 90-day correlation window      (real repo: correlationWindowDays)
 *   - the 21-day decision staleness gate (real repo: decisionMaxOpenDays)
 * Everything else here (event names, P shape, domains) is this session's
 * own construction because the real repo does not expose
 * `LEADOS.correlate.heatmap` / `P.state.events` under those names
 * (confirmed not found this session — see log).
 */

export type Domain = "people" | "finance" | "ops" | "strategy" | "legal";

export const DOMAINS: Domain[] = ["people", "finance", "ops", "strategy", "legal"];

export interface LeadosEvent<T = any> {
  id: string;
  ts: string; // ISO-8601
  type: string;
  data: T;
  meta?: { seeded?: boolean; [k: string]: any };
}

export interface Person {
  id: string;
  name: string;
  title: string;
  reportsTo: string | null;
  createdAt: string; // ISO — tenure start
}

export interface Goal {
  id: string;
  title: string;
  domain: Domain | "org";
  ownerId: string | null;
  ts: string; // goal.set time
  lastProgressTs: string | null;
  closed: boolean;
  result?: string;
}

export interface Decision {
  id: string;
  title: string;
  domain: Domain | "org";
  ts: string;
  outcome?: string;
  outcomeTs?: string;
}

export interface Commitment {
  id: string;
  ownerId: string | null;
  desc: string;
  by_date: string; // ISO date
  ts: string;
  resolved: boolean;
  resolvedTs?: string;
}

export interface Finding {
  key: string;
  domain: Domain | "org";
  sev: number; // 1–5
  ts: string;
  title: string;
  rule: string;
}

export interface Projection {
  state: { events: LeadosEvent[] };
  people: Person[];
  peopleById: Record<string, Person>;
  lines: { broken: { personId: string; reportsTo: string }[] };
  goals: Goal[];
  goalById: Record<string, Goal>;
  openGoals: Goal[];
  decisions: Decision[];
  decisionById: Record<string, Decision>;
  openDecisions: Decision[];
  commitments: Commitment[];
  commitmentById: Record<string, Commitment>;
  openCommitments: Commitment[];
}
