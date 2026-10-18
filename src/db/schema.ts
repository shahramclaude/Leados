import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  cadenceDays: integer("cadence_days").notNull().default(14),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Generic event log: pulses, 1:1s, feedback, etc.
export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // pulse | oneonone | feedback | note | other
  domain: text("domain").notNull().default("people"), // people|finance|sales|ops|strategy|gov
  personId: integer("person_id").references(() => leados_people.id),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_decisions = pgTable("leados_decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull().default(""),
  domain: text("domain").notNull().default("gov"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  status: text("status").notNull().default("open"), // open|resolved
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_growth_plans = pgTable("leados_growth_plans", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").references(() => leados_people.id),
  goal: text("goal").notNull().default(""),
  level: text("level").notNull().default("developing"), // developing|solid|advanced
  status: text("status").notNull().default("open"), // open|closed
  lastCheckin: timestamp("last_checkin").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_work_queue = pgTable("leados_work_queue", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("draft"), // draft|summary|email|plan
  status: text("status").notNull().default("pending"), // pending|accepted|dismissed
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_hypotheses = pgTable("leados_hypotheses", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  prediction: text("prediction").notNull().default(""),
  testMetric: text("test_metric").notNull().default(""),
  windowDays: integer("window_days").notNull().default(14),
  status: text("status").notNull().default("open"), // open|confirmed|refuted
  confidence: integer("confidence").notNull().default(50),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_audit = pgTable("leados_audit", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
