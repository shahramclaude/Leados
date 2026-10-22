// LEADOS core schema.
//
// Vocabulary contract (see docs/GLOSSARY.md — do not reintroduce synonyms):
//   - "signal"   = a raw observed data point about a lead (never "finding").
//   - "decision" = a committed, attributable choice made by a human, agent or
//                  LLM about a lead (never "choice").
//   - "event"    = the immutable envelope row written for every mutation.
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["human", "agent", "llm", "system"]);
export const apiScopeEnum = pgEnum("api_scope", ["internal", "partner", "public"]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "ok",
  "denied_tier",
  "denied_budget",
  "denied_policy",
  "error",
]);

export const organizations = pgTable("organizations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  company: text("company").notNull(),
  email: text("email"),
  stage: text("stage").notNull().default("new"),
  // Denormalized latest score + confidence so list surfaces don't need a join
  // to render an Explain<T> badge (Part 04 uncertainty requirement).
  score: numeric("score", { precision: 5, scale: 2 }),
  scoreConfidence: numeric("score_confidence", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A "signal" is a raw, low-level observation about a lead (an email open, a
// firmographic fact, a webhook payload, an imported CSV row, etc). Signals
// are inputs; they are never themselves decisions.
export const signals = pgTable("signals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  source: text("source").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("1.0000"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A "decision" is a committed, attributable choice (stage change, score
// override, outreach recommendation) made by a human, an agent tool, or an
// LLM draft. Every decision carries an Explain<T> envelope (confidence +
// basis + generatedBy) so downstream surfaces never show a bare number.
export const decisions = pgTable("decisions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id),
  kind: text("kind").notNull(),
  value: jsonb("value").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  basis: jsonb("basis").notNull(),
  rationale: text("rationale").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  languagePolicyViolations: jsonb("language_policy_violations").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The write envelope. EVERY mutation in LEADOS — human, agent-tool, or
// LLM-proposed — must produce exactly one row here (src/lib/envelope.ts is
// the only code path allowed to insert into this table).
export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Agent tier catalogue (Part 10). Tier gates which tools (Part 11) an agent
// may invoke, regardless of what the LLM "wants" to call.
export const agents = pgTable("agents", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  tier: integer("tier").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id),
  tool: text("tool").notNull(),
  tierAtRun: integer("tier_at_run").notNull(),
  status: agentRunStatusEnum("status").notNull(),
  costUnits: numeric("cost_units", { precision: 10, scale: 4 }).notNull().default("0"),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Compute budgets (Part 18) covering agent/LLM compute (Part 06).
export const budgets = pgTable(
  "budgets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id),
    period: text("period").notNull(), // e.g. "2026-01"
    limitUnits: numeric("limit_units", { precision: 12, scale: 4 }).notNull(),
    usedUnits: numeric("used_units", { precision: 12, scale: 4 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("budgets_org_period_idx").on(table.orgId, table.period)],
);

// API registry (Part 19) covering every public route (Part 16). The public
// API handler refuses to serve any path that is not listed here.
export const apiRegistry = pgTable(
  "api_registry",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    path: text("path").notNull(),
    version: text("version").notNull().default("v1"),
    scope: apiScopeEnum("scope").notNull(),
    minTier: integer("min_tier").notNull().default(0),
    description: text("description").notNull(),
    deprecated: boolean("deprecated").notNull().default(false),
  },
  (table) => [uniqueIndex("api_registry_path_version_idx").on(table.path, table.version)],
);

export const apiKeys = pgTable("api_keys", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  keyHash: text("key_hash").notNull(),
  label: text("label").notNull(),
  scope: apiScopeEnum("scope").notNull().default("public"),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
