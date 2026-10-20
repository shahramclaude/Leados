// LEADOS data model.
//
// This is intentionally a small, representative slice (events → findings →
// decisions → automation runs → board packs) rather than the full historical
// feature surface described in later-part specs. See AI-SESSION-LOG.md for
// the provenance note explaining why.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 255 }).notNull(),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary").notNull().default(""),
  impact: integer("impact").notNull(),
  confidence: integer("confidence").notNull(),
  effort: integer("effort").notNull(),
  score: numeric("score", { precision: 10, scale: 4 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  context: text("context").notNull().default(""),
  priorAlpha: numeric("prior_alpha", { precision: 10, scale: 4 }).notNull().default("1"),
  priorBeta: numeric("prior_beta", { precision: 10, scale: 4 }).notNull().default("1"),
  posteriorAlpha: numeric("posterior_alpha", { precision: 10, scale: 4 }).notNull().default("1"),
  posteriorBeta: numeric("posterior_beta", { precision: 10, scale: 4 }).notNull().default("1"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(),
  seed: integer("seed").notNull(),
  trials: integer("trials").notNull(),
  input: jsonb("input").notNull(),
  result: jsonb("result").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  periodLabel: varchar("period_label", { length: 100 }).notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
