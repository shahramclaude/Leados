// LEADOS — Part 14: Realtime Systems & Attention Design
//
// NOTE ON DEPENDENCIES: This sandbox repository did not contain any prior
// Part (01 / 03 / 10) artifacts — no outbox table, no org/role model, no
// approvals table existed on disk. To deliver a working Part 14 this file
// defines minimal, compatible stand-ins for those tables (clearly marked
// below) alongside the Part 14 tables themselves. When Parts 01/03/10 land
// for real, swap the stand-in tables for theirs and keep the Part 14 tables
// (outbox, notifications, attention/*) as-is — the contracts were written to
// match the spec in this prompt so they should not need to change shape.

import {
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
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// STAND-INS for Part 03 (org/role model) and Part 10 (approvals)
// ---------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // role drives topic scoping for the realtime hub ("role:<role>")
  role: text("role").notNull().default("analyst"),
  timezone: text("timezone").notNull().default("UTC"),
  // Tracks the last time the user loaded the "Now" surface, used to compute
  // the what-changed-since-last-visit delta strip.
  lastSeenNowAt: timestamp("last_seen_now_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  severity: integer("severity").notNull().default(3), // 1..5
  assigneeRole: text("assignee_role").notNull().default("manager"),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
  entityRef: text("entity_ref"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generic "finding" stand-in for Part 03's lead-intelligence output. Used to
// populate the Now surface's "what changed since last visit" delta strip.
export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  severity: integer("severity").notNull().default(3),
  entityRef: text("entity_ref"),
  visibleToRole: text("visible_to_role").notNull().default("analyst"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// PART 14: Outbox-backed event stream (zero-loss resume)
// ---------------------------------------------------------------------------

export const eventOutbox = pgTable(
  "event_outbox",
  {
    // bigserial => strictly monotonically increasing frame id, used as the
    // SSE `id:` field and the `Last-Event-ID` resume cursor.
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    orgId: uuid("org_id").notNull(),
    // topic examples: "org:<id>:role:manager", "org:<id>:user:<id>",
    // "org:<id>:broadcast"
    topic: text("topic").notNull(),
    type: text("type").notNull(), // finding | approval | work_queue | anomaly | run_progress | notification_state | lag_notice
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("event_outbox_topic_id_idx").on(table.topic, table.id),
    index("event_outbox_org_id_idx").on(table.orgId, table.id),
  ],
);

// ---------------------------------------------------------------------------
// PART 14: Notifications
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: text("class").notNull(), // alert | action | info | digest
    severity: integer("severity").notNull().default(3),
    entityRef: text("entity_ref"),
    dedupeKey: text("dedupe_key").notNull(),
    parentId: uuid("parent_id"),
    state: text("state").notNull().default("unread"), // unread | read | archived | reopened
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
    deliveredImmediately: boolean("delivered_immediately").notNull().default(false),
    decisionReason: text("decision_reason").notNull().default(""),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_user_state_idx").on(table.userId, table.state, table.createdAt),
    index("notifications_user_dedupe_idx").on(table.userId, table.dedupeKey),
    index("notifications_parent_idx").on(table.parentId),
  ],
);

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: text("class").notNull(), // alert | action | info | digest
    muted: boolean("muted").notNull().default(false),
    muteReason: text("mute_reason").notNull().default(""),
    optedInImmediate: boolean("opted_in_immediate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("notification_prefs_user_class_idx").on(table.userId, table.class)],
);

export const interruptBudgetLedger = pgTable(
  "interrupt_budget_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dayKey: text("day_key").notNull(), // YYYY-MM-DD in user's timezone
    spent: integer("spent").notNull().default(0),
    budget: integer("budget").notNull().default(8),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("interrupt_budget_user_day_idx").on(table.userId, table.dayKey)],
);

export const engagementStats = pgTable(
  "engagement_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: text("class").notNull(),
    hourOfDay: integer("hour_of_day").notNull(), // 0..23, in user's local timezone
    // Exponentially decayed engagement score (acted-on rate), 0..1
    score: numeric("score", { precision: 6, scale: 4 }).notNull().default("0.5"),
    samples: integer("samples").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("engagement_stats_user_class_hour_idx").on(table.userId, table.class, table.hourOfDay)],
);

export const quietHours = pgTable("quiet_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("UTC"),
  startMinute: integer("start_minute").notNull().default(22 * 60), // 22:00
  endMinute: integer("end_minute").notNull().default(7 * 60), // 07:00
  enabled: boolean("enabled").notNull().default(true),
});

export const focusMode = pgTable("focus_mode", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  allowedClasses: jsonb("allowed_classes").$type<string[]>().notNull().default(["action"]),
  reason: text("reason").notNull().default(""),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const digestQueue = pgTable(
  "digest_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: text("class").notNull(),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    explanation: text("explanation").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("digest_queue_user_sched_idx").on(table.userId, table.scheduledFor)],
);

// Interrupt events log — raw record of every attempted interruption, used
// for the weekly Attention Report (received / acted / dismissed, cost) and
// as the audit trail for the adaptive engagement model.
export const interruptEvents = pgTable(
  "interrupt_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
    class: text("class").notNull(),
    hourOfDay: integer("hour_of_day").notNull(),
    outcome: text("outcome").notNull().default("delivered"), // delivered | queued_digest | suppressed_quiet | suppressed_focus | suppressed_mute
    actedOn: boolean("acted_on").notNull().default(false),
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("interrupt_events_user_idx").on(table.userId, table.createdAt)],
);
