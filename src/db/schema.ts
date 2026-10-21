// LEADOS domain schema — Part 15 introduces just enough persisted state to give
// the test pyramid (unit → integration → contract → e2e) something real to
// exercise: tenancy isolation, pagination, validation and the golden journey
// onboarding → capture → finding → decision → approval → automation run →
// board pack.
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  // Beta-Bernoulli posterior parameters backing the confidence score.
  alpha: doublePrecision("alpha").notNull().default(1),
  beta: doublePrecision("beta").notNull().default(1),
  status: text("status").notNull().default("cold"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => findings.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  rationale: text("rationale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  decisionId: uuid("decision_id")
    .notNull()
    .references(() => decisions.id, { onDelete: "cascade" }),
  approver: text("approver").notNull(),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  approvalId: uuid("approval_id")
    .notNull()
    .references(() => approvals.id, { onDelete: "cascade" }),
  seed: integer("seed").notNull(),
  trials: integer("trials").notNull(),
  meanOutcome: doublePrecision("mean_outcome").notNull(),
  p05: doublePrecision("p05").notNull(),
  p95: doublePrecision("p95").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
