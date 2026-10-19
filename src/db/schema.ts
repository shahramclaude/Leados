import {
  pgTable,
  serial,
  text,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Metrics Intelligence OS — core tables.
//
// NOTE: this is a greenfield bootstrap of the schema for this sandbox. The
// task brief references "Part 1" artifacts (metric_defs, metric_values,
// beliefFabric, etc.) that do not exist in this repository snapshot, so the
// tables below define the minimal real shape needed to support Part 9
// (Metrics Intelligence OS) end-to-end.
// ---------------------------------------------------------------------------

export const metricDefs = pgTable("metric_defs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  unit: text("unit").default("").notNull(),
  higherIsBetter: boolean("higher_is_better").default(true).notNull(),
  target: doublePrecision("target"),
  weight: doublePrecision("weight").default(1).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const metricValues = pgTable("metric_values", {
  id: serial("id").primaryKey(),
  metricKey: text("metric_key")
    .notNull()
    .references(() => metricDefs.key),
  value: doublePrecision("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Generic event stream ("LeadosEvent") that the orchestrator / metrics
// intelligence pipeline can read context from (e.g. campaign launches,
// pricing changes) when explaining anomalies or causal hypotheses.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  metricKey: text("metric_key"),
  domain: text("domain"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Minimal knowledge-graph node table so the metric detail panel can surface
// "context from knowledge graph" for a metric key.
export const memoryNodes = pgTable("memory_nodes", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  domain: text("domain").default("").notNull(),
  linkedMetricKeys: jsonb("linked_metric_keys").$type<string[]>().default([]).notNull(),
  content: text("content").default("").notNull(),
  importance: doublePrecision("importance").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Belief Fabric observable log — append-only record of observables ingested
// from the orchestrator pipeline (e.g. composite domain scores) so beliefs
// can be reconstructed / audited.
export const beliefObservables = pgTable("belief_observables", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: doublePrecision("value").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  source: text("source").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MetricDefRow = typeof metricDefs.$inferSelect;
export type MetricValueRow = typeof metricValues.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type MemoryNodeRow = typeof memoryNodes.$inferSelect;
export type BeliefObservableRow = typeof beliefObservables.$inferSelect;
