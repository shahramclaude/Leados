// LEADOS — Part 06: Simulation & Complexity Science
//
// This schema adds the persistence surface for the digital twin:
//   - org_events          : Part 01 bitemporal event log STAND-IN. The real
//                            Leados repo owns this table upstream; it is
//                            reproduced here (same shape) so Part 06 can be
//                            built, calibrated, and tested standalone in
//                            this sandbox. Swap for the real import once
//                            Part 01 lands in this codebase.
//   - scm_suppliers       : Part 05 "supply/capacity" layer STAND-IN used by
//                            the `hire` / `price` scenario interventions
//                            (hiring lead time, market hourly cost, monthly
//                            supply of a skill). Same caveat as above.
//   - scenarios / scenario_versions / scenario_runs : Scenario Studio (D).
//   - decisions           : Part 10 decision log STAND-IN, minimal columns
//                            needed to "attach" a scenario to a decision.
//   - calibration_reports : Section E calibration/backtest results.
//   - wargame_runs        : Section F war-game persistence.
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 01 seam (bitemporal event log) — STAND-IN, see header note.
// ---------------------------------------------------------------------------
export const orgEvents = pgTable("org_events", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'agent' | 'work_item' | 'team' | ...
  entityId: text("entity_id").notNull(),
  eventType: text("event_type").notNull(), // 'stage_transition' | 'capacity_change' | ...
  payload: jsonb("payload").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Part 05 seam (supply / capacity market) — STAND-IN, see header note.
// ---------------------------------------------------------------------------
export const scmSuppliers = pgTable("scm_suppliers", {
  id: text("id").primaryKey(),
  skill: text("skill").notNull(),
  hourlyCost: doublePrecision("hourly_cost").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  capacityPerMonth: integer("capacity_per_month").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Scenario Studio
// ---------------------------------------------------------------------------
export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scenarioVersions = pgTable("scenario_versions", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  spec: jsonb("spec").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scenarioRuns = pgTable("scenario_runs", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "cascade" }),
  versionId: text("version_id")
    .notNull()
    .references(() => scenarioVersions.id, { onDelete: "cascade" }),
  seedRoot: text("seed_root").notNull(),
  replications: integer("replications").notNull(),
  durationMs: doublePrecision("duration_ms"),
  result: jsonb("result").notNull(),
  calibrationScore: doublePrecision("calibration_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 10 seam (decision log) — STAND-IN, minimal columns only.
// ---------------------------------------------------------------------------
export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  rationale: text("rationale"),
  scenarioId: text("scenario_id").references(() => scenarios.id, { onDelete: "set null" }),
  scenarioRunId: text("scenario_run_id").references(() => scenarioRuns.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Calibration & backtesting (Section E)
// ---------------------------------------------------------------------------
export const calibrationReports = pgTable("calibration_reports", {
  id: text("id").primaryKey(),
  subsystem: text("subsystem").notNull(), // 'physics' | 'service_time' | 'brooks_law' | ...
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  metrics: jsonb("metrics").notNull(),
  beatsNaive: boolean("beats_naive").notNull(),
  notes: text("notes"),
});

// ---------------------------------------------------------------------------
// War games (Section F)
// ---------------------------------------------------------------------------
export const wargameRuns = pgTable("wargame_runs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  spec: jsonb("spec").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
