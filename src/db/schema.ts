import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Multi-tenant root
// ---------------------------------------------------------------------------
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Leads — scored with the deterministic, explainable scoring engine
// ---------------------------------------------------------------------------
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull().default(""),
    email: text("email").notNull().default(""),
    budget: numeric("budget", { precision: 14, scale: 2 }).notNull().default("0"),
    dealValue: numeric("deal_value", { precision: 14, scale: 2 }).notNull().default("0"),
    companySize: integer("company_size").notNull().default(0),
    engagementScore: integer("engagement_score").notNull().default(0),
    titleSeniority: text("title_seniority").notNull().default("individual_contributor"),
    icpFit: integer("icp_fit").notNull().default(0),
    responseHistory: integer("response_history").notNull().default(0),
    stage: text("stage").notNull().default("new"),
    score: integer("score").notNull().default(0),
    scoreBreakdown: jsonb("score_breakdown").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_tenant_idx").on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Decisions — hash-chained, tamper-evident evidence ledger
// ---------------------------------------------------------------------------
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull().default({}),
    rationale: text("rationale").notNull().default(""),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decisions_tenant_idx").on(t.tenantId, t.sequence)],
);

// ---------------------------------------------------------------------------
// Knowledge substrate — labeled institutional knowledge
// ---------------------------------------------------------------------------
export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    category: text("category").notNull().default("measured"),
    tags: jsonb("tags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_tenant_idx").on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Part 59 — Pipeline Forecasting & Revenue Attribution
// Each forecast is a pure, reproducible function of a lead's score + stage,
// stored as a row so the evidence ledger can reference it and so forecasts
// can be compared over time instead of only ever showing the latest number.
// ---------------------------------------------------------------------------
export const forecasts = pgTable(
  "forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    stageAtForecast: text("stage_at_forecast").notNull(),
    scoreAtForecast: integer("score_at_forecast").notNull(),
    probability: numeric("probability", { precision: 5, scale: 2 }).notNull(),
    dealValue: numeric("deal_value", { precision: 14, scale: 2 }).notNull(),
    weightedValue: numeric("weighted_value", { precision: 14, scale: 2 }).notNull(),
    method: text("method").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forecasts_tenant_idx").on(t.tenantId, t.period)],
);
