// =============================================================================
// LEADOS — Part 11 schema bridge
// -----------------------------------------------------------------------------
// This sandbox does not contain the actual Parts 01/04/08 source (fresh
// starter template). To build and validate Part 11 (LLM systems: grounded
// generation, RAG, tool use, cost governance) end-to-end, this file defines
// the MINIMAL set of upstream tables that Part 11 depends on:
//   - orgs / users              (Part 01 — identity & tenancy bridge)
//   - entities / events / metrics (Part 04 — knowledge graph bridge)
//   - documents / document_chunks (Part 08/12 — evidence & RAG corpus bridge)
// plus the tables that belong to THIS part:
//   - llm_budgets / llm_usage_log   (cost governance)
//   - llm_cache                     (semantic cache)
//   - llm_audit_log                 (redacted generation audit trail)
//   - injection_incidents           (prompt-injection containment log)
//   - eval_runs                     (eval:llm scorecard history)
// When the real Parts 01/04/08 land, these bridge tables should be reconciled
// (same shape, same `ref` conventions) rather than duplicated.
// =============================================================================

import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tenancy / identity bridge (Part 01)
// ---------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

// ---------------------------------------------------------------------------
// Knowledge graph bridge (Part 04): entities / events / metrics
// ---------------------------------------------------------------------------

export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    type: text("type").notNull(), // company | person | product | market | deal
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("entities_org_idx").on(t.orgId),
  }),
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    entityId: integer("entity_id").references(() => entities.id),
    type: text("type").notNull(), // funding | leadership_change | product_launch | filing | news | risk_flag
    title: text("title").notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    importance: text("importance").notNull().default("normal"), // low | normal | high | critical
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("events_org_idx").on(t.orgId),
    entityIdx: index("events_entity_idx").on(t.entityId),
    occurredIdx: index("events_occurred_idx").on(t.occurredAt),
  }),
);

export const metrics = pgTable(
  "metrics",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    entityId: integer("entity_id").references(() => entities.id),
    name: text("name").notNull(), // arr | headcount | nps | churn_rate | ...
    value: numeric("value", { precision: 18, scale: 4 }).notNull(),
    previousValue: numeric("previous_value", { precision: 18, scale: 4 }),
    unit: text("unit"), // usd | percent | count
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("metrics_org_idx").on(t.orgId),
    entityIdx: index("metrics_entity_idx").on(t.entityId),
    periodIdx: index("metrics_period_idx").on(t.periodEnd),
  }),
);

// ---------------------------------------------------------------------------
// Evidence / RAG corpus bridge (Part 08 citation contract + Part 12 retrieval)
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    entityId: integer("entity_id").references(() => entities.id),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // Where the content originated. Anything other than "system" (curated,
    // deterministic pipeline output) is treated as UNTRUSTED for prompt
    // construction purposes (see src/lib/ai/taint.ts).
    sourceType: text("source_type").notNull(), // system | import | webhook | note
    trust: text("trust").notNull().default("untrusted"), // trusted | untrusted
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("documents_org_idx").on(t.orgId),
  }),
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull().references(() => documents.id),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    chunkIndex: integer("chunk_index").notNull(),
    section: text("section"),
    text: text("text").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index("document_chunks_doc_idx").on(t.documentId),
    orgIdx: index("document_chunks_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Part 11 — cost governance
// ---------------------------------------------------------------------------

export const llmBudgets = pgTable(
  "llm_budgets",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    userId: integer("user_id").references(() => users.id),
    feature: text("feature").notNull(), // briefing | ask | insight | narrative
    periodKey: text("period_key").notNull(), // e.g. 2026-06 (monthly bucket)
    budgetCents: integer("budget_cents").notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("llm_budgets_unique").on(t.orgId, t.userId, t.feature, t.periodKey),
  }),
);

export const llmUsageLog = pgTable(
  "llm_usage_log",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    userId: integer("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    taskId: text("task_id"),
    modelCardId: text("model_card_id").notNull(),
    provider: text("provider").notNull(), // composer | openai-small | openai-large
    tier: text("tier").notNull(), // composer | small | large
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costCents: numeric("cost_cents", { precision: 10, scale: 4 }).notNull().default("0"),
    cacheHit: boolean("cache_hit").notNull().default(false),
    degraded: boolean("degraded").notNull().default(false),
    groundingHash: text("grounding_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("llm_usage_log_org_idx").on(t.orgId),
    featureIdx: index("llm_usage_log_feature_idx").on(t.feature),
  }),
);

// ---------------------------------------------------------------------------
// Part 11 — semantic cache
// ---------------------------------------------------------------------------

export const llmCache = pgTable(
  "llm_cache",
  {
    id: serial("id").primaryKey(),
    cacheKey: text("cache_key").notNull(),
    task: text("task").notNull(),
    groundingHash: text("grounding_hash").notNull(),
    output: jsonb("output").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("llm_cache_key_idx").on(t.cacheKey),
  }),
);

// ---------------------------------------------------------------------------
// Part 11 — redacted audit trail for every generation
// ---------------------------------------------------------------------------

export const llmAuditLog = pgTable(
  "llm_audit_log",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => orgs.id),
    userId: integer("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    taskId: text("task_id"),
    modelCardId: text("model_card_id").notNull(),
    inputSummaryRedacted: text("input_summary_redacted").notNull(),
    outputSummaryRedacted: text("output_summary_redacted").notNull(),
    citationCount: integer("citation_count").notNull().default(0),
    citationsValid: boolean("citations_valid").notNull().default(false),
    abstained: boolean("abstained").notNull().default(false),
    abstainReason: text("abstain_reason"),
    injectionFlag: boolean("injection_flag").notNull().default(false),
    confidenceClass: text("confidence_class").notNull().default("low"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("llm_audit_log_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Part 11 — prompt-injection containment log
// ---------------------------------------------------------------------------

export const injectionIncidents = pgTable(
  "injection_incidents",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id"),
    userId: integer("user_id"),
    source: text("source").notNull(), // document | tool_result | user_query
    attackPattern: text("attack_pattern").notNull(),
    blocked: boolean("blocked").notNull().default(true),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("injection_incidents_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Part 11 — eval:llm scorecard history
// ---------------------------------------------------------------------------

export const evalRuns = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  datasetVersion: text("dataset_version").notNull(),
  split: text("split").notNull(), // train | holdout | all
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  costReport: jsonb("cost_report").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
