// src/db/schema.ts
//
// BOOTSTRAP NOTE: this file was a 4-line placeholder (`export {}`) before
// this change — no tables existed. Part 1 introduces the minimal tables
// needed to run the Living Intelligence Fabric end to end: raw events,
// people, the knowledge-graph node/edge tables, and belief_snapshots (the
// task-mandated table for temporalBeliefTracker.ts).

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Raw event log (source of truth the belief fabric reads from)
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  personId: text("person_id"),
  teamId: text("team_id"),
  projectId: text("project_id"),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// People roster
// ---------------------------------------------------------------------------
export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  level: text("level"),
  startDate: timestamp("start_date", { withTimezone: true }),
  hasSuccessor: boolean("has_successor").default(false),
  calendarLoadPct: real("calendar_load_pct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Knowledge graph: memory nodes + edges
// ---------------------------------------------------------------------------
export const memoryNodes = pgTable("memory_nodes", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const memoryEdges = pgTable("memory_edges", {
  id: serial("id").primaryKey(),
  fromNodeId: integer("from_node_id")
    .notNull()
    .references(() => memoryNodes.id),
  toNodeId: integer("to_node_id")
    .notNull()
    .references(() => memoryNodes.id),
  relation: text("relation").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// belief_snapshots — Part 1 task-mandated table
//
// Migration DDL (inline, as requested — applied via `drizzle-kit push`):
//
//   CREATE TABLE belief_snapshots (
//     id SERIAL PRIMARY KEY,
//     snapshot_at TIMESTAMPTZ NOT NULL,
//     posteriors JSONB NOT NULL,
//     cascade_risk REAL NOT NULL,
//     dominant_risk TEXT NOT NULL,
//     observables JSONB NOT NULL,
//     generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
//   );
// ---------------------------------------------------------------------------
export const beliefSnapshots = pgTable("belief_snapshots", {
  id: serial("id").primaryKey(),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
  posteriors: jsonb("posteriors").$type<Record<string, unknown>>().notNull(),
  cascadeRisk: real("cascade_risk").notNull(),
  dominantRisk: text("dominant_risk").notNull(),
  observables: jsonb("observables").$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});
