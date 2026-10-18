import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// LeadOS schema
// ─────────────────────────────────────────────────────────────────────────

export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // oneonone | pulse | feedback | decision | incident | support_ticket | okr_review | deal | meeting | task_assigned
  personId: integer("person_id").references(() => leados_people.id),
  domain: text("domain").notNull(), // people | finance | sales | ops | strategy
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_growth_plans = pgTable("leados_growth_plans", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").references(() => leados_people.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"), // open | completed
  lastCheckinAt: timestamp("last_checkin_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_work_queue = pgTable("leados_work_queue", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("action"),
  status: text("status").notNull().default("pending"), // pending | done | dismissed
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_audit = pgTable("leados_audit", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  key: text("key").notNull().default(""),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_playbooks = pgTable("leados_playbooks", {
  id: serial("id").primaryKey(),
  triggeredBy: text("triggered_by").notNull(), // rule key e.g. 'CADENCE_SLIP'
  personId: integer("person_id").references(() => leados_people.id),
  findingKey: text("finding_key").notNull(),
  status: text("status").notNull().default("open"), // open | completed | skipped
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  completedSteps: jsonb("completed_steps").$type<number[]>().notNull().default([]),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const leados_metrics = pgTable("leados_metrics", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // 'runway_months' | 'mrr_growth_pct' etc.
  value: real("value").notNull(),
  domain: text("domain").notNull(),
  note: text("note").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
