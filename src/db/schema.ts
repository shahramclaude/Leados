import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS — founding schema (Part 00/01 scope: multi-tenant substrate,
// event-sourced truth core, explainable scoring, append-only evidence ledger,
// institutional knowledge substrate).
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_tenant_idx").on(table.tenantId),
    uniqueIndex("users_tenant_email_idx").on(table.tenantId, table.email),
  ]
);

// Ontology substrate: typed entities (accounts, leads, initiatives, people...)
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    attributes: jsonb("attributes").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("entities_tenant_type_idx").on(table.tenantId, table.type)]
);

// Event-sourced truth core: append-only log of everything that happened.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_tenant_created_idx").on(table.tenantId, table.createdAt)]
);

// Leads: scored with an explainable, deterministic rules engine.
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company").notNull(),
    email: text("email").notNull(),
    source: text("source").notNull().default("manual"),
    stage: text("stage").notNull().default("new"),
    attributes: jsonb("attributes").notNull().default({}),
    score: integer("score").notNull().default(0),
    scoreBreakdown: jsonb("score_breakdown").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_tenant_idx").on(table.tenantId),
    index("leads_tenant_score_idx").on(table.tenantId, table.score),
  ]
);

// Evidence ledger: append-only, hash-chained for tamper evidence.
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    outcome: text("outcome").notNull().default("pending"),
    confidence: integer("confidence").notNull().default(50),
    confidenceLabel: text("confidence_label").notNull().default("estimated"),
    evidence: jsonb("evidence").notNull().default([]),
    actor: text("actor").notNull().default("system"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("decisions_tenant_created_idx").on(table.tenantId, table.createdAt),
  ]
);

// Institutional memory / knowledge substrate.
export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("general"),
    content: text("content").notNull(),
    tags: jsonb("tags").notNull().default([]),
    source: text("source").notNull().default("manual"),
    confidenceLabel: text("confidence_label").notNull().default("measured"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("knowledge_tenant_category_idx").on(table.tenantId, table.category)]
);
