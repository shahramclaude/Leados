import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  serial,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * Part 26 — Transformation / change-program schema.
 *
 * Individual-level tables (`people`, `changeEvents`) exist only to make
 * aggregate, k-anonymity-gated metrics computable server-side. No API route
 * in this part returns rows from these tables directly — see
 * `src/lib/privacy/aggregation.ts` and the privacy attempt-matrix tests in
 * `src/lib/change/__tests__/privacy.test.ts`.
 *
 * `capacityHeadroom` on `changeGroups` is a stand-in for Part 06's capacity
 * digital twin, which is not present in this repository snapshot.
 */

export const changeGroups = pgTable("change_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  headcount: integer("headcount").notNull(),
  capacityHeadroom: numeric("capacity_headroom", { precision: 4, scale: 3 }).notNull().default("0.500"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  trainingCompletionPct: numeric("training_completion_pct", { precision: 5, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const changePrograms = pgTable("change_programs", {
  id: text("id").primaryKey(),
  intent: text("intent").notNull(),
  targetBehaviors: jsonb("target_behaviors").notNull(),
  affectedGroupIds: jsonb("affected_group_ids").notNull(),
  resistanceMap: jsonb("resistance_map").notNull(),
  status: text("status").notNull().default("planned"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  loadWeight: numeric("load_weight", { precision: 4, scale: 2 }).notNull().default("1.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const changeInterventions = pgTable("change_interventions", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull(),
  kind: text("kind").notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }).notNull().default("0.00"),
  expectedEffectJson: jsonb("expected_effect_json").notNull(),
  rolloutDesignJson: jsonb("rollout_design_json"),
  designIdentification: text("design_identification").notNull().default("randomized_clean"),
  status: text("status").notNull().default("proposed"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const changeEvents = pgTable("change_events", {
  id: serial("id").primaryKey(),
  programId: text("program_id"),
  groupId: text("group_id").notNull(),
  personId: text("person_id").notNull(),
  proxyEventType: text("proxy_event_type").notNull(),
  periodIndex: integer("period_index"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"),
});

export const interventionResults = pgTable("intervention_results", {
  id: text("id").primaryKey(),
  interventionId: text("intervention_id").notNull(),
  estimateJson: jsonb("estimate_json").notNull(),
  method: text("method").notNull(),
  surprise: numeric("surprise", { precision: 6, scale: 4 }),
  withinExpectedBounds: boolean("within_expected_bounds"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
