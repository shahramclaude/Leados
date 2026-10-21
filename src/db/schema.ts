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
// LEADOS Part 14 — API platform schema.
// Scopes known to the platform (stored as text[] on api_tokens.scopes):
//   leads:read leads:write accounts:read accounts:write events:read
//   stream:read webhooks:read webhooks:write automations:read automations:write
//   extensions:read extensions:write audit:read tokens:admin
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    isAdmin: boolean("is_admin").notNull().default(false),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(120),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_tokens_token_hash_idx").on(table.tokenHash),
    index("api_tokens_org_idx").on(table.orgId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    tokenId: uuid("token_id"),
    key: text("key").notNull(),
    route: text("route").notNull(),
    method: text("method").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_unique_idx").on(table.orgId, table.route, table.method, table.key),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("accounts_org_idx").on(table.orgId)],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    stage: text("stage").notNull().default("new"),
    score: integer("score").notNull().default(0),
    ownerEmail: text("owner_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leads_org_idx").on(table.orgId),
    index("leads_account_idx").on(table.accountId),
    index("leads_created_idx").on(table.createdAt),
  ],
);

export const events = pgTable(
  "events",
  {
    seq: bigserial("seq", { mode: "number" }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("events_org_idx").on(table.orgId),
    index("events_seq_idx").on(table.seq),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    tokenId: uuid("token_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_org_idx").on(table.orgId)],
);

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: text("event_types").array().notNull().default([]),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("webhook_subscriptions_org_idx").on(table.orgId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
    eventId: uuid("event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    responseStatus: integer("response_status"),
    responseBodySnippet: text("response_body_snippet"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    index("webhook_deliveries_subscription_idx").on(table.subscriptionId),
    index("webhook_deliveries_status_idx").on(table.status),
  ],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    playbookKey: text("playbook_key").notNull(),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    idempotencyKey: text("idempotency_key"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("automation_runs_org_idx").on(table.orgId),
    index("automation_runs_key_idx").on(table.playbookKey),
  ],
);

export const extensions = pgTable(
  "extensions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").notNull(),
    type: text("type").notNull(),
    key: text("key").notNull(),
    config: jsonb("config").notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("extensions_org_kind_key_idx").on(table.orgId, table.kind, table.key)],
);

export const slackInstalls = pgTable(
  "slack_installs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name"),
    accessToken: text("access_token").notNull(),
    botUserId: text("bot_user_id"),
    incomingWebhookUrl: text("incoming_webhook_url"),
    incomingWebhookChannel: text("incoming_webhook_channel"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("slack_installs_team_idx").on(table.teamId)],
);
