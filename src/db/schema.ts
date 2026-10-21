// LEADOS core schema.
//
// Naming rule (see docs/GLOSSARY.md): the canonical intelligence unit is a
// "finding". A human or agent response to a finding is a "decision". A
// machine-drafted artifact awaiting human sign-off is a "proposal". These
// three words are never used interchangeably anywhere else in the codebase.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tenancy (Part 13 lineage)
// ---------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleEnum = pgEnum("role", ["owner", "admin", "analyst", "viewer"]);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("memberships_org_user_uq").on(table.orgId, table.userId)],
);

// ---------------------------------------------------------------------------
// Permission registry (Part 17 lineage) — single source of truth for what
// every role may do. Both the UI and every API route (internal + public)
// read from this registry; nothing hard-codes a role check.
// ---------------------------------------------------------------------------

export const permissionKeyEnum = pgEnum("permission_key", [
  "finding:read",
  "finding:write",
  "decision:write",
  "proposal:write",
  "proposal:approve",
  "agent_run:create",
  "agent_action:approve",
  "audit:read",
  "budget:read",
  "budget:manage",
  "admin:manage_members",
]);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: roleEnum("role").notNull(),
    permission: permissionKeyEnum("permission").notNull(),
  },
  (table) => [primaryKey({ columns: [table.role, table.permission] })],
);

// API keys scope the public API (Part 14) to one org and a fixed permission
// subset — never broader than the registry above.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Budgets (Part 16 lineage) — compute spending caps per org per period.
// Every agent run (Part 06 compute) must charge this ledger before it runs.
// ---------------------------------------------------------------------------

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(), // "YYYY-MM"
    computeUnitsLimit: integer("compute_units_limit").notNull(),
    computeUnitsUsed: integer("compute_units_used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("budgets_org_period_uq").on(table.orgId, table.period)],
);

// ---------------------------------------------------------------------------
// Findings + Explain<T> (Part 05/08 lineage)
// ---------------------------------------------------------------------------

export const domainEnum = pgEnum("domain", ["intelligence", "people", "finance"]);
export const causalConfidenceEnum = pgEnum("causal_confidence", [
  "correlational",
  "causal",
  "experimental",
]);
export const sourceEnum = pgEnum("source", ["human", "agent", "llm"]);

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  domain: domainEnum("domain").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  // Explain<T> envelope — see src/lib/explain.ts for the TypeScript contract
  // this jsonb column must always satisfy.
  explanation: jsonb("explanation").notNull(),
  causalConfidence: causalConfidenceEnum("causal_confidence").notNull().default("correlational"),
  source: sourceEnum("source").notNull().default("human"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Event envelope (Part 01 lineage) — the append-only, hash-chained log that
// every write in the system (human, agent, or LLM) must pass through.
// ---------------------------------------------------------------------------

export const actorTypeEnum = pgEnum("actor_type", ["human", "agent", "llm", "system"]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  prevHash: varchar("prev_hash", { length: 64 }),
  hash: varchar("hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Agents + the interrupt policy (Part 04/07/12 lineage)
// ---------------------------------------------------------------------------

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);
export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
]);
export const actionStatusEnum = pgEnum("action_status", [
  "pending",
  "awaiting_approval",
  "approved",
  "rejected",
  "executed",
]);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(),
  goal: text("goal").notNull(),
  status: runStatusEnum("status").notNull().default("pending"),
  computeUnitsCharged: integer("compute_units_charged").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull().default("low"),
  payload: jsonb("payload").notNull(),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  status: actionStatusEnum("status").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// LLM proposals (Part 08 lineage) — generated text must pass through the
// causal-language rules (Part 05) before it is stored.
// ---------------------------------------------------------------------------

export const proposalStatusEnum = pgEnum("proposal_status", ["draft", "approved", "rejected"]);

export const llmProposals = pgTable("llm_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  findingId: uuid("finding_id").references(() => findings.id, { onDelete: "set null" }),
  rawDraft: text("raw_draft").notNull(),
  sanitizedDraft: text("sanitized_draft").notNull(),
  causalRewrites: integer("causal_rewrites").notNull().default(0),
  status: proposalStatusEnum("status").notNull().default("draft"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
