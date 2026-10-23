// Part 59 — World Model & Scenario Simulation Twin: database schema.
//
// Four tables form the substrate:
//   metrics              — the catalog of things the organization tracks
//   metric_observations  — the append-only time series for each metric
//   simulation_runs      — a stored Monte Carlo forward simulation (with an
//                          optional intervention), including the percentile
//                          bands so results never have to be recomputed to
//                          be displayed again
//   forecast_backtests   — "fit on data up to cutoff, predict `horizon`
//                          periods ahead, compare to what actually happened"
//                          records, which is how the calibration gate
//                          (Part 59 PHASE 4) is measured honestly instead of
//                          asserted.
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Metrics catalog
// ---------------------------------------------------------------------------
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull().default(""),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("metrics_key_idx").on(t.key)],
);

// ---------------------------------------------------------------------------
// Observations — append-only time series. `period` is an ISO date (one row
// per metric per period). No UPDATE path is exposed in the app layer: a
// correction is a new observation with a later `createdAt`, and consumers
// always take the latest-created row per (metricId, period).
// ---------------------------------------------------------------------------
export const metricObservations = pgTable(
  "metric_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // ISO date, e.g. "2026-01-01"
    value: numeric("value", { precision: 18, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("metric_observations_metric_period_idx").on(t.metricId, t.period),
  ],
);

// ---------------------------------------------------------------------------
// Simulation runs — a seeded Monte Carlo forward simulation, optionally with
// a "do(x)" intervention from a given period onward. The percentile bands
// are persisted so a run is a permanent, reviewable artifact (never silently
// recomputed with a different seed later).
// ---------------------------------------------------------------------------
export const simulationRuns = pgTable(
  "simulation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    method: text("method").notNull().default("monte-carlo-ols"),
    trials: integer("trials").notNull(),
    horizon: integer("horizon").notNull(),
    seed: integer("seed").notNull(),
    interventionFromStep: integer("intervention_from_step"), // null = no intervention
    interventionDelta: numeric("intervention_delta", { precision: 18, scale: 6 }),
    fittedSlope: numeric("fitted_slope", { precision: 18, scale: 6 }).notNull(),
    fittedIntercept: numeric("fitted_intercept", { precision: 18, scale: 6 }).notNull(),
    fittedResidualStd: numeric("fitted_residual_std", { precision: 18, scale: 6 }).notNull(),
    // Per-step percentile bands: [{ step, p10, p50, p90, mean }]
    bands: jsonb("bands").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("simulation_runs_metric_idx").on(t.metricId)],
);

// ---------------------------------------------------------------------------
// Forecast backtests — the calibration ledger. Each row is one
// (metric, cutoff period, horizon) trial: fit strictly on data up to and
// including `cutoffPeriod`, forecast `horizon` periods ahead, and record
// whether the value that actually occurred fell inside the forecast's
// central 80% interval (P10–P90).
// ---------------------------------------------------------------------------
export const forecastBacktests = pgTable(
  "forecast_backtests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    cutoffPeriod: text("cutoff_period").notNull(),
    horizon: integer("horizon").notNull(),
    targetPeriod: text("target_period").notNull(),
    p10: numeric("p10", { precision: 18, scale: 6 }).notNull(),
    p50: numeric("p50", { precision: 18, scale: 6 }).notNull(),
    p90: numeric("p90", { precision: 18, scale: 6 }).notNull(),
    actual: numeric("actual", { precision: 18, scale: 6 }).notNull(),
    withinInterval: boolean("within_interval").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forecast_backtests_metric_idx").on(t.metricId)],
);
