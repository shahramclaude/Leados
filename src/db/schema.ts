// LEADOS — Part 8: Realtime, Notifications & Attention Management
// Full Drizzle schema for the realtime/attention slice. Earlier parts (auth,
// projects, agents, etc.) are not present in this sandbox, so minimal stub
// domain tables (findings/approvals/tasks/metric anomalies/agent runs) are
// included here just deep enough to drive real events through the pipeline.

import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Identity (minimal stub — Part 8 assumes auth exists upstream; we only need
// enough of a user record to scope realtime channels & preferences)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tracks per-user cockpit visit so the Now surface can compute a delta
// ("what changed since last visit") instead of a full history wall.
export const userState = pgTable("user_state", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain stub tables — real signal producers that emit events
// ---------------------------------------------------------------------------

export const findings = pgTable("findings", {
  id: id(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull(), // 1 (low) .. 5 (critical)
  summary: text("summary").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: id(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const tasks = pgTable("tasks", {
  id: id(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull().default(1),
  status: text("status").notNull().default("open"), // open | in_progress | done
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metricAnomalies = pgTable("metric_anomalies", {
  id: id(),
  metric: text("metric").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull(),
  delta: numeric("delta").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: id(),
  agentName: text("agent_name").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("running"), // running | completed | failed
  progress: integer("progress").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Unified event stream (SSE backing store — enables Last-Event-ID resume)
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // finding.created | approval.pending | task.updated | metric.anomaly | agent_run.progress | notification.created | presence.update | comment.created
    domain: text("domain").notNull(),
    severity: integer("severity").notNull().default(1),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    dedupKey: text("dedup_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_user_id_idx").on(table.userId),
    index("events_user_created_idx").on(table.userId, table.id),
  ],
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: bigint("event_id", { mode: "number" }).references(() => events.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    domain: text("domain").notNull(),
    severity: integer("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    dedupKey: text("dedup_key").notNull(),
    status: text("status").notNull().default("unread"), // unread | read | archived
    delivery: text("delivery").notNull().default("in_app"), // in_app | interrupt | digest | suppressed
    deliveredChannels: jsonb("delivered_channels").$type<string[]>().notNull().default(["in_app"]),
    reason: text("reason").notNull().default(""), // explainability string
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    digestBatchId: text("digest_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastOccurrenceAt: timestamp("last_occurrence_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_status_idx").on(table.userId, table.status),
    // One root cause = one notification: a *partial* unique index enforces
    // dedup at the database level (not just in application logic) while a
    // root cause is still "live" (unread/read). Archiving frees the key so a
    // genuinely new occurrence after archival starts a fresh notification.
    // `createNotification` upserts against this exact index, which is also
    // what makes concurrent "alarm storm" inserts collapse atomically
    // instead of racing into duplicate rows.
    uniqueIndex("notifications_dedup_live_idx")
      .on(table.userId, table.dedupKey)
      .where(sql`${table.status} <> 'archived'`),
  ],
);

export const notificationFeedback = pgTable("notification_feedback", {
  id: id(),
  notificationId: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // opened | dismissed | acted | snoozed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    channel: text("channel").notNull().default("in_app"), // in_app | email | webhook
    enabled: boolean("enabled").notNull().default(true),
    allowInterrupt: boolean("allow_interrupt").notNull().default(false), // opt-in to break focus for this domain
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("notification_prefs_unique").on(table.userId, table.domain, table.channel)],
);

export const quietHours = pgTable("quiet_hours", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  startMinute: integer("start_minute").notNull().default(1320), // 22:00
  endMinute: integer("end_minute").notNull().default(420), // 07:00 (wraps midnight)
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Attention budget & decision log (explainability trail)
// ---------------------------------------------------------------------------

export const attentionBudget = pgTable(
  "attention_budget",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in user's timezone
    budget: integer("budget").notNull().default(6),
    used: integer("used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("attention_budget_user_date_idx").on(table.userId, table.date)],
);

export const attentionDecisions = pgTable("attention_decisions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  notificationId: text("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(), // interrupt | digest | suppressed
  severity: integer("severity").notNull(),
  cognitiveLoad: integer("cognitive_load").notNull(),
  fatigue: integer("fatigue").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Presence & collaboration (metadata only — no message-content analytics)
// ---------------------------------------------------------------------------

export const presence = pgTable(
  "presence",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("viewing"), // viewing | editing
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("presence_entity_user_idx").on(table.entityType, table.entityId, table.userId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    kind: text("kind").notNull().default("comment"), // comment | handoff
    body: text("body").notNull(),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("comments_entity_idx").on(table.entityType, table.entityId)],
);

export type User = typeof users.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type NewApproval = typeof approvals.$inferInsert;
export type NewTask = typeof tasks.$inferInsert;
export type NewMetricAnomaly = typeof metricAnomalies.$inferInsert;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
