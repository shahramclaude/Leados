// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
import {
  pgTable,
  uuid,
  text,
  varchar,
  jsonb,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Scenario Engine & War Room — LEADOS Part 8
// ---------------------------------------------------------------------------

export const leadosScenarios = pgTable("leados_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  type: varchar("type", { length: 32 }).notNull().default("base"), // base|stress|opportunity|crisis|competitive
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft|active|archived
  assumptions: jsonb("assumptions").notNull().default([]),
  variableOverrides: jsonb("variable_overrides").notNull().default({}),
  createdBy: text("created_by").notNull().default("anonymous"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadosScenario = typeof leadosScenarios.$inferSelect;
export type NewLeadosScenario = typeof leadosScenarios.$inferInsert;

export const leadosScenarioRuns = pgTable("leados_scenario_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => leadosScenarios.id, { onDelete: "cascade" }),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  result: jsonb("result").notNull().default({}),
  mcIterations: integer("mc_iterations").notNull().default(5000),
  durationMs: integer("duration_ms").notNull().default(0),
});

export type LeadosScenarioRun = typeof leadosScenarioRuns.$inferSelect;
export type NewLeadosScenarioRun = typeof leadosScenarioRuns.$inferInsert;

export const leadosWargames = pgTable("leados_wargames", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  context: text("context").notNull().default(""),
  ourMoves: jsonb("our_moves").notNull().default([]),
  competitorMoves: jsonb("competitor_moves").notNull().default([]),
  outcomes: jsonb("outcomes").notNull().default({}),
  lessons: text("lessons").notNull().default(""),
  ranAt: timestamp("ran_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadosWargame = typeof leadosWargames.$inferSelect;
export type NewLeadosWargame = typeof leadosWargames.$inferInsert;
