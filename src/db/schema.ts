import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ════════════════════════════════════════════════════════════════
// BASE LAYER — people + events (the substrate the engine projects)
// ════════════════════════════════════════════════════════════════

export const leados_people = pgTable("leados_people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  reports_to: uuid("reports_to"),
  cadence_days: integer("cadence_days").notNull().default(14),
  archived: boolean("archived").notNull().default(false),
  joined_at: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leados_events = pgTable("leados_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  domain: text("domain").notNull(),
  person_id: uuid("person_id"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ════════════════════════════════════════════════════════════════
// INTELLIGENCE LAYER — hypotheses, beliefs, work queue, audit trail
// ════════════════════════════════════════════════════════════════

export const leados_hypotheses = pgTable("leados_hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(),
  statement: text("statement").notNull(),
  source: text("source").notNull(),
  prediction: text("prediction").notNull(),
  test_metric: text("test_metric").notNull(),
  test_window_days: integer("test_window_days").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  auto_generated: boolean("auto_generated").notNull().default(true),
  // 'confirmed' | 'refuted' | 'inconclusive' | null
  result: text("result"),
  result_note: text("result_note"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
});

export const leados_beliefs = pgTable("leados_beliefs", {
  hypothesis: text("hypothesis").primaryKey(),
  prior: real("prior").notNull(),
  posterior: real("posterior").notNull(),
  evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leados_work_queue = pgTable("leados_work_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  // 'pending' | 'accepted' | 'dismissed'
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
});

export const leados_audit = pgTable("leados_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  detail: text("detail"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});
