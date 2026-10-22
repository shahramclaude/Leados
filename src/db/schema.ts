import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  doublePrecision,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS core domain schema (reconstructed minimal subset needed to exercise
// the Part 17 test pyramid: tenancy, auth, findings -> decisions -> approvals
// -> automation runs -> board packs). See docs/TESTING.md "Phase 0" for why
// this is a reconstruction rather than a port of pre-existing Parts 01-16
// tables (none were present in this workspace).
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["member", "admin"]);

export const findingStatusEnum = pgEnum("finding_status", [
  "open",
  "triaged",
  "closed",
]);

export const decisionStatusEnum = pgEnum("decision_status", [
  "proposed",
  "approved",
  "rejected",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const automationStatusEnum = pgEnum("automation_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    apiKey: text("api_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_api_key_idx").on(table.apiKey)],
);

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: findingStatusEnum("status").notNull().default("open"),
  // Beta-Bernoulli confidence state (see src/lib/domain/beta.ts).
  confidenceAlpha: doublePrecision("confidence_alpha").notNull().default(1),
  confidenceBeta: doublePrecision("confidence_beta").notNull().default(1),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  findingId: integer("finding_id")
    .notNull()
    .references(() => findings.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  rationale: text("rationale").notNull().default(""),
  status: decisionStatusEnum("status").notNull().default("proposed"),
  // PERT three-point estimate (see src/lib/domain/pert.ts).
  optimisticEstimate: doublePrecision("optimistic_estimate").notNull(),
  likelyEstimate: doublePrecision("likely_estimate").notNull(),
  pessimisticEstimate: doublePrecision("pessimistic_estimate").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => decisions.id, { onDelete: "cascade" }),
  approverId: integer("approver_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: approvalStatusEnum("status").notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => decisions.id, { onDelete: "cascade" }),
  status: automationStatusEnum("status").notNull().default("queued"),
  output: jsonb("output"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
