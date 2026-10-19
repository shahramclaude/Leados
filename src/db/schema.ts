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
// People Intelligence Engine — data model
//
// `people`     one row per roster member (manager hierarchy via managerId).
// `events`     append-only event log. Every signal the intelligence engines
//              consume (pulses, 1:1s logged, feedback, conflicts, action
//              items, promotions, skills, after-hours activity...) is a row
//              here. This is the single source of truth that
//              src/lib/flightRisk.ts, src/lib/performance.ts and
//              src/lib/peopleIntelligence.ts all read from.
// `oneOnOnes`  the rich content of a 1:1 (notes, action items) — kept apart
//              from `events` because quality scoring needs the actual notes
//              payload, not just "a 1:1 happened" (see QualityScorer in
//              src/lib/peopleIntelligence.ts).
// `relationships` explicit org-graph edges (reports_to / collaborates /
//              mentors / conflicts) consumed by src/lib/orgNetwork.ts and
//              src/lib/orgODE.ts's fastOrgDynamics.
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull().default("General"),
  managerId: integer("manager_id"),
  level: text("level").notNull().default("IC"),
  tenureStart: timestamp("tenure_start", { withTimezone: true }),
  lastPromotedAt: timestamp("last_promoted_at", { withTimezone: true }),
  compensationBand: text("compensation_band").notNull().default("unspecified"),
  skills: jsonb("skills").notNull().default([]).$type<string[]>(),
  okrScore: real("okr_score"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain").notNull().default("people"),
  personId: integer("person_id"),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  severity: integer("severity").notNull().default(1),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("open"),
  data: jsonb("data").notNull().default({}).$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
  actionItems: jsonb("action_items")
    .notNull()
    .default([])
    .$type<{ id: string; title: string; resolved: boolean }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id").notNull(),
  toId: integer("to_id").notNull(),
  type: text("type").notNull().default("collaborates"),
  strength: real("strength").notNull().default(0.5),
});
