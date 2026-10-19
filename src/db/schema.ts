// Core domain schema for the Leados strategic intelligence platform.
//
// Tables:
// - decisions: strategic/operational decisions tracked through their lifecycle
// - events: the append-only event stream (findings, shifts, alerts, etc.)
// - metricValues: time series of named metrics (financial, delivery, etc.)
// - scenarios: monitored strategic scenarios with a running probability model
// - okrs: objectives & key results (self-referencing tree via parentId)
// - hypotheses: Bayesian hypotheses tracked by the inference layer
// - innovationPortfolioItems: horizon-based innovation bets
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  domain: text("domain").default("general"),
  // open | deferred | pending | decided | rejected
  status: text("status").notNull().default("open"),
  impact: integer("impact").notNull().default(3), // 1-5
  probability: numeric("probability").notNull().default("0.5"), // 0-1
  deadline: timestamp("deadline", { withTimezone: true }),
  optionCostToDecide: numeric("option_cost_to_decide").default("10000"),
  optionVolatility: numeric("option_volatility").default("0.35"),
  context: jsonb("context").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  domain: text("domain").default("general"),
  severity: integer("severity").notNull().default(1), // 1-5
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const metricValues = pgTable("metric_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  metricKey: text("metric_key").notNull(),
  value: numeric("value").notNull(),
  unit: text("unit"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
});

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  domain: text("domain").default("general"),
  probability: numeric("probability").notNull().default("0.3"),
  previousProbability: numeric("previous_probability").notNull().default("0.3"),
  // monitoring | activated | resolved
  status: text("status").notNull().default("monitoring"),
  driverTags: jsonb("driver_tags").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const okrs = pgTable("okrs", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  // objective | key_result
  type: text("type").notNull(),
  parentId: uuid("parent_id"),
  ownerId: text("owner_id"),
  targetValue: numeric("target_value").notNull().default("100"),
  currentValue: numeric("current_value").notNull().default("0"),
  unit: text("unit").default("%"),
  quarter: text("quarter").notNull(), // e.g. "2026-Q1"
  // on_track | at_risk | off_track
  status: text("status").notNull().default("on_track"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(),
  statement: text("statement").notNull(),
  priorProbability: numeric("prior_probability").notNull().default("0.5"),
  posteriorProbability: numeric("posterior_probability").notNull().default("0.5"),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const innovationPortfolioItems = pgTable("innovation_portfolio_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // core | adjacent | transformational
  horizon: text("horizon").notNull().default("core"),
  investment: numeric("investment").notNull().default("0"),
  expectedReturn: numeric("expected_return").notNull().default("0"),
  riskScore: numeric("risk_score").notNull().default("0.5"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
