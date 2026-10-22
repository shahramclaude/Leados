// ---------------------------------------------------------------------------
// Part 28 — Process Intelligence (mining / conformance / queueing / automation)
//
// NOTE ON PROVENANCE: this snapshot of the repo does not contain the Part 01
// event-store tables, the Part 06 work-system / twin tables, the Part 09
// roster tables, or the Part 10 capability registry tables referenced by the
// standing order. Rather than invent speculative foreign keys into modules
// that are not present, Part 28 ships minimal, explicitly-scoped tables that
// capture only what the process-mining pipeline needs:
//   - process_events       : event-store projection (caseId/correlationId
//                             chain, activity, timestamp, duration, resource)
//   - process_roster       : aggregate-safe resource/team lookup (Part 09 stand-in)
//   - process_definitions  : optional *declared* process (for conformance
//                             against intent, kept separate from mined models)
//   - automation_proposals : draft rows a human can promote into Part 10's
//                             capability registry ("propose automation")
//   - metric_snapshots     : per-period operational metrics feeding Part 13's
//                             control charts
// When Parts 01/06/09/10 land in this repo, process_events should become a
// read-through projection of the real event store instead of its own table.
// ---------------------------------------------------------------------------
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const processEvents = pgTable(
  "process_events",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    caseId: text("case_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    processName: text("process_name").notNull(),
    activity: text("activity").notNull(),
    resourceId: text("resource_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    status: text("status").notNull().default("completed"),
    attributes: jsonb("attributes").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("process_events_event_id_idx").on(table.eventId),
    index("process_events_process_idx").on(table.processName),
    index("process_events_case_idx").on(table.caseId),
    index("process_events_correlation_idx").on(table.correlationId),
    index("process_events_activity_idx").on(table.activity),
    index("process_events_time_idx").on(table.occurredAt),
  ],
);

export const processRoster = pgTable(
  "process_roster",
  {
    id: serial("id").primaryKey(),
    resourceId: text("resource_id").notNull(),
    displayName: text("display_name").notNull(),
    team: text("team").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("process_roster_resource_id_idx").on(table.resourceId)],
);

export const processDefinitions = pgTable(
  "process_definitions",
  {
    id: serial("id").primaryKey(),
    processName: text("process_name").notNull(),
    version: integer("version").notNull().default(1),
    // Ordered array of { activity, mandatory, allowedNext: string[] }
    steps: jsonb("steps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("process_definitions_process_version_idx").on(table.processName, table.version)],
);

export const automationProposals = pgTable("automation_proposals", {
  id: serial("id").primaryKey(),
  processName: text("process_name").notNull(),
  activity: text("activity").notNull(),
  score: numeric("score", { precision: 14, scale: 4 }).notNull(),
  explain: jsonb("explain").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metricSnapshots = pgTable("metric_snapshots", {
  id: serial("id").primaryKey(),
  processName: text("process_name").notNull(),
  metric: text("metric").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  value: numeric("value", { precision: 14, scale: 4 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

