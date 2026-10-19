// src/db/schema.ts
//
// No schema existed in this checkout (see provenance note in
// src/lib/types.ts). This defines the minimal People Intelligence data
// model: people, their 1:1 notes, generic org events (pulse surveys,
// reviews, promotions, goals), and the collaboration graph edges that
// src/lib/orgNetwork.ts turns into centrality/anomaly reports.

import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  managerId: integer("manager_id"),
  email: text("email").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("active"), // active | departed | archived
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  performanceScore: integer("performance_score"), // 0-100, nullable
  promotionReadiness: integer("promotion_readiness"), // 0-100, nullable
  growthVelocity: real("growth_velocity"), // 0-1, nullable
  compensationFlag: boolean("compensation_flag").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  managerId: integer("manager_id"),
  date: date("date", { mode: "string" }).notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const leadosEvents = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  type: text("type").notNull(), // pulse | promotion | review | goal | collab
  psychologicalSafetyIndex: real("psychological_safety_index"), // 0-1
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const orgEdges = pgTable("org_edges", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull(),
  targetId: integer("target_id").notNull(),
  weight: real("weight").notNull().default(0), // 0-1 collaboration strength
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});
