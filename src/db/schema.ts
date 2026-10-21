// LEADOS core schema.
//
// Honesty note (Part 19 / docs/CONSISTENCY-SWEEP.md): this file is the single
// source of truth for persisted shape. Every table here is live in the
// running app. Nothing described in docs/explanation.md as "planned" has a
// table here yet — when it gets one, update this file first, then the docs.
import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A sales/marketing lead tracked by LEADOS.
 *
 * `status` is a free-form text column constrained in application code to the
 * values exported in `LEAD_STATUSES` below (see src/lib/scoring.ts). We use
 * `text` instead of a native Postgres enum so that adding a new status is a
 * one-line code change plus a migration-free `drizzle-kit push`, at the cost
 * of losing database-level enforcement — documented tradeoff, not an
 * oversight.
 */
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    source: text("source").notNull().default("unknown"),
    status: text("status").notNull().default("new"),
    score: integer("score").notNull().default(0),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>(),
    scoreVersion: text("score_version").notNull().default("rule-v1"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("leads_email_unique_idx").on(table.email)],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

/**
 * Append-only audit trail of every score computation. This is the event
 * stream referenced in docs/reference.md's "Event types" section. There is
 * no message bus yet (see docs/explanation.md, "Realtime: planned") — this
 * table is the whole of the current event system, written synchronously in
 * the same request that produces a new score.
 */
export const scoreEvents = pgTable("score_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  breakdown: jsonb("breakdown").$type<Record<string, number>>().notNull(),
  scoreVersion: text("score_version").notNull(),
  reason: text("reason").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScoreEvent = typeof scoreEvents.$inferSelect;
export type NewScoreEvent = typeof scoreEvents.$inferInsert;
