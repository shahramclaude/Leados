// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
//
// Part 8 — Knowledge Architecture
// ---------------------------------------------------------------------------
// This introduces the Leados "knowledge graph" persistence layer: a generic
// node/edge store that every agent cycle writes into, plus two supporting
// ledgers (findings + decisions) that the knowledge graph functions read
// from when computing root-cause chains, pattern matches, and the
// institutional memory digest.

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Knowledge graph: nodes
// ---------------------------------------------------------------------------
export const leadosMemoryNodes = pgTable(
  "leados_memory_nodes",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    type: text("type").notNull(), // person | decision | finding | insight | belief | playbook | domain
    label: text("label").notNull(),
    domain: text("domain").notNull(), // people | risk | finance | strategy | operations | culture | customer | compliance
    severity: integer("severity"), // 1-5, null for non-finding nodes
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    importance: real("importance").notNull().default(0.1), // pagerank-ish 0..1
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("leados_memory_nodes_key_idx").on(table.key)],
);

// ---------------------------------------------------------------------------
// Knowledge graph: edges
// ---------------------------------------------------------------------------
export const leadosMemoryEdges = pgTable("leados_memory_edges", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => leadosMemoryNodes.id, { onDelete: "cascade" }),
  targetId: integer("target_id")
    .notNull()
    .references(() => leadosMemoryNodes.id, { onDelete: "cascade" }),
  relation: text("relation").notNull(), // caused | resolved | informed | triggered | blocked | created
  weight: real("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Findings ledger (source of "finding" nodes in the graph)
// ---------------------------------------------------------------------------
export const leadosFindings = pgTable(
  "leados_findings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    ruleKey: text("rule_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    domain: text("domain").notNull(),
    severity: integer("severity").notNull().default(3),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open | resolved
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("leados_findings_key_idx").on(table.key)],
);

// ---------------------------------------------------------------------------
// Decision ledger (source of "decision" nodes + the Decision Ledger view)
// ---------------------------------------------------------------------------
export const leadosDecisions = pgTable(
  "leados_decisions",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    domain: text("domain").notNull(),
    confidenceAtDecision: real("confidence_at_decision").notNull().default(0.5),
    outcome: boolean("outcome"), // null = pending, true = good outcome, false = bad outcome
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("leados_decisions_key_idx").on(table.key)],
);

export {};
