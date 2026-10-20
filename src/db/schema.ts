// LEADOS Platform schema — Part 10: API, Webhooks, Integrations & SDK.
//
// This introduces the persistence primitives the public API surface needs:
// API tokens (auth + scopes + rate limits), idempotency records, webhook
// subscriptions/deliveries, the automation "runs" job kernel, and a small
// representative domain (decisions / findings) + an append-only event log
// that both the realtime (SSE) API and the webhook dispatcher read from.
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Auth: API tokens scoped per organisation.
// ---------------------------------------------------------------------------
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    scopes: text("scopes").array().notNull().default(["read"]),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(120),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("api_tokens_token_hash_idx").on(table.tokenHash),
    index("api_tokens_org_idx").on(table.orgId),
  ],
);

// ---------------------------------------------------------------------------
// Idempotency: dedupes writes made with the same Idempotency-Key header.
// ---------------------------------------------------------------------------
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    key: text("key").notNull(),
    orgId: text("org_id").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idempotency_org_key_idx").on(table.orgId, table.key)],
);

// ---------------------------------------------------------------------------
// Core representative domain: decisions & findings.
// ---------------------------------------------------------------------------
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    owner: text("owner"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("decisions_org_idx").on(table.orgId),
    index("decisions_org_created_idx").on(table.orgId, table.createdAt),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    severity: text("severity").notNull().default("info"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("findings_org_idx").on(table.orgId),
    index("findings_org_created_idx").on(table.orgId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Automation API: idempotent job/run kernel used for external orchestration.
// ---------------------------------------------------------------------------
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runs_org_idempotency_idx").on(table.orgId, table.idempotencyKey),
    index("runs_org_created_idx").on(table.orgId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Append-only event log — backs the realtime SSE API and webhook dispatch.
// ---------------------------------------------------------------------------
export const platformEvents = pgTable(
  "platform_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    id: uuid("id").notNull().defaultRandom(),
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("platform_events_org_seq_idx").on(table.orgId, table.seq)],
);

// ---------------------------------------------------------------------------
// Webhooks: subscriptions + delivery log with retry/backoff & dead letter.
// ---------------------------------------------------------------------------
export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: text("event_types").array().notNull(),
    active: boolean("active").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhook_subscriptions_org_idx").on(table.orgId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    eventType: text("event_type").notNull(),
    eventId: uuid("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending|delivered|retrying|dead_letter
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    index("webhook_deliveries_sub_idx").on(table.subscriptionId),
    index("webhook_deliveries_status_idx").on(table.status, table.nextRetryAt),
  ],
);

// ---------------------------------------------------------------------------
// Reference integration: Slack notification bridge delivery log.
// ---------------------------------------------------------------------------
export const slackNotifications = pgTable("slack_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  channelOverride: text("channel_override"),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"),
  responseStatus: integer("response_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
