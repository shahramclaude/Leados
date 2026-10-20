// LEADOS data model — Part 12 (Performance & Scale).
//
// Small, representative slice (events → findings → decisions → automation
// runs → board packs → notifications) sized so the whole "10x data day"
// story (seed, index, EXPLAIN, measure) is reproducible end-to-end inside a
// review sandbox in minutes rather than hours. See AI-SESSION-LOG.md for the
// provenance note explaining why this session rebuilt the schema from a
// clean slate instead of patching the uploaded tree in place.
//
// Indexing rationale (see docs/PERFORMANCE.md "Indexes" for EXPLAIN
// before/after numbers captured against a 100k-row seeded `events` table):
//  - `events_created_at_idx`      — every unbounded "recent events" / cursor
//    pagination query orders by `created_at desc, id desc`.
//  - `events_type_created_at_idx` — the dashboard and `/events?type=` filter
//    always filter by `type` and then order by recency; a composite index
//    lets Postgres satisfy both the filter and the sort with one index scan
//    instead of a sequential scan + sort.
//  - `findings_status_score_idx`  — the findings board always filters by
//    `status = 'open'` and orders by `score desc`.
//  - `decisions_status_idx`       — the decisions list filters by status.
//  - `notifications_read_created_at_idx` — the notification bell queries
//    "unread, most recent first" on every poll.
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 255 }).notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_created_at_idx").on(table.createdAt, table.id),
    index("events_type_created_at_idx").on(table.type, table.createdAt),
  ],
);

export const findings = pgTable(
  "findings",
  {
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
  },
  (table) => [index("findings_status_score_idx").on(table.status, table.score)],
);

export const decisions = pgTable(
  "decisions",
  {
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
  },
  (table) => [index("decisions_status_idx").on(table.status)],
);

export const automationRuns = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(),
  seed: integer("seed").notNull(),
  trials: integer("trials").notNull(),
  input: jsonb("input").notNull(),
  result: jsonb("result").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("completed"),
  durationMs: numeric("duration_ms", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  periodLabel: varchar("period_label", { length: 100 }).notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull().default(""),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_read_created_at_idx").on(table.read, table.createdAt)],
);
