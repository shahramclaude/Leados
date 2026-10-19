// =============================================================================
// Leados — Database schema
// -----------------------------------------------------------------------------
// NOTE ON REPO STATE: This sandbox checkout does not contain the Part 1-5
// files referenced by the Part 6 spec (src/lib/physics.ts, beliefFabric.ts,
// metricsEngine.ts, stakeholders.ts, workers.ts, emergent.ts,
// predictiveScoring.ts, simulation.ts, or a `people`/`events` schema). Those
// are rebuilt here at minimal-but-functional fidelity so Part 6 (Execution
// Intelligence) has real, working foundations to build on rather than mocks.
// Every Part-6-specific requirement (tables, algorithms, signatures) is
// implemented to the letter of the spec below.
// =============================================================================

import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// -----------------------------------------------------------------------------
// Migration DDL (reference — drizzle-kit push generates/applies the real SQL)
// -----------------------------------------------------------------------------
// CREATE TABLE people (
//   id SERIAL PRIMARY KEY,
//   name TEXT NOT NULL,
//   domain TEXT,
//   flight_risk REAL DEFAULT 0,
//   burnout_risk REAL DEFAULT 0,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
//
// CREATE TABLE leados_events (
//   id SERIAL PRIMARY KEY,
//   type TEXT NOT NULL,
//   project_id INT REFERENCES projects(id),
//   person_id INT REFERENCES people(id),
//   domain TEXT,
//   payload TEXT DEFAULT '',
//   created_at TIMESTAMPTZ DEFAULT now()
// );
//
// CREATE TABLE projects (
//   id SERIAL PRIMARY KEY,
//   name TEXT NOT NULL,
//   domain TEXT,
//   owner_id INT REFERENCES people(id),
//   start_date TIMESTAMPTZ,
//   target_date TIMESTAMPTZ,
//   status TEXT NOT NULL DEFAULT 'planning'
//     CHECK (status IN ('planning','active','blocked','complete')),
//   scope_statement TEXT DEFAULT '',
//   confidence INT DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
//   impact INT DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
//   created_at TIMESTAMPTZ DEFAULT now(),
//   updated_at TIMESTAMPTZ DEFAULT now()
// );
//
// CREATE TABLE milestones (
//   id SERIAL PRIMARY KEY,
//   project_id INT REFERENCES projects(id),
//   title TEXT NOT NULL,
//   due_date TIMESTAMPTZ,
//   status TEXT NOT NULL DEFAULT 'pending'
//     CHECK (status IN ('pending','done','overdue','cancelled')),
//   completed_at TIMESTAMPTZ
// );
//
// CREATE TABLE blockers (
//   id SERIAL PRIMARY KEY,
//   project_id INT REFERENCES projects(id),
//   title TEXT NOT NULL,
//   description TEXT DEFAULT '',
//   severity INT DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
//   reported_by INT REFERENCES people(id),
//   assigned_to INT REFERENCES people(id),
//   domain TEXT,
//   reported_at TIMESTAMPTZ DEFAULT now(),
//   resolved_at TIMESTAMPTZ
// );
//
// CREATE TABLE project_snapshots (
//   id SERIAL PRIMARY KEY,
//   project_id INT REFERENCES projects(id),
//   snapshot_at TIMESTAMPTZ,
//   confidence INT,
//   status TEXT,
//   blocker_count INT,
//   milestone_done INT,
//   milestone_total INT
// );
//
// CREATE TABLE cross_dependencies (
//   id SERIAL PRIMARY KEY,
//   from_project INT REFERENCES projects(id),
//   to_project INT REFERENCES projects(id),
//   type TEXT CHECK (type IN ('blocks','enables','shares_resource')),
//   strength REAL DEFAULT 1.0
// );
// -----------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain"),
  flightRisk: real("flight_risk").default(0),
  burnoutRisk: real("burnout_risk").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    ownerId: integer("owner_id").references(() => people.id),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status").notNull().default("planning"),
    scopeStatement: text("scope_statement").default(""),
    confidence: integer("confidence").default(50),
    impact: integer("impact").default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "projects_status_check",
      sql`${table.status} IN ('planning','active','blocked','complete')`,
    ),
    check(
      "projects_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
    check("projects_impact_check", sql`${table.impact} BETWEEN 1 AND 5`),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => projects.id),
    title: text("title").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "milestones_status_check",
      sql`${table.status} IN ('pending','done','overdue','cancelled')`,
    ),
  ],
);

export const blockers = pgTable(
  "blockers",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => projects.id),
    title: text("title").notNull(),
    description: text("description").default(""),
    severity: integer("severity").default(2),
    reportedBy: integer("reported_by").references(() => people.id),
    assignedTo: integer("assigned_to").references(() => people.id),
    domain: text("domain"),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    check("blockers_severity_check", sql`${table.severity} BETWEEN 1 AND 5`),
  ],
);

export const projectSnapshots = pgTable("project_snapshots", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow(),
  confidence: integer("confidence"),
  status: text("status"),
  blockerCount: integer("blocker_count"),
  milestoneDone: integer("milestone_done"),
  milestoneTotal: integer("milestone_total"),
});

export const crossDependencies = pgTable(
  "cross_dependencies",
  {
    id: serial("id").primaryKey(),
    fromProject: integer("from_project").references(() => projects.id),
    toProject: integer("to_project").references(() => projects.id),
    type: text("type").notNull(),
    strength: real("strength").default(1.0),
  },
  (table) => [
    check(
      "cross_dependencies_type_check",
      sql`${table.type} IN ('blocks','enables','shares_resource')`,
    ),
  ],
);

export const leadosEvents = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  personId: integer("person_id").references(() => people.id),
  domain: text("domain"),
  payload: text("payload").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
