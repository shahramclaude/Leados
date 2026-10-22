import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * LEADOS core domain (Part 16 establishes a minimal but real domain
 * so the /api/v1 platform work has concrete resources to normalize).
 * ------------------------------------------------------------------ */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    status: text("status").notNull().default("new"), // new|contacted|qualified|won|lost
    score: integer("score").notNull().default(0),
    ownerId: text("owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("leads_created_at_idx").on(t.createdAt), index("leads_status_idx").on(t.status)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("contacts_created_at_idx").on(t.createdAt)],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
    stage: text("stage").notNull().default("open"), // open|won|lost
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("deals_created_at_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Platform: auth, idempotency, audit
 * ------------------------------------------------------------------ */

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hashedKey: text("hashed_key").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idempotency_key_route_idx").on(t.idempotencyKey, t.route)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Webhooks: subscriptions, durable event log, deliveries (+ retry /
 * dead-letter), per Part 10's durable-run model.
 * ------------------------------------------------------------------ */

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  eventTypes: text("event_types").array().notNull().default([]),
  status: text("status").notNull().default("active"), // active|disabled
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_events_created_at_idx").on(t.createdAt)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => webhookEvents.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending|retrying|success|dead_letter
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    lastStatusCode: integer("last_status_code"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("webhook_deliveries_status_idx").on(t.status),
    index("webhook_deliveries_next_attempt_idx").on(t.nextAttemptAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Automation: playbooks + durable runs (Part 10 capability registry)
 * ------------------------------------------------------------------ */

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  steps: jsonb("steps").notNull().default([]), // [{ type, config }]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("queued"), // queued|running|succeeded|failed
    input: jsonb("input"),
    output: jsonb("output"),
    correlationId: text("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_runs_created_at_idx").on(t.createdAt)],
);
