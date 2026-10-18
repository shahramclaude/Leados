import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Metrics — time-series readings for any business metric Leados tracks.
// Each row is a single point-in-time reading. The same `key` accumulates a
// history that the metrics engine turns into health scores, forecasts and
// anomaly detections.
// ---------------------------------------------------------------------------
export const leadosMetrics = pgTable("leados_metrics", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: real("value").notNull(),
  domain: text("domain").notNull().default("ops"),
  note: text("note"),

  // Context fields — usually mirrored from the metric definition at write
  // time so a historical reading keeps the target/benchmark that applied
  // when it was logged, but can also be overridden per-reading.
  unit: text("unit"),
  target: real("target"),
  benchmark: real("benchmark"),
  benchmarkSource: text("benchmark_source"),
  isLeading: boolean("is_leading").default(false),
  formula: text("formula"),
  tags: text("tags").array(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Metric definitions — the catalog of every known metric: what it means,
// how it's computed, and what "good" looks like.
// ---------------------------------------------------------------------------
export const leadosMetricDefinitions = pgTable("leados_metric_definitions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
  domain: text("domain").notNull().default("general"),
  unit: text("unit"),
  description: text("description").notNull().default(""),
  formula: text("formula"),
  target: real("target"),
  benchmark: real("benchmark"),
  benchmarkSource: text("benchmark_source"),
  isLeading: boolean("is_leading").notNull().default(false),
  isLagging: boolean("is_lagging").notNull().default(false),
  tags: text("tags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Forecasts — cached model output for a metric: predicted values, confidence
// bands, the method that produced them, and how accurate it was on holdout.
// ---------------------------------------------------------------------------
export const leadosForecasts = pgTable("leados_forecasts", {
  id: serial("id").primaryKey(),
  metricKey: text("metric_key").notNull(),
  method: text("method").notNull(),
  horizonDays: integer("horizon_days").notNull(),
  predictedValues: jsonb("predicted_values").$type<{ date: string; p50: number }[]>().notNull(),
  confidenceIntervals: jsonb("confidence_intervals")
    .$type<{ date: string; p10: number; p90: number }[]>()
    .notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  accuracyScore: real("accuracy_score"),
});

export type MetricRow = typeof leadosMetrics.$inferSelect;
export type NewMetricRow = typeof leadosMetrics.$inferInsert;
export type MetricDefinitionRow = typeof leadosMetricDefinitions.$inferSelect;
export type NewMetricDefinitionRow = typeof leadosMetricDefinitions.$inferInsert;
export type ForecastRow = typeof leadosForecasts.$inferSelect;
export type NewForecastRow = typeof leadosForecasts.$inferInsert;
