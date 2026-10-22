// Part 13 — Sensing & Forecasting schema.
//
// Tables here support: metric series + points (sensing substrate), anomaly
// alerts (explainable per-series detections), weak-signal radar (free text
// -> themes), a forecasting tournament (questions carried over from Part
// 12's hypotheses, forecasts, proper-scoring results), the leading-indicator
// framework (risk register -> indicators -> findings), and the generated
// morning briefs (zero-filler, citation-bearing).
//
// Parts 01/04/05/12 are assumed upstream (metric projections, risk register,
// hypothesis store). Those tables are not present in this sandbox checkout,
// so minimal compatible versions are (re)declared here with a comment market
// `-- part13-local-stub --` wherever we are standing in for an earlier part's
// table rather than duplicating it. When this file is merged into the real
// Leados repo, de-duplicate against the authoritative Part 01/04/05/12
// schema and keep the Part 13 additions (anomalyAlerts onward).

import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Sensing substrate (Part 01 projections) -- part13-local-stub --
// ---------------------------------------------------------------------------

export const metricSeries = pgTable("metric_series", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default(""),
  // If set, the series is treated as seasonal with this period (in points).
  seasonalPeriod: integer("seasonal_period"),
  // If true, robust (MAD-based) statistics are preferred over EWMA because
  // the series is known to have heavy-tailed / non-Gaussian noise.
  heavyTailed: boolean("heavy_tailed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  keyIdx: uniqueIndex("metric_series_key_idx").on(t.key),
}));

export const metricPoints = pgTable("metric_points", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => metricSeries.id, { onDelete: "cascade" }),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  value: real("value").notNull(),
}, (t) => ({
  seriesTsIdx: index("metric_points_series_ts_idx").on(t.seriesId, t.ts),
}));

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

export const anomalyAlerts = pgTable("anomaly_alerts", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => metricSeries.id, { onDelete: "cascade" }),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  method: text("method").notNull(), // 'ewma' | 'robust_z' | 'seasonal_ewma'
  observed: real("observed").notNull(),
  expectedLow: real("expected_low").notNull(),
  expectedHigh: real("expected_high").notNull(),
  deviation: real("deviation").notNull(), // z / sigma units from the method's own statistic
  falsePositiveEstimate: real("false_positive_estimate").notNull(),
  likelyCauses: jsonb("likely_causes").$type<string[]>().notNull().default([]),
  severity: text("severity").notNull(), // 'low' | 'medium' | 'high'
  status: text("status").notNull().default("open"), // 'open' | 'muted' | 'resolved'
  muteReason: text("mute_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seriesTsIdx: index("anomaly_alerts_series_ts_idx").on(t.seriesId, t.ts),
}));

// ---------------------------------------------------------------------------
// Weak-signal radar
// ---------------------------------------------------------------------------

export const signalItems = pgTable("signal_items", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  source: text("source").notNull().default("unknown"),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weakSignalThemes = pgTable("weak_signal_themes", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  ngram: text("ngram").notNull(),
  status: text("status").notNull().default("signal"), // 'signal' | 'trend'
  evidenceCount: integer("evidence_count").notNull().default(0),
  velocity: real("velocity").notNull().default(0),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  persistenceDays: integer("persistence_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ngramIdx: uniqueIndex("weak_signal_themes_ngram_idx").on(t.ngram),
}));

export const weakSignalThemeItems = pgTable("weak_signal_theme_items", {
  id: serial("id").primaryKey(),
  themeId: integer("theme_id").notNull().references(() => weakSignalThemes.id, { onDelete: "cascade" }),
  signalItemId: integer("signal_item_id").notNull().references(() => signalItems.id, { onDelete: "cascade" }),
  score: real("score").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Forecasting tournament (questions sourced from Part 12 hypotheses)
// -- part13-local-stub -- for the `hypotheses` table.
// ---------------------------------------------------------------------------

export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecastQuestions = pgTable("forecast_questions", {
  id: serial("id").primaryKey(),
  hypothesisId: integer("hypothesis_id").references(() => hypotheses.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  resolveBy: timestamp("resolve_by", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'resolved'
  resolutionValue: boolean("resolution_value"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecasts = pgTable("forecasts", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => forecastQuestions.id, { onDelete: "cascade" }),
  forecaster: text("forecaster").notNull(),
  isModel: boolean("is_model").notNull().default(false),
  probability: real("probability").notNull(), // clamped to [0.02, 0.98] at write time
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  questionIdx: index("forecasts_question_idx").on(t.questionId),
}));

export const forecastScores = pgTable("forecast_scores", {
  id: serial("id").primaryKey(),
  forecastId: integer("forecast_id").notNull().references(() => forecasts.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => forecastQuestions.id, { onDelete: "cascade" }),
  forecaster: text("forecaster").notNull(),
  brier: real("brier").notNull(),
  logLoss: real("log_loss").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Leading-indicator framework (risk register from Part 04/05)
// -- part13-local-stub -- for `risk_register`.
// ---------------------------------------------------------------------------

export const riskRegister = pgTable("risk_register", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadingIndicators = pgTable("leading_indicators", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").notNull().references(() => riskRegister.id, { onDelete: "cascade" }),
  seriesId: integer("series_id").notNull().references(() => metricSeries.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // 'above' | 'below'
  thresholdValue: real("threshold_value").notNull(),
  status: text("status").notNull().default("armed"), // 'armed' | 'breached' | 'disarmed'
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Findings + notification seam (Part 10 / Part 14)
// ---------------------------------------------------------------------------

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // 'anomaly' | 'indicator_breach' | 'weak_signal'
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  relatedType: text("related_type"),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Part 14 seam stub: this is a deliberately inert placeholder. Nothing is
// actually sent anywhere; `status` stays 'queued_stub' so downstream code and
// reviewers can tell this was never wired to a real channel.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  findingId: integer("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("stub"),
  status: text("status").notNull().default("queued_stub"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Morning brief
// ---------------------------------------------------------------------------

export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  briefDate: date("brief_date").notNull(),
  content: text("content").notNull(),
  citationsCount: integer("citations_count").notNull().default(0),
  lintPassed: boolean("lint_passed").notNull().default(false),
  lintErrors: jsonb("lint_errors").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dateIdx: uniqueIndex("briefs_brief_date_idx").on(t.briefDate),
}));
