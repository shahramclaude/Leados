import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// LeadOS intelligence schema
//
// `leados_people` holds the roster. `leados_events` is the single append-only
// event log that every domain (people / finance / sales / ops / strategy)
// writes to. The intelligence engine (src/lib/inference.ts) reads only from
// these two tables — it never mutates them.
//
// `leados_autonomous_runs` persists a snapshot of every background
// intelligence cycle so the next cycle can diff against it.
// `leados_work_queue` is the persistent, finding-driven work queue.
// `leados_notifications` is the durable feed behind the live SSE channel.
// ─────────────────────────────────────────────────────────────────────────

export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  team: text("team").notNull().default(""),
  tenureStartAt: timestamp("tenure_start_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  // One of the EventType values from src/lib/types.ts, kept as free text so
  // the event log can absorb new signal types without a migration.
  type: text("type").notNull(),
  domain: text("domain").notNull(), // people | finance | sales | ops | strategy
  personId: integer("person_id").references(() => leados_people.id),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One row per background intelligence cycle. `snapshot` stores the full set
 * of active findings (and derived counts) at the time of the run so the next
 * run can diff "new" vs "resolved" findings without re-deriving history.
 *
 * Equivalent DDL (for `drizzle-kit generate` / manual migration review):
 *
 * CREATE TABLE "leados_autonomous_runs" (
 *   "id" serial PRIMARY KEY NOT NULL,
 *   "ran_at" timestamp NOT NULL DEFAULT now(),
 *   "findings_count" integer NOT NULL DEFAULT 0,
 *   "actions_taken" integer NOT NULL DEFAULT 0,
 *   "escalations" integer NOT NULL DEFAULT 0,
 *   "duration_ms" integer NOT NULL DEFAULT 0,
 *   "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
 * );
 */
export const leados_autonomous_runs = pgTable("leados_autonomous_runs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
  findingsCount: integer("findings_count").notNull().default(0),
  actionsTaken: integer("actions_taken").notNull().default(0),
  escalations: integer("escalations").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
});

/**
 * Persistent, finding-driven work queue.
 *
 * Equivalent DDL (for `drizzle-kit generate` / manual migration review):
 *
 * CREATE TABLE "leados_work_queue" (
 *   "id" serial PRIMARY KEY NOT NULL,
 *   "title" text NOT NULL,
 *   "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
 *   "status" text NOT NULL DEFAULT 'pending',
 *   "domain" text NOT NULL,
 *   "finding_key" text NOT NULL,
 *   "source" text NOT NULL,
 *   "priority" integer NOT NULL DEFAULT 3,
 *   "due_at" timestamp,
 *   "assigned_to" integer REFERENCES "leados_people"("id"),
 *   "blocked_by" integer[] NOT NULL DEFAULT '{}',
 *   "outcome_notes" text,
 *   "suggested_action" text,
 *   "created_at" timestamp NOT NULL DEFAULT now(),
 *   "resolved_at" timestamp
 * );
 */
export const leados_work_queue = pgTable("leados_work_queue", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"), // pending | in_progress | resolved | dismissed
  domain: text("domain").notNull(),
  // The finding.key that generated this item — used to resolve it when the
  // triggering finding is no longer active.
  findingKey: text("finding_key").notNull(),
  // The rule key that created this item (e.g. "flight_risk", "runway_low").
  source: text("source").notNull(),
  priority: integer("priority").notNull().default(3), // 1 (low) .. 5 (critical)
  dueAt: timestamp("due_at"),
  assignedTo: integer("assigned_to").references(() => leados_people.id),
  blockedBy: integer("blocked_by").array().notNull().default([]),
  outcomeNotes: text("outcome_notes"),
  suggestedAction: text("suggested_action"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

/**
 * Durable notification feed. The SSE route pushes these live; this table
 * lets the client catch up on anything it missed while disconnected.
 *
 * Equivalent DDL (for `drizzle-kit generate` / manual migration review):
 *
 * CREATE TABLE "leados_notifications" (
 *   "id" serial PRIMARY KEY NOT NULL,
 *   "type" text NOT NULL,
 *   "severity" integer NOT NULL DEFAULT 1,
 *   "title" text NOT NULL,
 *   "body" text NOT NULL DEFAULT '',
 *   "read" boolean NOT NULL DEFAULT false,
 *   "created_at" timestamp NOT NULL DEFAULT now(),
 *   "entity_type" text,
 *   "entity_id" integer
 * );
 */
export const leados_notifications = pgTable("leados_notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // finding_new | finding_resolved | work_item | escalation | system
  severity: integer("severity").notNull().default(1),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
});
