// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
//
// NOTE ON PROVENANCE: This sandbox only contains the bare Next.js/Postgres
// starter template. Parts 1-4 of the broader "Leados" build (belief fabric,
// scenario engine, decisions, metric pipeline, etc.) were not present in
// this repository, so the tables below are a minimal, self-contained
// reconstruction of just the persistence surface Part 5 (Financial Nervous
// System) needs: a generic metric catalogue/value store, a decision log
// (used for fundraising-readiness "decision velocity" signals), and a
// generic event log (referenced by computeUnitEconomics for future
// extensibility). Nothing here is copied from prior parts because they do
// not exist in this environment.

import {
  pgTable,
  serial,
  text,
  timestamp,
  doublePrecision,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

// Catalogue of every metric the system knows how to collect/display.
export const metricDefs = pgTable("metric_defs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default(""),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Time series of recorded metric values, keyed by metric_defs.key.
export const metricValues = pgTable("metric_values", {
  id: serial("id").primaryKey(),
  metricKey: text("metric_key").notNull(),
  value: doublePrecision("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  source: text("source").notNull().default("manual"),
});

// Lightweight decision log used to derive "decision velocity" signals for
// fundraising readiness (e.g. board decisions resolved in < 7 days).
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  level: text("level").notNull().default("team"), // 'board' | 'exec' | 'team'
  cycleTimeDays: integer("cycle_time_days").notNull().default(0),
  decidedAt: timestamp("decided_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Generic append-only event log. Reserved for richer unit-economics
// derivations (e.g. cohort expansion events) in later parts.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
