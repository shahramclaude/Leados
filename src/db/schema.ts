import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Fixed 8-domain taxonomy for the Leados command center. Every chart, radar
// axis and heatmap row is driven off this single enum so the UI never has to
// guess at domain membership.
// ---------------------------------------------------------------------------
export const domainEnum = pgEnum("domain", [
  "people",
  "risk",
  "pipeline",
  "finance",
  "product",
  "customer",
  "strategy",
  "operations",
]);

export const severityEnum = pgEnum("severity", ["1", "2", "3", "4", "5"]);

export const hypothesisStatusEnum = pgEnum("hypothesis_status", [
  "open",
  "confirmed",
  "refuted",
]);

export const decisionStatusEnum = pgEnum("decision_status", [
  "open",
  "overdue",
  "resolved",
]);

// Each orchestrator pass writes one row per rule, per run. Keeping a history
// of rows is what powers the Signal Board sparklines and the severity
// heatmap (grouping by day + domain).
export const ruleEvaluations = pgTable("rule_evaluations", {
  id: serial("id").primaryKey(),
  ruleKey: text("rule_key").notNull(),
  domain: domainEnum("domain").notNull(),
  title: text("title").notNull(),
  score: real("score").notNull(),
  severity: integer("severity").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily-ish snapshots of the aggregate domain score, used for the radar's
// "ghost" prior polygon and for the single orgHealthScore delta.
export const domainScores = pgTable("domain_scores", {
  id: serial("id").primaryKey(),
  domain: domainEnum("domain").notNull(),
  score: real("score").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleKey: text("rule_key").notNull(),
  domain: domainEnum("domain").notNull(),
  severity: integer("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  probability: real("probability"),
  causalChainId: text("causal_chain_id"),
  amplificationFactor: real("amplification_factor"),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const causalChains = pgTable("causal_chains", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  ruleKeys: jsonb("rule_keys").notNull().$type<string[]>(),
  amplificationFactor: real("amplification_factor").notNull().default(1),
});

export const riskItems = pgTable("risk_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  domain: domainEnum("domain").notNull().default("risk"),
  probability: real("probability").notNull(),
  impact: real("impact").notNull(),
  amplificationFactor: real("amplification_factor"),
  causalChainId: text("causal_chain_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  flightRiskProbability: real("flight_risk_probability").notNull(),
  burnoutIndex: real("burnout_index").notNull(),
  cadenceHealth: real("cadence_health").notNull(),
  lastOneOnOneAt: timestamp("last_one_on_one_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  status: decisionStatusEnum("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  cycleTimeDays: real("cycle_time_days"),
});

export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  domain: domainEnum("domain").notNull(),
  status: hypothesisStatusEnum("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  resolveBy: timestamp("resolve_by", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  outcome: text("outcome"),
});
