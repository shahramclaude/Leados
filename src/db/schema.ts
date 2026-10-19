// ---------------------------------------------------------------------------
// Leados schema
// ---------------------------------------------------------------------------
// NOTE ON THIS SNAPSHOT: Part 7 ("Execution Intelligence") asks us to read
// src/lib/metricsEngine.ts, predictiveScoring.ts, simulation.ts, physics.ts,
// emergent.ts, riskIntelligence.ts, stakeholders.ts and the existing
// project/task/sprint tables before writing. None of those files/tables
// exist in this repository snapshot (the project only contains the base
// Next.js + Drizzle starter) — there is no prior "org physics" model to
// reuse, so the delivery-confidence formula below implements the literal
// fallback spec from the task description. The `people` and `events`
// tables are added here as the minimal shared primitives those future
// engines (and this one) depend on.
// ---------------------------------------------------------------------------

import {
  pgEnum,
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role"),
  domain: text("domain"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Generic event log used by the various intelligence engines (metrics,
// risk, execution, ...) to reason about recency/velocity of activity.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain"),
  projectId: integer("project_id"),
  personId: integer("person_id").references(() => people.id),
  payload: jsonb("payload"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Execution Intelligence tables
// ---------------------------------------------------------------------------

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "blocked",
  "complete",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "done",
  "overdue",
]);

export const dependencyTypeEnum = pgEnum("dependency_type", [
  "blocks",
  "enables",
  "shares_resource",
]);

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  ownerId: integer("owner_id").references(() => people.id),
  startDate: timestamp("start_date", { withTimezone: true }),
  targetDate: timestamp("target_date", { withTimezone: true }),
  status: projectStatusEnum("status").notNull().default("planning"),
  confidence: integer("confidence").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: milestoneStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const blockers = pgTable("blockers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  severity: integer("severity").notNull(),
  reportedBy: integer("reported_by").references(() => people.id),
  assignedTo: integer("assigned_to").references(() => people.id),
  domain: text("domain"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const crossDependencies = pgTable("cross_dependencies", {
  id: serial("id").primaryKey(),
  fromProject: integer("from_project")
    .notNull()
    .references(() => projects.id),
  toProject: integer("to_project")
    .notNull()
    .references(() => projects.id),
  type: dependencyTypeEnum("type").notNull(),
  strength: real("strength").notNull().default(1),
});
