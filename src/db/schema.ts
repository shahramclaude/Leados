import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  boolean,
  jsonb,
  smallint,
} from "drizzle-orm/pg-core";

/**
 * observations — raw evidence feeding the belief primitives.
 * kind='rate'  -> `success` is required (Bernoulli trial for a RateBelief).
 * kind='level' -> `value` is required (continuous sample for a LevelBelief).
 * kind='drift' -> `value` is required (period sample for a DriftBelief/EWMA).
 */
export const observations = pgTable("observations", {
  id: serial("id").primaryKey(),
  metric: text("metric").notNull(),
  kind: text("kind").notNull(), // 'rate' | 'level' | 'drift'
  value: doublePrecision("value"),
  success: boolean("success"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * predictions — a log of every probability forecast issued by the engine,
 * resolved later with a 0/1 outcome. This is the evidence base for the
 * weekly calibration self-check (ECE > 0.05 auto-opens a finding).
 */
export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  modelCardId: text("model_card_id").notNull(),
  metric: text("metric").notNull(),
  predictedP: doublePrecision("predicted_p").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  outcome: smallint("outcome"), // 0 | 1 | null (unresolved)
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  context: jsonb("context"),
});

/**
 * findings — auto-opened issues. Created by the weekly calibration
 * self-check when ECE exceeds 0.05, or manually via /api/ai-learn.
 */
export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(), // e.g. 'calibration-drift'
  severity: text("severity").notNull(), // 'info' | 'warning' | 'critical'
  message: text("message").notNull(),
  metricRef: text("metric_ref"),
  value: doublePrecision("value"),
  threshold: doublePrecision("threshold"),
  status: text("status").notNull().default("open"), // 'open' | 'acknowledged' | 'resolved'
});
