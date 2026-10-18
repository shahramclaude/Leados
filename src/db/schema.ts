import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  real,
  boolean,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// LeadOS — People Intelligence schema (Part 3)
//
// `leados_people` is the roster. `leados_events` is the append-only event
// log every domain writes to (1:1s, pulses, feedback, conflicts, meetings).
// `leados_person_snapshots` captures a weekly point-in-time read of each
// person's health/risk/performance so trends can be computed over time.
// `leados_relationships` models the org as a live network — reporting
// lines, collaboration, mentoring and conflict edges, each with a strength.
// ─────────────────────────────────────────────────────────────────────────

export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  team: text("team").notNull().default(""),

  // Self-referential reporting line.
  managerId: integer("manager_id").references((): AnyPgColumn => leados_people.id),

  // Career / talent metadata.
  level: text("level").notNull().default(""), // e.g. IC2, IC3, M1, M2, Director
  tenureStart: date("tenure_start").notNull().defaultNow(),
  lastPromotedAt: date("last_promoted_at"),
  compensationBand: text("compensation_band").notNull().default(""),
  skills: text("skills").array().notNull().default([]),
  okrScore: real("okr_score"), // 0-100, latest OKR attainment
  archived: boolean("archived").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  // Free text so the event log can absorb new signal types without a
  // migration, e.g. pulse.mood.logged | oneonone.logged | feedback.logged |
  // conflict.logged | growth_plan.opened | promotion.logged | meeting.attended
  type: text("type").notNull(),
  domain: text("domain").notNull().default("people"),
  personId: integer("person_id").references(() => leados_people.id),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_person_snapshots = pgTable("leados_person_snapshots", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => leados_people.id),
  snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
  healthScore: real("health_score").notNull().default(0),
  flightRisk: real("flight_risk").notNull().default(0),
  performanceScore: real("performance_score").notNull().default(0),
  burnoutIndex: real("burnout_index").notNull().default(0),
  morale: real("morale").notNull().default(0),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
});

export const leados_relationships = pgTable("leados_relationships", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id")
    .notNull()
    .references(() => leados_people.id),
  toId: integer("to_id")
    .notNull()
    .references(() => leados_people.id),
  // reports_to | collaborates | mentors | conflicts
  type: text("type").notNull().default("collaborates"),
  strength: real("strength").notNull().default(0.5), // 0..1
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
