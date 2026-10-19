// Drizzle schema for the LEADOS Intelligence Core (Part 3).
//
// Tables persist the durable artifacts of the reasoning system:
//  - beliefs: the unified probabilistic belief state (beliefFabric.ts)
//  - belief_observations: provenance trail of every update applied to a belief
//  - findings: fused, explainable findings surfaced to the UI (signalFusion.ts)
//  - calibration_runs: historical calibration/backtest reports (ruleCalibration.ts)
//  - rule_weights: current + proposed rule weights with guardrail metadata (autoCalibrate.ts)
//  - forecast_cache: evidence-keyed (not time-keyed) forecast cache (forecastCache.ts)
//  - scenarios: saved what-if simulations for comparison (scenarioEngine.ts)
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const beliefs = pgTable("beliefs", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  domain: text("domain").notNull(),
  // Beta distribution parameters backing the belief (see src/lib/intelligence/bayesian.ts)
  alpha: doublePrecision("alpha").notNull(),
  beta: doublePrecision("beta").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  contradictionCount: integer("contradiction_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const beliefObservations = pgTable("belief_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  beliefId: text("belief_id").notNull(),
  source: text("source").notNull(),
  evidenceType: text("evidence_type").notNull(),
  evidenceId: text("evidence_id").notNull(),
  successWeight: doublePrecision("success_weight").notNull(),
  failureWeight: doublePrecision("failure_weight").notNull(),
  wasContradiction: boolean("was_contradiction").notNull().default(false),
  priorMean: doublePrecision("prior_mean").notNull(),
  posteriorMean: doublePrecision("posterior_mean").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  rootCauseId: text("root_cause_id").notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  severity: integer("severity").notNull(),
  displayedSeverity: integer("displayed_severity").notNull(),
  status: text("status").notNull().default("active"),
  method: text("method").notNull(),
  explanation: jsonb("explanation").notNull(),
  suppressedCount: integer("suppressed_count").notNull().default(0),
  interruptEligible: boolean("interrupt_eligible").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calibrationRuns = pgTable("calibration_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  periodLabel: text("period_label").notNull(),
  brierScore: doublePrecision("brier_score").notNull(),
  expectedCalibrationError: doublePrecision("expected_calibration_error").notNull(),
  sampleSize: integer("sample_size").notNull(),
  reliabilityBins: jsonb("reliability_bins").notNull(),
  driftDetected: boolean("drift_detected").notNull().default(false),
  report: jsonb("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ruleWeights = pgTable("rule_weights", {
  ruleId: text("rule_id").primaryKey(),
  domain: text("domain").notNull(),
  weight: doublePrecision("weight").notNull(),
  proposedWeight: doublePrecision("proposed_weight"),
  proposalReason: text("proposal_reason"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecastCache = pgTable("forecast_cache", {
  cacheKey: text("cache_key").primaryKey(),
  subject: text("subject").notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  scenario: text("scenario").notNull().default("baseline"),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  interventions: jsonb("interventions").notNull(),
  result: jsonb("result").notNull(),
  causalChain: jsonb("causal_chain").notNull(),
  shareSlug: text("share_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
