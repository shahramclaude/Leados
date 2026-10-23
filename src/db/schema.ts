import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  date,
  jsonb,
  bigint,
} from "drizzle-orm/pg-core";

/* ============================================================================
 * LEADOS — Intelligence & Automation Core
 * World model · reasoning workbench · causal engine · strategy/OKR portfolio ·
 * next-best-action · governed automation ladder · tamper-evident audit log ·
 * eval/quality fabric.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// World model: metrics + observations + simulation runs (Part 59)
// ---------------------------------------------------------------------------
export const metrics = pgTable("metrics", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default(""),
  category: text("category").notNull().default("general"),
  direction: text("direction").notNull().default("neutral"), // 'up-good' | 'down-good' | 'neutral'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metricObservations = pgTable("metric_observations", {
  id: text("id").primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  value: doublePrecision("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationRuns = pgTable("simulation_runs", {
  id: text("id").primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  horizonPeriods: integer("horizon_periods").notNull(),
  n: integer("n").notNull(),
  seed: integer("seed").notNull(),
  interventionDelta: doublePrecision("intervention_delta").notNull().default(0),
  interventionFromPeriod: integer("intervention_from_period").notNull().default(0),
  assumptions: jsonb("assumptions").notNull().default([]),
  forbidden: boolean("forbidden").notNull().default(false),
  p10: jsonb("p10").notNull(),
  p50: jsonb("p50").notNull(),
  p90: jsonb("p90").notNull(),
  mean: jsonb("mean").notNull(),
  diagnostics: jsonb("diagnostics").notNull(),
  createdBy: text("created_by").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecastBacktests = pgTable("forecast_backtests", {
  id: text("id").primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  cutoffPeriod: date("cutoff_period").notNull(),
  horizonPeriods: integer("horizon_periods").notNull(),
  predictedP10: doublePrecision("predicted_p10").notNull(),
  predictedP50: doublePrecision("predicted_p50").notNull(),
  predictedP90: doublePrecision("predicted_p90").notNull(),
  actual: doublePrecision("actual"),
  covered80: boolean("covered_80"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Reasoning workbench: claims, evidence, arguments (Part 60)
// ---------------------------------------------------------------------------
export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // metric | document | experiment | expert | analogy
  sourceRef: text("source_ref").notNull(),
  reliability: doublePrecision("reliability").notNull().default(0.6),
  extract: text("extract").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  scope: text("scope").notNull(),
  kind: text("kind").notNull(), // descriptive | causal | normative | predictive
  polarity: text("polarity").notNull().default("supports"), // supports | opposes (relative to scope)
  confidence: doublePrecision("confidence").notNull(),
  authorId: text("author_id").notNull().default("system"),
  status: text("status").notNull().default("open"), // open | conflict | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimEvidence = pgTable("claim_evidence", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id, { onDelete: "cascade" }),
  evidenceId: text("evidence_id")
    .notNull()
    .references(() => evidence.id, { onDelete: "cascade" }),
});

export const argumentEdges = pgTable("argument_edges", {
  id: text("id").primaryKey(),
  fromClaimId: text("from_claim_id")
    .notNull()
    .references(() => claims.id, { onDelete: "cascade" }),
  toClaimId: text("to_claim_id")
    .notNull()
    .references(() => claims.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // datum | warrant | backing | qualifier | rebuttal
  strength: doublePrecision("strength").notNull().default(0.5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Causal discovery & root-cause (Part 61)
// ---------------------------------------------------------------------------
export const causalEdges = pgTable("causal_edges", {
  id: text("id").primaryKey(),
  fromMetricId: text("from_metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  toMetricId: text("to_metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  method: text("method").notNull(), // lagged-correlation | expert | intervention
  strength: doublePrecision("strength").notNull(),
  lagPeriods: integer("lag_periods").notNull().default(0),
  validated: text("validated").notNull().default("estimated"), // assumed | estimated | validated
  stable: boolean("stable").notNull().default(false),
  learnedAt: timestamp("learned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  periodStart: date("period_start").notNull(),
  magnitude: doublePrecision("magnitude").notNull(),
  direction: text("direction").notNull(), // up | down
  method: text("method").notNull().default("ewma"),
  status: text("status").notNull().default("open"), // open | explained | closed
  causes: jsonb("causes").notNull().default([]),
  testedHypothesis: boolean("tested_hypothesis").notNull().default(false),
  postmortem: jsonb("postmortem"),
});

// ---------------------------------------------------------------------------
// Strategy, OKR & portfolio engine (Part 62)
// ---------------------------------------------------------------------------
export const objectives = pgTable("objectives", {
  id: text("id").primaryKey(),
  statement: text("statement").notNull(),
  horizon: text("horizon").notNull().default("quarter"),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  baseline: doublePrecision("baseline").notNull(),
  target: doublePrecision("target").notNull(),
  confidence: doublePrecision("confidence").notNull().default(0.6),
  owner: text("owner").notNull().default("unassigned"),
  falsifiableBy: date("falsifiable_by").notNull(),
  ambitiousUnsupported: boolean("ambitious_unsupported").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const keyResults = pgTable("key_results", {
  id: text("id").primaryKey(),
  objectiveId: text("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fromVal: doublePrecision("from_val").notNull(),
  toVal: doublePrecision("to_val").notNull(),
  current: doublePrecision("current").notNull(),
  isCounterMetric: boolean("is_counter_metric").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const initiatives = pgTable("initiatives", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  keyResultId: text("key_result_id").references(() => keyResults.id, { onDelete: "set null" }),
  value: doublePrecision("value").notNull(),
  timeCriticality: doublePrecision("time_criticality").notNull(),
  riskReduction: doublePrecision("risk_reduction").notNull(),
  size: doublePrecision("size").notNull(), // team-weeks
  costUsd: doublePrecision("cost_usd").notNull(),
  headcount: doublePrecision("headcount").notNull().default(1),
  irreversible: boolean("irreversible").notNull().default(false),
  wsjfScore: doublePrecision("wsjf_score").notNull().default(0),
  status: text("status").notNull().default("proposed"), // proposed | selected | dropped
  droppedReason: text("dropped_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioConstraints = pgTable("portfolio_constraints", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // budget | headcount | capacity | deadline
  label: text("label").notNull(),
  limitValue: doublePrecision("limit_value").notNull(),
  hard: boolean("hard").notNull().default(true),
});

export const strategyMemos = pgTable("strategy_memos", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  chosenSummary: text("chosen_summary").notNull(),
  predictions: jsonb("predictions").notNull(), // [{metricId, byDate, threshold, direction}]
  regretTable: jsonb("regret_table").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Next-best-action & personalization brain (Part 64)
// ---------------------------------------------------------------------------
export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  surface: text("surface").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  expectedValue: doublePrecision("expected_value").notNull(),
  costAttention: doublePrecision("cost_attention").notNull(),
  riskTier: text("risk_tier").notNull().default("low"),
  armId: text("arm_id").notNull(),
  score: doublePrecision("score").notNull(),
  explored: boolean("explored").notNull().default(false),
  status: text("status").notNull().default("open"), // open | done | dismissed
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const banditArms = pgTable("bandit_arms", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  alpha: doublePrecision("alpha").notNull().default(1),
  beta: doublePrecision("beta").notNull().default(1),
  pulls: integer("pulls").notNull().default(0),
});

export const attentionLedger = pgTable("attention_ledger", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  periodDate: date("period_date").notNull(),
  spent: doublePrecision("spent").notNull().default(0),
  budget: doublePrecision("budget").notNull().default(6),
});

// ---------------------------------------------------------------------------
// Automation ladder & governed autonomy (Part 67)
// ---------------------------------------------------------------------------
export const actionPolicies = pgTable("action_policies", {
  id: text("id").primaryKey(),
  actionKey: text("action_key").notNull().unique(),
  label: text("label").notNull(),
  tier: text("tier").notNull(), // T0..T5
  budgetUsdPerDay: doublePrecision("budget_usd_per_day").notNull().default(0),
  budgetCountPerDay: integer("budget_count_per_day").notNull().default(0),
  approvalMode: text("approval_mode").notNull().default("none"), // none | single | dual
  approvalRoles: jsonb("approval_roles").notNull().default([]),
  undoWindowSec: integer("undo_window_sec").notNull().default(0),
  slaHours: doublePrecision("sla_hours").notNull().default(24),
  killSwitchOn: boolean("kill_switch_on").notNull().default(false),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  actionKey: text("action_key").notNull(),
  tier: text("tier").notNull(),
  preview: jsonb("preview").notNull(),
  voi: doublePrecision("voi").notNull().default(0.2),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | expired
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  reason: text("reason"),
});

export const promotionEvidence = pgTable("promotion_evidence", {
  id: text("id").primaryKey(),
  actionKey: text("action_key").notNull(),
  fromTier: text("from_tier").notNull(),
  toTier: text("to_tier").notNull(),
  sampleCount: integer("sample_count").notNull().default(0),
  requiredN: integer("required_n").notNull().default(20),
  measuredRisk: doublePrecision("measured_risk").notNull().default(0),
  riskCeiling: doublePrecision("risk_ceiling").notNull().default(0.05),
  boardSignoff: text("board_signoff"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Tamper-evident audit log (hash chain) (Part 73, light)
// ---------------------------------------------------------------------------
export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  actorKind: text("actor_kind").notNull(), // user | agent | system
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  payload: jsonb("payload").notNull().default({}),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Self-improving quality & eval fabric (Part 66)
// ---------------------------------------------------------------------------
export const evalSuites = pgTable("eval_suites", {
  id: text("id").primaryKey(),
  surface: text("surface").notNull(),
  name: text("name").notNull(),
  target: text("target").notNull().default("pipeline"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goldenExamples = pgTable("golden_examples", {
  id: text("id").primaryKey(),
  suiteId: text("suite_id")
    .notNull()
    .references(() => evalSuites.id, { onDelete: "cascade" }),
  input: jsonb("input").notNull(),
  expectMin: doublePrecision("expect_min"),
  expectMax: doublePrecision("expect_max"),
  forbiddenSubstrings: jsonb("forbidden_substrings").notNull().default([]),
  adversarial: boolean("adversarial").notNull().default(false),
});

export const evalRuns = pgTable("eval_runs", {
  id: text("id").primaryKey(),
  suiteId: text("suite_id")
    .notNull()
    .references(() => evalSuites.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  passCount: integer("pass_count").notNull(),
  totalCount: integer("total_count").notNull(),
  passRate: doublePrecision("pass_rate").notNull(),
  details: jsonb("details").notNull().default([]),
});

// ---------------------------------------------------------------------------
// Autonomous company runner: cadence loops (Part 74, light)
// ---------------------------------------------------------------------------
export const cadenceRuns = pgTable("cadence_runs", {
  id: text("id").primaryKey(),
  loopId: text("loop_id").notNull(), // daily-pulse | weekly-ops | monthly-review | quarterly-strategy
  cadence: text("cadence").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  verdict: text("verdict").notNull().default("complete"), // complete | degraded | stopped
  outputs: jsonb("outputs").notNull().default({}),
});

// ---------------------------------------------------------------------------
// Program gate: grand gate matrix (Part 75, light)
// ---------------------------------------------------------------------------
export const grandGates = pgTable("grand_gates", {
  id: text("id").primaryKey(),
  part: integer("part").notNull(),
  gateKey: text("gate_key").notNull().unique(),
  statement: text("statement").notNull(),
  accept: text("accept").notNull(),
  status: text("status").notNull().default("unknown"), // pass | fail | unknown | never-run
  measuredValue: text("measured_value"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
});
