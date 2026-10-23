import {
  pgEnum,
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS — Executive Decision Intelligence Command Center
// Core domain: decision governance, early-warning signals, people directory.
// ---------------------------------------------------------------------------

export const decisionStatusEnum = pgEnum("decision_status", [
  "proposed",
  "under_review",
  "committed",
  "archived",
]);

export const decisionImpactEnum = pgEnum("decision_impact", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const signalSeverityEnum = pgEnum("signal_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const signalStatusEnum = pgEnum("signal_status", [
  "active",
  "acknowledged",
  "resolved",
]);

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  owner: varchar("owner", { length: 120 }).notNull().default("Unassigned"),
  status: decisionStatusEnum("status").notNull().default("proposed"),
  impact: decisionImpactEnum("impact").notNull().default("medium"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

export const decisionEvents = pgTable("decision_events", {
  id: serial("id").primaryKey(),
  decisionId: serial("decision_id").notNull(),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  actor: varchar("actor", { length: 120 }).notNull().default("System"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 120 }).notNull().default("General"),
  source: varchar("source", { length: 120 }).notNull().default("Manual"),
  severity: signalSeverityEnum("severity").notNull().default("medium"),
  status: signalStatusEnum("status").notNull().default("active"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  role: varchar("role", { length: 150 }).notNull().default(""),
  department: varchar("department", { length: 150 }).notNull().default("General"),
  email: varchar("email", { length: 200 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
