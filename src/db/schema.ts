// LEADOS core schema.
//
// Tables are grouped by the six cross-domain "seams" this build proves end
// to end (see docs/SYSTEM-MAP.md and docs/EVIDENCE-LEDGER.md):
//   1. domains + metrics          -> fitnessScores      (fitness reads every domain's metrics)
//   2. engines + assuranceChecks  -> assurance summary   (assurance monitors every engine)
//   3. risks + chaosExperiments                          (chaos results update risk beliefs)
//   4. entities + consolidationRuns + boardPacks          (global entities -> consolidation -> board pack)
//   5. vocFeedback -> strategyItems                       (VoC links to strategy)
//   6. processEvents -> automationScores                  (process mining feeds automation scoring)
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// 1. Fitness: domains + metrics -> fitnessScores
// ---------------------------------------------------------------------------
export const domains = pgTable("domains", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  domainId: integer("domain_id")
    .notNull()
    .references(() => domains.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: numeric("value").notNull(),
  target: numeric("target").notNull(),
  unit: text("unit").notNull(),
  period: text("period").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fitnessScores = pgTable("fitness_scores", {
  id: serial("id").primaryKey(),
  domainId: integer("domain_id")
    .notNull()
    .references(() => domains.id, { onDelete: "cascade" }),
  score: numeric("score").notNull(),
  metricCount: integer("metric_count").notNull(),
  inputs: jsonb("inputs").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 2. Assurance: engines + assuranceChecks
// ---------------------------------------------------------------------------
export const engines = pgTable("engines", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

export const assuranceChecks = pgTable("assurance_checks", {
  id: serial("id").primaryKey(),
  engineId: integer("engine_id")
    .notNull()
    .references(() => engines.id, { onDelete: "cascade" }),
  checkType: text("check_type").notNull(),
  result: text("result").notNull(),
  severity: text("severity").notNull().default("info"),
  notes: text("notes"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 3. Chaos -> risk belief
// ---------------------------------------------------------------------------
export const risks = pgTable("risks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  likelihood: numeric("likelihood").notNull(),
  impact: numeric("impact").notNull(),
  beliefScore: numeric("belief_score").notNull(),
  status: text("status").notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chaosExperiments = pgTable("chaos_experiments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetRiskId: integer("target_risk_id")
    .notNull()
    .references(() => risks.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(),
  beliefBefore: numeric("belief_before").notNull(),
  beliefAfter: numeric("belief_after").notNull(),
  notes: text("notes"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 4. Global entities -> consolidation -> board pack
// ---------------------------------------------------------------------------
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  currency: text("currency").notNull(),
  revenue: numeric("revenue").notNull(),
  costs: numeric("costs").notNull(),
  fxRateToUsd: numeric("fx_rate_to_usd").notNull().default("1"),
  period: text("period").notNull(),
});

export const consolidationRuns = pgTable("consolidation_runs", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),
  totalRevenueUsd: numeric("total_revenue_usd").notNull(),
  totalCostsUsd: numeric("total_costs_usd").notNull(),
  entityCount: integer("entity_count").notNull(),
  fxNotes: jsonb("fx_notes").notNull(),
  status: text("status").notNull().default("draft"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
});

export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),
  consolidationRunId: integer("consolidation_run_id")
    .notNull()
    .references(() => consolidationRuns.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 5. Voice of customer -> strategy
// ---------------------------------------------------------------------------
export const strategyItems = pgTable("strategy_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull().default("proposed"),
  priority: text("priority").notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vocFeedback = pgTable("voc_feedback", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sentiment: text("sentiment").notNull(),
  theme: text("theme").notNull(),
  text: text("text").notNull(),
  linkedStrategyId: integer("linked_strategy_id").references(() => strategyItems.id, {
    onDelete: "set null",
  }),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 6. Process mining -> automation scoring
// ---------------------------------------------------------------------------
export const processEvents = pgTable("process_events", {
  id: serial("id").primaryKey(),
  processName: text("process_name").notNull(),
  step: text("step").notNull(),
  durationMs: integer("duration_ms").notNull(),
  automatable: boolean("automatable").notNull().default(false),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const automationScores = pgTable("automation_scores", {
  id: serial("id").primaryKey(),
  processName: text("process_name").notNull(),
  score: numeric("score").notNull(),
  eventCount: integer("event_count").notNull(),
  basis: jsonb("basis").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});
