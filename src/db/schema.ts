import { integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** People — backs Understand ▸ People. */
export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull(), // active | leave | offboarding
  severity: integer("severity").notNull(), // 1-5 attrition-risk severity
  startDate: text("start_date").notNull(), // ISO date
});

/** Decisions — backs Now ▸ Cockpit pending approvals and Act ▸ Decisions. */
export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(), // pending | approved | rejected
  severity: integer("severity").notNull(),
  dueDate: text("due_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Metric catalog — one row per tracked KPI. */
export const metrics = pgTable("metrics", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(), // growth | retention | ops | finance
});

/** Metric time series with explicit uncertainty bounds, consumed by the
 * chart grammar's Explain<T> shape. */
export const metricSnapshots = pgTable("metric_snapshots", {
  id: text("id").primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id),
  period: text("period").notNull(), // ISO month, e.g. 2026-01
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  low: numeric("low", { precision: 14, scale: 2 }),
  high: numeric("high", { precision: 14, scale: 2 }),
});

/** Finance actuals + forecast band — backs Act ▸ Financial. */
export const financeLines = pgTable("finance_lines", {
  id: text("id").primaryKey(),
  category: text("category").notNull(), // revenue | cogs | opex | headcount_cost
  month: text("month").notNull(), // ISO month
  actual: numeric("actual", { precision: 14, scale: 2 }),
  forecast: numeric("forecast", { precision: 14, scale: 2 }).notNull(),
  forecastLow: numeric("forecast_low", { precision: 14, scale: 2 }).notNull(),
  forecastHigh: numeric("forecast_high", { precision: 14, scale: 2 }).notNull(),
});
