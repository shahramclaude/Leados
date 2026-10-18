// Unified Intelligence Core — database schema.
//
// UNVERIFIED-PRIOR-STATE: the task brief references pre-existing tables and
// lib modules (bayesianNetwork.ts, causalChain.ts, etc.) but this sandbox's
// repository contained only the bare Next.js + Drizzle starter (confirmed via
// `list_files`/`cat` — see orchestrator.ts header comment for the full
// provenance note). This schema is therefore a new, from-scratch design that
// supports the orchestration pipeline described in the brief.
import type { OrchestratorResult } from "@/lib/types";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Org roster -------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  tenureMonths: integer("tenure_months").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Raw behavioural / operational signals ingested from the org ------

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    value: real("value").notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (table) => ({
    personIdx: index("signals_person_idx").on(table.personId),
    occurredIdx: index("signals_occurred_idx").on(table.occurredAt),
    typeIdx: index("signals_type_idx").on(table.type),
  }),
);

// --- Findings produced by rule evaluation (engine.ts) ------------------

export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    domain: text("domain").notNull(),
    personId: integer("person_id").references(() => people.id, { onDelete: "cascade" }),
    teamId: text("team_id"),
    severity: integer("severity").notNull(),
    message: text("message").notNull(),
    evidence: jsonb("evidence").$type<Record<string, number | string>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    personIdx: index("findings_person_idx").on(table.personId),
    ruleIdx: index("findings_rule_idx").on(table.ruleId),
    activeIdx: index("findings_active_idx").on(table.active),
  }),
);

// --- Bayesian belief network state (bayesianNetwork.ts) -----------------

export const beliefs = pgTable(
  "beliefs",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    probability: real("probability").notNull(),
    priorProbability: real("prior_probability").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    personNodeUnique: uniqueIndex("beliefs_person_node_unique").on(table.personId, table.nodeKey),
  }),
);

// --- Tunable weights (e.g. org health weighting) -----------------------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Orchestrator result cache ------------------------------------------

export const orchestratorCache = pgTable("orchestrator_cache", {
  id: serial("id").primaryKey(),
  result: jsonb("result").$type<OrchestratorResult>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
