import {
  boolean,
  doublePrecision,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Domain } from "@/lib/types";

// All domain-ish columns are stored as text and typed via $type<Domain>()
// rather than a pg enum, so adding new domains never requires a migration.

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  domain: text("domain").$type<Domain>().notNull(),
  riskScore: doublePrecision("risk_score").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").$type<Domain>().notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: text("status").$type<"open" | "done">().notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").$type<Domain>().notNull(),
  status: text("status").$type<"open" | "confirmed" | "refuted">().notNull().default("open"),
  resolvesAt: timestamp("resolves_at", { withTimezone: true }),
  confidence: doublePrecision("confidence").notNull().default(0.5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  domain: text("domain").$type<Domain>().notNull(),
  status: text("status").$type<"triggered" | "in_progress" | "done">().notNull().default("triggered"),
  findingId: uuid("finding_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").$type<Domain>().notNull(),
  severity: doublePrecision("severity").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  probability: doublePrecision("probability"),
  confidence: doublePrecision("confidence").notNull().default(0.6),
  playbookId: uuid("playbook_id"),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const latentNodes = pgTable("latent_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  domain: text("domain").$type<Domain>().notNull(),
  posterior: doublePrecision("posterior").notNull().default(0.2),
  confidence: doublePrecision("confidence").notNull().default(0.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const briefings = pgTable("briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: text("date").notNull(),
  executiveSummary: text("executive_summary").notNull(),
  bullets: jsonb("bullets").$type<string[]>().notNull().default([]),
  fullText: text("full_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").$type<Domain>().notNull(),
  severity: doublePrecision("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domainHealthHistory = pgTable("domain_health_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").$type<Domain>().notNull(),
  score: doublePrecision("score").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").$type<"running" | "idle" | "degraded">().notNull().default("idle"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
});
