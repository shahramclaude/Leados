// src/db/schema.ts
//
// Persistence for the Simulation Lab (Part 06): a durable cache of ensemble
// results keyed by (scenarioHash, seedBase, modelVersion) so repeated runs of
// the same scenario are instant and auditable, plus a small history of
// backtest/calibration reports.
//
// All JSON payloads stored here are MODEL ESTIMATES produced by
// src/lib/twin/*. Nothing in this schema represents an observation of a real
// organisation.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const simRuns = pgTable(
  "sim_runs",
  {
    id: serial("id").primaryKey(),
    scenarioHash: text("scenario_hash").notNull(),
    seedBase: integer("seed_base").notNull(),
    modelVersion: text("model_version").notNull(),
    scenarioName: text("scenario_name").notNull(),
    scenarioDefinition: jsonb("scenario_definition").notNull(),
    runsRequested: integer("runs_requested").notNull(),
    runsCompleted: integer("runs_completed").notNull(),
    horizonWeeks: integer("horizon_weeks").notNull(),
    durationMs: integer("duration_ms").notNull(),
    bands: jsonb("bands").notNull(),
    controlVariateDiagnostics: jsonb("control_variate_diagnostics"),
    cancelled: boolean("cancelled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sim_runs_cache_key").on(table.scenarioHash, table.seedBase, table.modelVersion),
    index("sim_runs_created_at_idx").on(table.createdAt),
  ],
);

export const simBacktests = pgTable(
  "sim_backtests",
  {
    id: serial("id").primaryKey(),
    modelVersion: text("model_version").notNull(),
    metric: text("metric").notNull(),
    casesEvaluated: integer("cases_evaluated").notNull(),
    casesCovered: integer("cases_covered").notNull(),
    empiricalCoveragePct: real("empirical_coverage_pct").notNull(),
    withinGate: boolean("within_gate").notNull(),
    report: jsonb("report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sim_backtests_model_version_idx").on(table.modelVersion)],
);

export const simAttributions = pgTable(
  "sim_attributions",
  {
    id: serial("id").primaryKey(),
    baselineHash: text("baseline_hash").notNull(),
    interventionHash: text("intervention_hash").notNull(),
    metric: text("metric").notNull(),
    modelVersion: text("model_version").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sim_attributions_cache_key").on(
      table.baselineHash,
      table.interventionHash,
      table.metric,
      table.modelVersion,
    ),
  ],
);
