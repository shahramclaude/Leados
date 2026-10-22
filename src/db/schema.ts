// src/db/schema.ts
//
// Part 29 — GRC: quantified risk register, control library + testing,
// obligation tracker, policy lifecycle, risk appetite engine, and the
// hash-chained audit/evidence log that backs every "compliant" claim in
// this module.
//
// Design notes (read before editing):
//  - Distributions (Beta beliefs, log-normal impact params, Monte Carlo
//    results) are stored as JSONB rather than being decomposed into columns.
//    This keeps the schema stable as the quantification model evolves, at
//    the cost of needing app-level validation (see src/lib/risk.ts).
//  - Every table that can ever show a "compliant / passed / green" status in
//    the UI carries an `evidenceRef` (audit_events.id) or is derived from one.
//    See src/lib/complianceStatus.ts for the single allowed code path.

import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Audit / evidence chain (Part 19 contract, reconstructed — see src/lib/audit.ts)
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    prevHash: varchar("prev_hash", { length: 64 }).notNull(),
    hash: varchar("hash", { length: 64 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 60 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    actor: varchar("actor", { length: 120 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("audit_events_sequence_idx").on(t.sequence)],
);

// ---------------------------------------------------------------------------
// Risk register
// ---------------------------------------------------------------------------

export const risks = pgTable("risks", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  cause: text("cause").notNull(),
  event: text("event").notNull(),
  consequence: text("consequence").notNull(),
  category: varchar("category", { length: 60 }).notNull(), // financial | operational | compliance | security | strategic ...
  owner: varchar("owner", { length: 120 }).notNull(),
  // BetaBelief for annual occurrence probability: { alpha, beta, priorRationale }
  likelihood: jsonb("likelihood").$type<{ alpha: number; beta: number; priorRationale?: string }>().notNull(),
  // impact distribution descriptor — financial: lognormal{mu,sigma,currency}; else categorical{labels,probabilities}
  impact: jsonb("impact").$type<ImpactDistribution>().notNull(),
  velocityDays: numeric("velocity_days", { precision: 10, scale: 2 }).notNull(), // time from event to peak consequence
  detectability: jsonb("detectability").$type<{ alpha: number; beta: number; priorRationale?: string }>().notNull(), // BetaBelief: P(detected before peak consequence)
  linkedDecisions: jsonb("linked_decisions").$type<string[]>().notNull().default([]),
  linkedIndicators: jsonb("linked_indicators").$type<string[]>().notNull().default([]), // Part 13 EWI ids
  status: varchar("status", { length: 20 }).notNull().default("open"), // open | monitoring | closed
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type ImpactDistribution =
  | { kind: "lognormal"; mu: number; sigma: number; currency: string }
  | { kind: "categorical"; labels: string[]; probabilities: number[] };

// ---------------------------------------------------------------------------
// Control library + risk-control mapping + testing
// ---------------------------------------------------------------------------

export const controls = pgTable("controls", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // preventive | detective | corrective
  mechanism: varchar("mechanism", { length: 20 }).notNull(), // manual | automated
  testProcedure: text("test_procedure").notNull(),
  testProcedureKey: varchar("test_procedure_key", { length: 60 }).notNull(), // maps to a runnable procedure in src/lib/controls.ts
  cadenceDays: integer("cadence_days").notNull(), // how often the control must be tested
  owner: varchar("owner", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const riskControls = pgTable(
  "risk_controls",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
    controlId: integer("control_id").notNull().references(() => controls.id, { onDelete: "cascade" }),
    // BetaBelief over "this control works when relied upon"
    effectiveness: jsonb("effectiveness").$type<{ alpha: number; beta: number; priorRationale?: string }>().notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: "string" }),
    nextTestDueAt: timestamp("next_test_due_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("risk_control_unique_idx").on(t.riskId, t.controlId)],
);

export const controlTests = pgTable("control_tests", {
  id: serial("id").primaryKey(),
  riskControlId: integer("risk_control_id").notNull().references(() => riskControls.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "string" }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true, mode: "string" }),
  result: varchar("result", { length: 10 }), // pass | fail | null (not yet run)
  findings: text("findings"),
  evidenceAuditEventId: integer("evidence_audit_event_id").references(() => auditEvents.id),
  runBy: varchar("run_by", { length: 120 }).notNull().default("part10-test-runner"),
  overdue: boolean("overdue").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Obligations (regulatory / contractual) + policy lifecycle
// ---------------------------------------------------------------------------

export const obligations = pgTable("obligations", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  source: varchar("source", { length: 30 }).notNull(), // regulatory | contractual
  description: text("description").notNull(),
  cadence: jsonb("cadence").$type<ObligationCadence>().notNull(),
  timezone: varchar("timezone", { length: 60 }).notNull().default("UTC"),
  anchorDate: timestamp("anchor_date", { withTimezone: true, mode: "string" }).notNull(),
  linkedControlIds: jsonb("linked_control_ids").$type<number[]>().notNull().default([]),
  linkedRiskIds: jsonb("linked_risk_ids").$type<number[]>().notNull().default([]),
  owner: varchar("owner", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type ObligationCadence =
  | { kind: "once" }
  | { kind: "monthly"; dayOfMonth: number }
  | { kind: "quarterly"; dayOfMonth: number }
  | { kind: "annually"; month: number; dayOfMonth: number };

export const obligationInstances = pgTable("obligation_instances", {
  id: serial("id").primaryKey(),
  obligationId: integer("obligation_id").notNull().references(() => obligations.id, { onDelete: "cascade" }),
  periodLabel: varchar("period_label", { length: 40 }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | evidenced | overdue | breached | escalated
  evidenceAuditEventId: integer("evidence_audit_event_id").references(() => auditEvents.id),
  evidenceNote: text("evidence_note"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  currentVersionId: integer("current_version_id"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|approved|published|review
  owner: varchar("owner", { length: 120 }).notNull(),
  reviewCadenceDays: integer("review_cadence_days").notNull().default(365),
  nextReviewDueAt: timestamp("next_review_due_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const policyVersions = pgTable("policy_versions", {
  id: serial("id").primaryKey(),
  policyId: integer("policy_id").notNull().references(() => policies.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|approved|published
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  evidenceAuditEventId: integer("evidence_audit_event_id").references(() => auditEvents.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const policyAttestations = pgTable("policy_attestations", {
  id: serial("id").primaryKey(),
  policyVersionId: integer("policy_version_id").notNull().references(() => policyVersions.id, { onDelete: "cascade" }),
  attestant: varchar("attestant", { length: 120 }).notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  evidenceAuditEventId: integer("evidence_audit_event_id").references(() => auditEvents.id),
});

// ---------------------------------------------------------------------------
// Risk appetite
// ---------------------------------------------------------------------------

export const appetiteMetrics = pgTable("appetite_metrics", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  unit: varchar("unit", { length: 30 }).notNull(), // currency | percent | count | days
  thresholdAmber: numeric("threshold_amber", { precision: 18, scale: 4 }).notNull(),
  thresholdRed: numeric("threshold_red", { precision: 18, scale: 4 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull().default("above"), // above|below — breach if actual is above/below threshold
  linkedRiskIds: jsonb("linked_risk_ids").$type<number[]>().notNull().default([]),
  source: varchar("source", { length: 60 }).notNull().default("part08-finance"), // provenance of the number
});

export const appetiteObservations = pgTable("appetite_observations", {
  id: serial("id").primaryKey(),
  metricId: integer("metric_id").notNull().references(() => appetiteMetrics.id, { onDelete: "cascade" }),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  value: numeric("value", { precision: 18, scale: 4 }).notNull(),
  status: varchar("status", { length: 10 }).notNull(), // green|amber|red
  findingId: integer("finding_id"),
});

// ---------------------------------------------------------------------------
// Findings (feeds Part 23 decisions) + minimal decision stub
// ---------------------------------------------------------------------------

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(), // low|medium|high|critical
  sourceType: varchar("source_type", { length: 30 }).notNull(), // appetite_breach|control_overdue|obligation_breach
  sourceRef: varchar("source_ref", { length: 60 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open|referred|closed
  linkedDecisionId: integer("linked_decision_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// Part 23 decision register — minimal stand-in (see src/lib/decisions.ts for the honesty note).
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("proposed"), // proposed|accepted|rejected|implemented
  rationale: text("rationale").notNull(),
  linkedFindingIds: jsonb("linked_finding_ids").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// Part 13 early-warning indicators — minimal stand-in, linked by id string on risks.linkedIndicators.
export const earlyWarningIndicators = pgTable("early_warning_indicators", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  currentLevel: varchar("current_level", { length: 10 }).notNull().default("normal"), // normal|elevated|critical
  description: text("description").notNull(),
});

// ---------------------------------------------------------------------------
// Monte Carlo run cache (so the UI doesn't re-simulate on every page view)
// ---------------------------------------------------------------------------

export const riskSimulationRuns = pgTable("risk_simulation_runs", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
  trials: integer("trials").notNull(),
  seed: integer("seed").notNull(),
  inherentSummary: jsonb("inherent_summary").$type<Record<string, unknown>>().notNull(),
  residualSummary: jsonb("residual_summary").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const portfolioSimulationRuns = pgTable("portfolio_simulation_runs", {
  id: serial("id").primaryKey(),
  trials: integer("trials").notNull(),
  seed: integer("seed").notNull(),
  correlationAssumption: varchar("correlation_assumption", { length: 30 }).notNull(),
  rho: numeric("rho", { precision: 5, scale: 4 }).notNull(),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
  sensitivity: jsonb("sensitivity").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
