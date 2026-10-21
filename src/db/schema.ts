// LEADOS — Part 12: Realtime systems, notifications, and the attention engine.
//
// This file also carries the minimal seams required by this part from
// earlier parts of the program (documented inline):
//   - Part 01 "outbox" table            -> eventOutbox
//   - Part 04 interrupt policy decl.     -> interruptPolicy / notificationPrefs
//   - Part 07 capability registry seam   -> channelCapabilities
//   - Part 09 role-based scoping seam    -> roleDomainVisibility
//
// These seams are intentionally small: this sandbox does not contain the
// real Part 01/04/07/09 deliverables, so the minimum needed to make Part 12
// correct, testable, and honest about its dependencies is reproduced here.

import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Identity & role scoping (Part 09 seam)
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "admin",
  "exec",
  "finance",
  "ops",
  "viewer",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default("viewer"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Which roles may see which event/notification domains. Reused verbatim as
// the "Part 09 scoping" policy: a user only receives what their role may see.
export const roleDomainVisibility = pgTable(
  "role_domain_visibility",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    role: roleEnum("role").notNull(),
    domain: text("domain").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("role_domain_visibility_uniq").on(t.role, t.domain),
  }),
);

// ---------------------------------------------------------------------------
// Part 01 seam: durable outbox used as the realtime replay buffer
// ---------------------------------------------------------------------------

export const eventOutbox = pgTable(
  "event_outbox",
  {
    // bigserial => strictly monotonically increasing, safe as Last-Event-ID
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(), // finding | approval | work_queue | metric_anomaly | agent_run | notification
    domain: text("domain").notNull(), // finance | ops | security | hr | general ...
    entityRef: text("entity_ref"),
    payload: jsonb("payload").notNull(),
    visibleRoles: jsonb("visible_roles").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("event_outbox_created_at_idx").on(t.createdAt),
    domainIdx: index("event_outbox_domain_idx").on(t.domain),
  }),
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationClassEnum = pgEnum("notification_class", [
  "alert",
  "action",
  "info",
  "digest",
]);

export const notificationStateEnum = pgEnum("notification_state", [
  "unread",
  "read",
  "archived",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: notificationClassEnum("class").notNull(),
    severity: integer("severity").notNull().default(1), // 1-5
    domain: text("domain").notNull(),
    entityRef: text("entity_ref"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    dedupeKey: text("dedupe_key").notNull(),
    parentId: uuid("parent_id"),
    actor: text("actor").notNull().default("system"),
    state: notificationStateEnum("state").notNull().default("unread"),
    explain: text("explain"), // human-readable scheduling/adaptive-batching rationale
    channelPrefsSnapshot: jsonb("channel_prefs_snapshot").$type<Record<string, boolean>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  },
  (t) => ({
    userStateIdx: index("notifications_user_state_idx").on(t.userId, t.state, t.createdAt),
    dedupeIdx: index("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
  }),
);

// ---------------------------------------------------------------------------
// Part 04 seam: interrupt policy + per-user preferences
// ---------------------------------------------------------------------------

export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  // per-class channel + opt-in-to-interrupt preferences
  perClass: jsonb("per_class")
    .$type<
      Record<
        string,
        { inApp: boolean; email: boolean; webhook: boolean; optInInterrupt: boolean }
      >
    >()
    .notNull(),
  quietHoursStart: integer("quiet_hours_start").notNull().default(22), // local hour 0-23
  quietHoursEnd: integer("quiet_hours_end").notNull().default(7),
  dailyInterruptBudget: integer("daily_interrupt_budget").notNull().default(6),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every interrupt decision (fired or queued) — the enforcement ledger for the
// daily interrupt budget, and the training data for adaptive batching.
export const interruptLog = pgTable(
  "interrupt_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    class: notificationClassEnum("class").notNull(),
    domain: text("domain").notNull(),
    decision: text("decision").notNull(), // "interrupted" | "queued_to_digest" | "suppressed_quiet_hours"
    reason: text("reason").notNull(),
    countedAgainstBudget: boolean("counted_against_budget").notNull().default(false),
    localHour: integer("local_hour").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayIdx: index("interrupt_log_user_day_idx").on(t.userId, t.occurredAt),
  }),
);

// Decayed engagement statistics per (user, class, hour-of-day) — the memory
// behind adaptive batching. See src/lib/attentionOpt.ts for the method.
export const attentionStats = pgTable(
  "attention_stats",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    class: notificationClassEnum("class").notNull(),
    hourOfDay: integer("hour_of_day").notNull(), // 0-23, user-local
    sent: doublePrecision("sent").notNull().default(0),
    opened: doublePrecision("opened").notNull().default(0),
    actedOn: doublePrecision("acted_on").notNull().default(0),
    dismissed: doublePrecision("dismissed").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("attention_stats_pk").on(t.userId, t.class, t.hourOfDay),
  }),
);

export const digests = pgTable(
  "digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    notificationIds: jsonb("notification_ids").$type<string[]>().notNull().default([]),
    explain: text("explain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userScheduledIdx: index("digests_user_scheduled_idx").on(t.userId, t.scheduledFor),
  }),
);

export const weeklyAttentionReports = pgTable("weekly_attention_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
  interruptionsReceived: integer("interruptions_received").notNull().default(0),
  actedOn: integer("acted_on").notNull().default(0),
  dismissed: integer("dismissed").notNull().default(0),
  costEstimateMinutes: numeric("cost_estimate_minutes", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 07 seam: capability registry (channel availability) + approvals
// ---------------------------------------------------------------------------

export const channelCapabilities = pgTable(
  "channel_capabilities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channel: text("channel").notNull(), // "in_app" | "email" | "webhook"
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    uniq: uniqueIndex("channel_capabilities_channel_uniq").on(t.channel),
  }),
);

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull().default(1),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  requestedForRole: roleEnum("requested_for_role").notNull().default("admin"),
  entityRef: text("entity_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Domain objects referenced by the Now surface (minimal, this part only)
// ---------------------------------------------------------------------------

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull().default(1), // 1-5
  urgencyHours: integer("urgency_hours").notNull().default(72), // smaller = more urgent
  status: text("status").notNull().default("open"),
  entityRef: text("entity_ref"),
  evidence: text("evidence").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workQueueItems = pgTable("work_queue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  assigneeRole: roleEnum("assignee_role").notNull().default("ops"),
  status: text("status").notNull().default("open"), // open | in_progress | done
  priority: integer("priority").notNull().default(3),
  entityRef: text("entity_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Collaboration signals (metadata only — no content analytics)
// ---------------------------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // finding | decision | project
    entityId: text("entity_id").notNull(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("comments_entity_idx").on(t.entityType, t.entityId),
  }),
);

export const acks = pgTable("acks", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // handling | released
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const presence = pgTable(
  "presence",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("presence_pk").on(t.userId, t.entityType, t.entityId),
  }),
);

// ---------------------------------------------------------------------------
// Last-visit watermark, used by the Now surface "what changed since" delta
// ---------------------------------------------------------------------------

export const lastVisit = pgTable("last_visit", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lastEventId: bigserial("last_event_id", { mode: "number" }).notNull(),
  lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull().defaultNow(),
});
