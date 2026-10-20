import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS core schema — Part 02 (Information architecture + design system).
// Tables back the three IA tiers: Now (cockpit), Understand, Act.
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  email: text("email").notNull(),
  riskLevel: text("risk_level").notNull(), // low | medium | high
  status: text("status").notNull(), // active | leave | offboarding
  focusArea: text("focus_area").notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  track: text("track").notNull(), // execution | strategic
  category: text("category").notNull(),
  status: text("status").notNull(), // pending | approved | rejected | scheduled
  owner: text("owner").notNull(),
  severity: integer("severity").notNull(), // 1-5
  financialImpact: numeric("financial_impact", { precision: 14, scale: 2 }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  severity: integer("severity").notNull(), // 1-5
  trend: text("trend").notNull(), // up | down | flat
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  changePct: numeric("change_pct", { precision: 6, scale: 2 }).notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
});

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  target: numeric("target", { precision: 14, scale: 2 }).notNull(),
  p10: numeric("p10", { precision: 14, scale: 2 }).notNull(),
  p50: numeric("p50", { precision: 14, scale: 2 }).notNull(),
  p90: numeric("p90", { precision: 14, scale: 2 }).notNull(),
  // Array of { t: 'YYYY-MM-DD', v: number } points, oldest first, fixed length for determinism.
  series: jsonb("series").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeItems = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  tag: text("tag").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  status: text("status").notNull(), // testing | validated | invalidated
  confidence: integer("confidence").notNull(),
  owner: text("owner").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financialLines = pgTable("financial_lines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // revenue | cost
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  period: text("period").notNull(), // e.g. 2026-01
  forecastLow: numeric("forecast_low", { precision: 14, scale: 2 }).notNull(),
  forecastHigh: numeric("forecast_high", { precision: 14, scale: 2 }).notNull(),
});

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(), // active | draft | archived
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }).notNull(),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  change: text("change").notNull(),
  actor: text("actor").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
