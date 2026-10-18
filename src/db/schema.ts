// Database schema for the Leados autonomous intelligence platform.
//
// NOTE ON SCOPE: This task ("Part 2 of 8") assumes a Part 1 foundation
// (people/domains/rules/orchestrator) that was not actually present in
// this repository snapshot. The core entity tables below (people,
// domains, metricSnapshots, causalChains, rules, decisionOutcomes) were
// reconstructed as minimal scaffolding so the Part 2 deliverables
// (rule calibration, hypothesis generation/resolution, agent audit log)
// have real tables to read/write. The Part 2-specific tables
// (hypotheses, agentAuditLog) and all calibration/hypothesis logic are
// the primary deliverables of this task.

import {
  pgTable,
  serial,
  text,
  real,
  boolean,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 1 scaffolding (reconstructed minimal entities required by Part 2)
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  department: text("department"),
  // Simulated/derived flight risk score in [0, 1]. Updated each agent run.
  flightRiskScore: real("flight_risk_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable("domains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  healthScore: real("health_score").notNull().default(100),
  priorHealthScore: real("prior_health_score").notNull().default(100),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metricSnapshots = pgTable("metric_snapshots", {
  id: serial("id").primaryKey(),
  domainId: integer("domain_id").references(() => domains.id),
  metricName: text("metric_name").notNull(),
  value: real("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const causalChains = pgTable("causal_chains", {
  id: serial("id").primaryKey(),
  causeDomainId: integer("cause_domain_id").references(() => domains.id),
  effectDomainId: integer("effect_domain_id").references(() => domains.id),
  causeLabel: text("cause_label").notNull(),
  effectLabel: text("effect_label").notNull(),
  confidence: real("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  // Live, self-calibrated weight. Clamped to [0.1, 3.0] by selfImprove.ts.
  weight: real("weight").notNull().default(1.0),
  baseWeight: real("base_weight").notNull().default(1.0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-run evaluation record for a rule. `outcome` is filled in later (by
// resolveHypotheses or manual review) once ground truth is known, which is
// what allows Brier-score calibration in selfImprove.ts.
export const ruleEvaluations = pgTable("rule_evaluations", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => rules.id),
  runId: text("run_id").notNull(),
  predictedProbability: real("predicted_probability").notNull(),
  outcome: boolean("outcome"),
  context: jsonb("context"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// "Decision outcomes" referenced by the calibration spec: discrete
// decisions the system made (e.g. "escalate", "ignore") tied to a rule,
// resolved later with an actual outcome. Feeds into the same Brier pool
// as rule_evaluations.
export const decisionOutcomes = pgTable("decision_outcomes", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  ruleId: integer("rule_id").references(() => rules.id),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  decision: text("decision").notNull(),
  predictedProbability: real("predicted_probability").notNull().default(1.0),
  outcome: boolean("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Part 2 deliverables
// ---------------------------------------------------------------------------

export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'person' | 'domain' | 'causal_chain'
  claim: text("claim").notNull(),
  // Optional link back to the rule that should be rewarded/penalized once resolved.
  ruleKey: text("rule_key"),
  // Baseline/trigger data captured at creation time, used by resolveHypotheses
  // to compare "current" vs "at creation" state without re-deriving it.
  context: jsonb("context"),
  predictedBy: timestamp("predicted_by", { withTimezone: true }).notNull(),
  resolveBy: timestamp("resolve_by", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // open | confirmed | refuted
  outcomeValue: jsonb("outcome_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const agentAuditLog = pgTable("agent_audit_log", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
