// Part 44 — Collective Intelligence Engine
//
// This schema reconstructs the minimal compatible surface of:
//   Part 12 — Knowledge graph "registered questions/claims" (collectiveQuestions)
//   Part 13 — Forecasting tournament engine forecaster scoring (forecasters)
//   Part 24 — Registered-question governance (status/category on collectiveQuestions)
// The working tree handed to this session did not contain those parts' files, so
// stand-in tables are defined here with the same documented field contracts
// (calibration/Brier scores, question registration + status) so this module can
// interoperate once the real Part 12/13/24 tables land (see AI-SESSION-LOG.md).
//
// New in Part 44: judgment aggregation, Delphi engine, internal LMSR prediction
// market, and wisdom-of-the-crowd metrics.

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared: registered questions + forecaster roster (stand-ins for Part 12/13/24)
// ---------------------------------------------------------------------------

export const questionStatusEnum = pgEnum("ci_question_status", [
  "open",
  "delphi",
  "market",
  "resolved",
  "void",
]);

export const collectiveQuestions = pgTable("ci_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  questionClass: text("question_class").notNull().default("general"),
  status: questionStatusEnum("status").notNull().default("open"),
  // Resolution: null until resolved. 1 = true/yes outcome, 0 = false/no outcome.
  resolutionValue: numeric("resolution_value", { precision: 6, scale: 5 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // Snapshot of Part 11's ensemble model probability for crowd-vs-model comparison.
  modelProbability: numeric("model_probability", { precision: 6, scale: 5 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecasters = pgTable("ci_forecasters", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  anonymousTag: text("anonymous_tag").notNull(),
  // Authority flag used only to test market-manipulation-by-authority attack scenarios.
  isAuthoritySignal: boolean("is_authority_signal").notNull().default(false),
  // Part 13 forecaster scoring contract: calibration (0-1, higher = better calibrated)
  // and Brier score (0-1, lower = better). Updated by resolveQuestion scoring jobs.
  calibrationScore: numeric("calibration_score", { precision: 6, scale: 5 }).notNull().default("0.50000"),
  brierScore: numeric("brier_score", { precision: 6, scale: 5 }).notNull().default("0.25000"),
  forecastCount: integer("forecast_count").notNull().default(0),
  playMoneyBalance: numeric("play_money_balance", { precision: 14, scale: 2 }).notNull().default("1000.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  anonTagIdx: uniqueIndex("ci_forecasters_anon_tag_idx").on(table.anonymousTag),
}));

// ---------------------------------------------------------------------------
// Judgment aggregation
// ---------------------------------------------------------------------------

export const forecasts = pgTable("ci_forecasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  forecasterId: uuid("forecaster_id").notNull().references(() => forecasters.id, { onDelete: "cascade" }),
  probability: numeric("probability", { precision: 6, scale: 5 }).notNull(),
  rationale: text("rationale").notNull().default(""),
  // true when this forecast was flagged as a minority report at aggregation time.
  flaggedMinority: boolean("flagged_minority").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("ci_forecasts_question_idx").on(table.questionId),
  latestPerForecaster: uniqueIndex("ci_forecasts_q_f_unique").on(table.questionId, table.forecasterId),
}));

export const aggregates = pgTable("ci_aggregates", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  method: text("method").notNull(), // 'mean' | 'extremized' | 'calibration_weighted'
  value: numeric("value", { precision: 6, scale: 5 }).notNull(),
  params: jsonb("params").notNull().default({}),
  minorityReportIds: jsonb("minority_report_ids").notNull().default([]),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("ci_aggregates_question_idx").on(table.questionId),
}));

// ---------------------------------------------------------------------------
// Delphi engine
// ---------------------------------------------------------------------------

export const delphiRoundStatusEnum = pgEnum("ci_delphi_round_status", ["open", "closed"]);

export const delphiRounds = pgTable("ci_delphi_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  status: delphiRoundStatusEnum("status").notNull().default("open"),
  // Anonymity mode controls herding guards: 'anonymous_delayed' hides others' positions
  // until the round closes; 'open' shows them live (kept only for baseline simulation/A-B).
  anonymityMode: text("anonymity_mode").notNull().default("anonymous_delayed"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => ({
  questionIdx: index("ci_delphi_rounds_question_idx").on(table.questionId),
  roundUnique: uniqueIndex("ci_delphi_rounds_q_r_unique").on(table.questionId, table.roundNumber),
}));

export const delphiEstimates = pgTable("ci_delphi_estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => delphiRounds.id, { onDelete: "cascade" }),
  forecasterId: uuid("forecaster_id").notNull().references(() => forecasters.id, { onDelete: "cascade" }),
  estimate: numeric("estimate", { precision: 6, scale: 5 }).notNull(),
  rationale: text("rationale").notNull().default(""),
  // Dissent is never deleted even after convergence — preserved for the record.
  isDissent: boolean("is_dissent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  roundIdx: index("ci_delphi_estimates_round_idx").on(table.roundId),
  roundForecasterUnique: uniqueIndex("ci_delphi_estimates_r_f_unique").on(table.roundId, table.forecasterId),
}));

export const delphiConvergence = pgTable("ci_delphi_convergence", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  mean: numeric("mean", { precision: 6, scale: 5 }).notNull(),
  stdDev: numeric("std_dev", { precision: 6, scale: 5 }).notNull(),
  stdDevDelta: numeric("std_dev_delta", { precision: 6, scale: 5 }),
  dissentCount: integer("dissent_count").notNull().default(0),
  stopped: boolean("stopped").notNull().default(false),
  stopReason: text("stop_reason"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("ci_delphi_convergence_question_idx").on(table.questionId),
}));

// ---------------------------------------------------------------------------
// Internal play-money prediction market (LMSR)
// ---------------------------------------------------------------------------

export const marketMakers = pgTable("ci_market_makers", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  liquidityB: numeric("liquidity_b", { precision: 10, scale: 4 }).notNull().default("20.0000"),
  // LMSR quantities for the binary outcome pair [YES, NO].
  qYes: numeric("q_yes", { precision: 14, scale: 6 }).notNull().default("0"),
  qNo: numeric("q_no", { precision: 14, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionUnique: uniqueIndex("ci_market_makers_question_unique").on(table.questionId),
}));

export const marketTrades = pgTable("ci_market_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  traderId: uuid("trader_id").notNull().references(() => forecasters.id, { onDelete: "cascade" }),
  side: text("side").notNull(), // 'YES' | 'NO'
  shares: numeric("shares", { precision: 14, scale: 6 }).notNull(),
  cost: numeric("cost", { precision: 14, scale: 6 }).notNull(), // positive = debit, negative = credit (sell)
  priceBefore: numeric("price_before", { precision: 6, scale: 5 }).notNull(),
  priceAfter: numeric("price_after", { precision: 6, scale: 5 }).notNull(),
  flaggedWashTrade: boolean("flagged_wash_trade").notNull().default(false),
  flaggedPositionLimit: boolean("flagged_position_limit").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("ci_market_trades_question_idx").on(table.questionId),
  traderIdx: index("ci_market_trades_trader_idx").on(table.traderId),
}));

export const marketPositions = pgTable("ci_market_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  traderId: uuid("trader_id").notNull().references(() => forecasters.id, { onDelete: "cascade" }),
  yesShares: numeric("yes_shares", { precision: 14, scale: 6 }).notNull().default("0"),
  noShares: numeric("no_shares", { precision: 14, scale: 6 }).notNull().default("0"),
  netInvested: numeric("net_invested", { precision: 14, scale: 6 }).notNull().default("0"),
}, (table) => ({
  questionTraderUnique: uniqueIndex("ci_market_positions_q_t_unique").on(table.questionId, table.traderId),
}));

export const integrityFlags = pgTable("ci_integrity_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => collectiveQuestions.id, { onDelete: "cascade" }),
  traderId: uuid("trader_id").references(() => forecasters.id, { onDelete: "set null" }),
  type: text("type").notNull(), // 'wash_trade' | 'position_limit' | 'authority_pressure'
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("ci_integrity_flags_question_idx").on(table.questionId),
}));

// ---------------------------------------------------------------------------
// Wisdom-of-the-crowd metrics
// ---------------------------------------------------------------------------

export const wisdomStats = pgTable("ci_wisdom_stats", {
  id: serial("id").primaryKey(),
  questionClass: text("question_class").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  crowdBrier: numeric("crowd_brier", { precision: 6, scale: 5 }).notNull(),
  modelBrier: numeric("model_brier", { precision: 6, scale: 5 }).notNull(),
  marketBrier: numeric("market_brier", { precision: 6, scale: 5 }),
  diversityIndex: numeric("diversity_index", { precision: 6, scale: 5 }).notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  winner: text("winner").notNull(), // 'crowd' | 'model' | 'market' | 'tie'
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  classIdx: index("ci_wisdom_stats_class_idx").on(table.questionClass),
}));
