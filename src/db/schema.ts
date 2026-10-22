// Strategy-systems schema (Part 07).
//
// NOTE ON LINEAGE: this sandbox's repository did not contain the Part 01
// Objective/KeyResult/Initiative tables, nor any of the Part 02/04/06/08/11/13
// modules referenced by the Part 07 brief. Rather than block delivery, this
// file defines the minimal, compatible versions of those tables needed to
// support the Part 07 strategy engine. They are intentionally named and
// shaped so a later "real" Part 01 migration can be reconciled with a rename
// rather than a rewrite. See AI-SESSION-LOG.md for the full list of
// assumptions made in the absence of Parts 00-06.
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Teams (minimal stand-in for Part 06's digital-twin capacity model)
// ---------------------------------------------------------------------------
export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacityHoursPerWeek: doublePrecision("capacity_hours_per_week").notNull().default(40),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Objectives (tree + DAG via objectiveLinks)
// ---------------------------------------------------------------------------
export const objectiveLevelValues = ["company", "team", "individual"] as const;
export type ObjectiveLevel = (typeof objectiveLevelValues)[number];

export const objectiveStatusValues = ["draft", "active", "at_risk", "archived"] as const;
export type ObjectiveStatus = (typeof objectiveStatusValues)[number];

export const objectives = pgTable("objectives", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  level: text("level").$type<ObjectiveLevel>().notNull().default("team"),
  timeframe: text("timeframe").notNull(), // e.g. "2026-Q1"
  ownerName: text("owner_name").notNull(),
  status: text("status").$type<ObjectiveStatus>().notNull().default("active"),
  stretch: boolean("stretch").notNull().default(false),
  isNorthStarAligned: boolean("is_north_star_aligned").notNull().default(false),
  parentId: text("parent_id").references((): AnyPgColumn => objectives.id),
  priorityRank: integer("priority_rank").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Typed alignment graph edges, independent of the parentId tree so an
// objective can both sit in a reporting tree AND contribute to / block /
// duplicate / conflict with other objectives across that tree.
export const objectiveLinkTypeValues = ["contributes_to", "blocks", "duplicates", "conflicts"] as const;
export type ObjectiveLinkType = (typeof objectiveLinkTypeValues)[number];

export const objectiveLinks = pgTable("objective_links", {
  id: text("id").primaryKey(),
  fromObjectiveId: text("from_objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  toObjectiveId: text("to_objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  linkType: text("link_type").$type<ObjectiveLinkType>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Key Results
// ---------------------------------------------------------------------------
export const krDirectionValues = ["up", "down"] as const;
export type KeyResultDirection = (typeof krDirectionValues)[number];

export const krProgressModeValues = ["linear", "milestone", "threshold"] as const;
export type KeyResultProgressMode = (typeof krProgressModeValues)[number];

export const confidenceClassValues = ["verified", "high", "medium", "low"] as const;
export type ConfidenceClass = (typeof confidenceClassValues)[number];

export const keyResults = pgTable("key_results", {
  id: text("id").primaryKey(),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  baseline: doublePrecision("baseline").notNull().default(0),
  target: doublePrecision("target").notNull(),
  current: doublePrecision("current").notNull().default(0), // hand-asserted value; ignored when evidence exists
  unit: text("unit").notNull().default(""),
  direction: text("direction").$type<KeyResultDirection>().notNull().default("up"),
  progressMode: text("progress_mode").$type<KeyResultProgressMode>().notNull().default("linear"),
  weight: doublePrecision("weight").notNull().default(1),
  stretch: boolean("stretch").notNull().default(false),
  confidenceClass: text("confidence_class").$type<ConfidenceClass>(),
  milestonesTotal: integer("milestones_total"),
  milestonesComplete: integer("milestones_complete"),
  thresholdValue: doublePrecision("threshold_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Evidence refs are the only legitimate source of *derived* progress.
// sourceType "metric_series" stands in for Part 13; "task_event" / "milestone"
// stand in for execution-tracking events; "manual" records a human
// observation that is still an evidence record (distinct from a bare
// assertion because it carries an observedAt + note trail).
export const evidenceSourceTypeValues = ["metric_series", "task_event", "milestone", "manual"] as const;
export type EvidenceSourceType = (typeof evidenceSourceTypeValues)[number];

export const evidenceRefs = pgTable("evidence_refs", {
  id: text("id").primaryKey(),
  keyResultId: text("key_result_id")
    .notNull()
    .references(() => keyResults.id, { onDelete: "cascade" }),
  sourceType: text("source_type").$type<EvidenceSourceType>().notNull(),
  sourceId: text("source_id"),
  value: doublePrecision("value").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Initiatives + milestones (execution layer, PERT inputs)
// ---------------------------------------------------------------------------
export const initiativeStatusValues = [
  "planned",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type InitiativeStatus = (typeof initiativeStatusValues)[number];

export const initiatives = pgTable("initiatives", {
  id: text("id").primaryKey(),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").$type<InitiativeStatus>().notNull().default("planned"),
  blockerNote: text("blocker_note"),
  budgetAllocated: doublePrecision("budget_allocated").notNull().default(0),
  budgetSpent: doublePrecision("budget_spent").notNull().default(0),
  // WSJF inputs, each a 1-10 anchored scale (see initiativesEngine.ts WSJF_ANCHORS)
  timeCriticality: integer("time_criticality").notNull().default(5),
  riskReduction: integer("risk_reduction").notNull().default(5),
  userValue: integer("user_value").notNull().default(5),
  jobSize: integer("job_size").notNull().default(5),
  requiredSkill: text("required_skill"),
  requiredHoursPerWeek: doublePrecision("required_hours_per_week").notNull().default(10),
  startDate: timestamp("start_date", { withTimezone: true }),
  targetEndDate: timestamp("target_end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestoneStatusValues = ["planned", "in_progress", "done", "blocked"] as const;
export type MilestoneStatus = (typeof milestoneStatusValues)[number];

export const initiativeMilestones = pgTable("initiative_milestones", {
  id: text("id").primaryKey(),
  initiativeId: text("initiative_id")
    .notNull()
    .references(() => initiatives.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sequence: integer("sequence").notNull().default(0),
  dependsOnMilestoneId: text("depends_on_milestone_id").references(
    (): AnyPgColumn => initiativeMilestones.id,
  ),
  // PERT three-point estimate, in days
  optimisticDays: doublePrecision("optimistic_days").notNull(),
  mostLikelyDays: doublePrecision("most_likely_days").notNull(),
  pessimisticDays: doublePrecision("pessimistic_days").notNull(),
  status: text("status").$type<MilestoneStatus>().notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// North Star metrics (northStar.ts)
// ---------------------------------------------------------------------------
export const northStarMetrics = pgTable("north_star_metrics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default(""),
  currentValue: doublePrecision("current_value").notNull().default(0),
  targetValue: doublePrecision("target_value").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Strategy briefs (weekly, auto-assembled, cites only real deltas)
// ---------------------------------------------------------------------------
export const strategyBriefs = pgTable("strategy_briefs", {
  id: text("id").primaryKey(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  narrativeText: text("narrative_text").notNull(),
  citationCount: integer("citation_count").notNull().default(0),
});
