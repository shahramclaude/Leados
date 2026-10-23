// LEADOS data platform — core schema (scoped foundation).
//
// This is the single schema of record. Every table carries an org_id for
// future multi-tenant scoping, created_at/updated_at where mutable, and
// indexes on every foreign key used in hot queries.
import {
  pgTable,
  pgEnum,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const riskTierEnum = pgEnum("risk_tier", [
  "T0",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);
export const objectiveStatusEnum = pgEnum("objective_status", [
  "on_track",
  "at_risk",
  "off_track",
  "done",
]);
export const initiativeStatusEnum = pgEnum("initiative_status", [
  "planned",
  "active",
  "blocked",
  "done",
]);
export const decisionStatusEnum = pgEnum("decision_status", [
  "open",
  "analyzed",
  "decided",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("users_org_idx").on(t.orgId) }),
);

// ---------------------------------------------------------------------------
// Strategy: objectives, key results, initiatives
// ---------------------------------------------------------------------------
export const objectives = pgTable(
  "objectives",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    ownerId: text("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: objectiveStatusEnum("status").notNull().default("on_track"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("objectives_org_idx").on(t.orgId),
    ownerIdx: index("objectives_owner_idx").on(t.ownerId),
  }),
);

export const keyResults = pgTable(
  "key_results",
  {
    id: id(),
    objectiveId: text("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    unit: text("unit").notNull().default(""),
    baseline: numeric("baseline", { mode: "number" }).notNull().default(0),
    target: numeric("target", { mode: "number" }).notNull().default(100),
    current: numeric("current", { mode: "number" }).notNull().default(0),
    confidence: numeric("confidence", { mode: "number" }).notNull().default(0.5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ objectiveIdx: index("key_results_objective_idx").on(t.objectiveId) }),
);

export const initiatives = pgTable(
  "initiatives",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    objectiveId: text("objective_id").references(() => objectives.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    summary: text("summary"),
    status: initiativeStatusEnum("status").notNull().default("planned"),
    riskTier: riskTierEnum("risk_tier").notNull().default("T1"),
    ownerId: text("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    budgetUsd: numeric("budget_usd", { mode: "number" }).notNull().default(0),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    progressPct: integer("progress_pct").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("initiatives_org_idx").on(t.orgId),
    objectiveIdx: index("initiatives_objective_idx").on(t.objectiveId),
  }),
);

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
export const metrics = pgTable(
  "metrics",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("general"),
    unit: text("unit").notNull().default(""),
    value: numeric("value", { mode: "number" }).notNull(),
    previousValue: numeric("previous_value", { mode: "number" }).notNull().default(0),
    target: numeric("target", { mode: "number" }),
    asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("metrics_org_idx").on(t.orgId) }),
);

// ---------------------------------------------------------------------------
// Quantified decision intelligence
// ---------------------------------------------------------------------------
export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    status: decisionStatusEnum("status").notNull().default("open"),
    // alternatives: [{ id, label, costUsd, effects: [{ state, prob, value }] }]
    alternatives: jsonb("alternatives").notNull().default([]),
    analysis: jsonb("analysis"), // { expectedUtility, evpi, recommendation, sensitivity }
    recommendation: text("recommendation"),
    evpi: numeric("evpi", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({ orgIdx: index("decisions_org_idx").on(t.orgId) }),
);

// ---------------------------------------------------------------------------
// Workflow: approvals (T0-T5 action gate lite)
// ---------------------------------------------------------------------------
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    requestedBy: text("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    riskTier: riskTierEnum("risk_tier").notNull().default("T2"),
    amountUsd: numeric("amount_usd", { mode: "number" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    decisionNote: text("decision_note"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({ orgIdx: index("approvals_org_idx").on(t.orgId) }),
);

// ---------------------------------------------------------------------------
// Knowledge graph & citation-locked retrieval (lite)
// ---------------------------------------------------------------------------
export const documents = pgTable(
  "documents",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    source: text("source").notNull().default("internal"),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("documents_org_idx").on(t.orgId) }),
);

export const claims = pgTable(
  "claims",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    locator: text("locator").notNull().default(""),
    confidence: numeric("confidence", { mode: "number" }).notNull().default(0.8),
    createdAt: createdAt(),
  },
  (t) => ({
    orgIdx: index("claims_org_idx").on(t.orgId),
    documentIdx: index("claims_document_idx").on(t.documentId),
  }),
);

// ---------------------------------------------------------------------------
// Tamper-evident audit chain (lite)
// ---------------------------------------------------------------------------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ orgIdx: index("audit_events_org_idx").on(t.orgId) }),
);
