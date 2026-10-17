/**
 * LEADOS Synthesis — shared types.
 *
 * DISCLOSURE (see AI-SESSION-LOG.md for full method):
 * None of these shapes are copied from the real github.com/wbweve/Leados
 * repo. That repo's verified store.js uses a decisions/KRs/risk schema
 * under window.LeadOS / key "leados:data" / schemaVersion 5 — fetched and
 * read directly this session, not inferred. It has no "finding / domain
 * score" concept to port.
 *
 * This file instead extends the generic Finding/Projection model that a
 * *previous* AI session already built and committed into this same repo
 * (types.ts, engine.ts, velocity.ts, orgPhysics.ts — all explicitly
 * disclosed in their own header comments as fresh, non-real-repo
 * constructions written "from the pasted brief"). Reusing that lineage
 * keeps this delivery consistent with the repo's own house style instead
 * of inventing a fourth, unrelated schema. Three numeric constants are
 * carried forward because they were independently verified against the
 * real repo's raw engine.js/store.js in a prior session: the 0.85/day
 * heatmap decay, the 90-day correlation window, and the 21-day decision
 * staleness gate.
 */

export type Domain = "people" | "finance" | "ops" | "strategy" | "legal" | "product";

export const DOMAINS: Domain[] = ["people", "finance", "ops", "strategy", "legal", "product"];

export type Confidence = "low" | "med" | "high";

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
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  domain: Domain | "org";
  ownerId: string | null;
  ts: string;
  lastProgressTs: string | null;
  closed: boolean;
  result?: string;
}

export interface Decision {
  id: string;
  title: string;
  domain: Domain | "org";
  ts: string;
  confidence?: number; // 0..1, leader's stated confidence at the time — fabricated field, needed for calibration
  outcome?: "success" | "failure";
  outcomeTs?: string;
}

export interface Commitment {
  id: string;
  ownerId: string | null;
  desc: string;
  by_date: string;
  ts: string;
  resolved: boolean;
  resolvedTs?: string;
}

export interface GrowthPlan {
  id: string;
  personId: string;
  domain: Domain | "org";
  spine: { d: "D1" | "D2" | "D3" | "D4"; ts: string }[];
}

export interface SuccessionCandidate {
  id: string;
  personId: string;
  role: string;
  ts: string;
}

export interface Finding {
  key: string;
  domain: Domain | "org";
  sev: number; // 1..5
  conf: Confidence;
  score: number; // leverage-calc input, derived in run()
  ts: string;
  title: string;
  rule: string;
  play?: string; // playbook name, a subset of rules only
}

export interface Projection {
  state: { events: LeadosEvent[] };
  meta: { createdAt: string | null };
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
  growthPlans: GrowthPlan[];
  successionCandidates: SuccessionCandidate[];
}
