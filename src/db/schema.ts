// LEADOS baseline schema (Part 21 reconciliation baseline).
//
// Honesty note: this schema is the real, running schema for the LEADOS
// "v0.1.0" baseline described in README.md and docs/INDEX.md. It intentionally
// covers only what is implemented: multi-tenant lead storage, a deterministic
// rules-based scoring engine, round-robin rotation of reps, and an append-only
// evidence ledger ("decisions"). Anything described elsewhere as causal
// inference, ML-based fairness auditing, retrieval/LLM reasoning, or
// real-time sensing is NOT represented here and is labeled as roadmap intent
// in docs/explanations/*.
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)],
);

export const reps = pgTable("reps", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Deterministic, auditable scoring rules. Each rule inspects one signal field
// on a lead and contributes `weight` points to the score when `operator`
// evaluated against `value` is true for that field. See src/lib/scoring.ts.
export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  field: text("field").notNull(),
  operator: text("operator").notNull(), // "gte" | "lte" | "eq" | "truthy"
  value: text("value").notNull(),
  weight: integer("weight").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  company: text("company").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull().default("manual"),
  signals: jsonb("signals").notNull().$type<Record<string, number | string | boolean>>(),
  repId: integer("rep_id").references(() => reps.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadScores = pgTable("lead_scores", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  band: text("band").notNull(), // "hot" | "warm" | "cold"
  breakdown: jsonb("breakdown").notNull().$type<
    Array<{ rule: string; field: string; matched: boolean; weight: number }>
  >(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only evidence ledger. Every automated action (scoring, rotation
// assignment) writes one row here with a human-readable summary and the raw
// evidence that produced it, so any decision can be traced back to its cause.
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  type: text("type").notNull(), // "scored" | "rotated"
  actor: text("actor").notNull().default("system"),
  summary: text("summary").notNull(),
  evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rotationState = pgTable(
  "rotation_state",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    lastRepId: integer("last_rep_id").references(() => reps.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("rotation_state_tenant_idx").on(table.tenantId)],
);
