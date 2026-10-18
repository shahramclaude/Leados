import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ── People ──────────────────────────────────────────────────────────
export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  cadenceDays: integer("cadence_days").notNull().default(14),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Events (pulse / oneonone / feedback / generic) ────────────────────
export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain").notNull(),
  personId: integer("person_id").references(() => leados_people.id),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Decisions ──────────────────────────────────────────────────────
export const leados_decisions = pgTable("leados_decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ── Growth plans / goals ───────────────────────────────────────────
export const leados_plans = pgTable("leados_plans", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => leados_people.id),
  goal: text("goal").notNull(),
  level: text("level").notNull().default("mid"),
  status: text("status").notNull().default("active"), // active | completed
  lastCheckin: timestamp("last_checkin").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Autonomous work queue ──────────────────────────────────────────
export const leados_work_queue = pgTable("leados_work_queue", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull().default({}),
  status: text("status").notNull().default("pending"), // pending | accepted | dismissed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Hypotheses ──────────────────────────────────────────────────────
export const leados_hypotheses = pgTable("leados_hypotheses", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  prediction: text("prediction").notNull(),
  testMetric: text("test_metric").notNull(),
  windowDays: integer("window_days").notNull().default(14),
  confidence: integer("confidence").notNull().default(50),
  status: text("status").notNull().default("open"), // open | confirmed | refuted
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Audit log ───────────────────────────────────────────────────────
export const leados_audit = pgTable("leados_audit", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  detail: text("detail").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
