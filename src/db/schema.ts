// LEADOS — Part 10: Strategy & Finance core schema.
//
// NOTE ON REPO STATE: the sandbox checkout of shahramclaude/Leados available to
// this session contained only the bare Next.js/Drizzle starter (src/db/schema.ts
// was an empty placeholder; none of the Part 01-09 files listed in the standing
// order existed on disk). This schema therefore defines, from first principles,
// every table Part 10 needs AND minimal, explicitly-labelled tables that stand
// in for primitives earlier parts are assumed to own (Explain<T> provenance,
// calibration ledger, scheduler job log). See AI-SESSION-LOG.md for the full
// "files actually read" disclosure.
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* A. Assumption registry + driver-based financial model                      */
/* -------------------------------------------------------------------------- */

/** Every number the financial model uses is owned, justified, versioned here. */
export const assumptions = pgTable("assumptions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // e.g. "revenue_growth_rate_monthly"
  label: text("label").notNull(),
  category: text("category").notNull(), // hiring | ramp | comp_inflation | revenue_growth | churn | price | payment_terms | fx | other
  owner: text("owner").notNull(), // named human accountable for this input
  rationale: text("rationale").notNull(),
  unit: text("unit").notNull(), // "%", "$", "days", "headcount"
  low: numeric("low", { precision: 14, scale: 4 }).notNull(),
  base: numeric("base", { precision: 14, scale: 4 }).notNull(),
  high: numeric("high", { precision: 14, scale: 4 }).notNull(),
  version: integer("version").notNull().default(1),
  effectiveDate: date("effective_date").notNull(),
  supersedesId: integer("supersedes_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Raw ledger lines. Actuals AND simulated projections both live here, tagged by `source`. */
export const financialEvents = pgTable("financial_events", {
  id: serial("id").primaryKey(),
  eventDate: date("event_date").notNull(),
  category: text("category").notNull(), // revenue | cogs | salaries | opex_other | one_time | financing | tax
  subcategory: text("subcategory").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // inflow positive, outflow negative
  description: text("description").notNull().default(""),
  driverKey: text("driver_key"), // assumption key that generated this line, null for pure actuals
  source: text("source").notNull(), // "actual" | "projection" | "scenario:<id>"
  // Optional price/volume split — only populated for `category: "revenue"` rows,
  // enabling honest price-variance vs volume-variance decomposition (see causal.ts).
  units: numeric("units", { precision: 14, scale: 4 }),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Independent "ledger close" totals used purely as the reconciliation ground truth. */
export const reportedActuals = pgTable("reported_actuals", {
  id: serial("id").primaryKey(),
  periodMonth: date("period_month").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  note: text("note").notNull().default(""),
});

export const covenants = pgTable("covenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  metric: text("metric").notNull(), // "cash_runway_months" | "min_cash" | "burn_multiple"
  operator: text("operator").notNull(), // ">=" | "<="
  threshold: numeric("threshold", { precision: 14, scale: 4 }).notNull(),
  active: boolean("active").notNull().default(true),
});

/* -------------------------------------------------------------------------- */
/* B. OKR cascade                                                              */
/* -------------------------------------------------------------------------- */

export const okrObjectives = pgTable("okr_objectives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull(),
  period: text("period").notNull(), // "2026-Q1"
  weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const okrKeyResults = pgTable("okr_key_results", {
  id: serial("id").primaryKey(),
  objectiveId: integer("objective_id").notNull(),
  title: text("title").notNull(),
  metric: text("metric").notNull(),
  direction: text("direction").notNull().default("increase"), // increase | decrease
  startValue: numeric("start_value", { precision: 14, scale: 4 }).notNull(),
  targetValue: numeric("target_value", { precision: 14, scale: 4 }).notNull(),
  currentValue: numeric("current_value", { precision: 14, scale: 4 }).notNull(),
  unit: text("unit").notNull().default(""),
  weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
  selfReportedStatus: text("self_reported_status").notNull().default("green"), // green | yellow | red
  selfReportedConfidence: numeric("self_reported_confidence", { precision: 4, scale: 3 }).notNull().default("0.8"),
  ownerId: text("owner_id").notNull(),
  lastCheckIn: timestamp("last_check_in", { withTimezone: true }),
});

export const okrInitiatives = pgTable("okr_initiatives", {
  id: serial("id").primaryKey(),
  keyResultId: integer("key_result_id").notNull(),
  title: text("title").notNull(),
  weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
  projectId: integer("project_id"), // link to exec_projects, nullable (orphan detection)
});

/* -------------------------------------------------------------------------- */
/* C. Probabilistic execution                                                 */
/* -------------------------------------------------------------------------- */

export const execProjects = pgTable("exec_projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress | done | at_risk
  scopeChurnCount: integer("scope_churn_count").notNull().default(0),
  keyPersonRisk: numeric("key_person_risk", { precision: 4, scale: 3 }).notNull().default("0.2"),
  wipCount: integer("wip_count").notNull().default(1),
});

export const execMilestones = pgTable("exec_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  sequence: integer("sequence").notNull(),
  dependsOn: jsonb("depends_on").notNull().default([]), // array of milestone ids (within project)
  optimisticDays: numeric("optimistic_days", { precision: 8, scale: 2 }).notNull(),
  likelyDays: numeric("likely_days", { precision: 8, scale: 2 }).notNull(),
  pessimisticDays: numeric("pessimistic_days", { precision: 8, scale: 2 }).notNull(),
  plannedDate: date("planned_date").notNull(),
  actualDate: date("actual_date"),
  status: text("status").notNull().default("pending"), // pending | in_progress | done | blocked
});

export const execBlockers = pgTable("exec_blockers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  milestoneId: integer("milestone_id"),
  description: text("description").notNull(),
  raisedAt: date("raised_at").notNull(),
  resolvedAt: date("resolved_at"),
  impactDays: numeric("impact_days", { precision: 8, scale: 2 }).notNull().default("0"),
});

export const deliveryForecasts = pgTable("delivery_forecasts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  p50Date: date("p50_date").notNull(),
  p80Date: date("p80_date").notNull(),
  assumptions: jsonb("assumptions").notNull(),
  driverContributions: jsonb("driver_contributions").notNull(),
});

export const deliveryBacktests = pgTable("delivery_backtests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  forecastId: integer("forecast_id").notNull(),
  predictedP50: date("predicted_p50").notNull(),
  predictedP80: date("predicted_p80").notNull(),
  actualCompletionDate: date("actual_completion_date").notNull(),
  errorDaysP50: numeric("error_days_p50", { precision: 8, scale: 2 }).notNull(),
  withinP80: boolean("within_p80").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* D. Decision intelligence                                                   */
/* -------------------------------------------------------------------------- */

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context").notNull(),
  status: text("status").notNull().default("open"), // open | decided | retrospective_due | reviewed
  reversibility: text("reversibility").notNull(), // one-way-door | two-way-door
  ownerId: text("owner_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  reviewDate: date("review_date"),
  chosenOptionId: integer("chosen_option_id"),
  downsideAcknowledged: boolean("downside_acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisionOptions = pgTable("decision_options", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  scores: jsonb("scores").notNull().default({}), // { [criteriaId]: score(0-10) }
});

export const decisionCriteria = pgTable("decision_criteria", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  label: text("label").notNull(),
  weight: numeric("weight", { precision: 5, scale: 3 }).notNull(),
});

/** Scenario payoffs per option, used for EV-with-uncertainty (distribution, not point). */
export const decisionOutcomes = pgTable("decision_outcomes", {
  id: serial("id").primaryKey(),
  optionId: integer("option_id").notNull(),
  scenarioLabel: text("scenario_label").notNull(),
  probability: numeric("probability", { precision: 5, scale: 4 }).notNull(),
  payoffLow: numeric("payoff_low", { precision: 14, scale: 2 }).notNull(),
  payoffBase: numeric("payoff_base", { precision: 14, scale: 2 }).notNull(),
  payoffHigh: numeric("payoff_high", { precision: 14, scale: 2 }).notNull(),
});

export const decisionTreeNodes = pgTable("decision_tree_nodes", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  parentId: integer("parent_id"),
  nodeType: text("node_type").notNull(), // decision | chance | outcome
  label: text("label").notNull(),
  probability: numeric("probability", { precision: 5, scale: 4 }),
  payoff: numeric("payoff", { precision: 14, scale: 2 }),
});

export const decisionRetrospectives = pgTable("decision_retrospectives", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  dueAt: date("due_at").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  predicted: jsonb("predicted").notNull(),
  actual: jsonb("actual"),
  calibrationErrorNotes: text("calibration_error_notes").notNull().default(""),
  lessons: text("lessons").notNull().default(""),
});

/* -------------------------------------------------------------------------- */
/* E. Scenario & wargame studio                                               */
/* -------------------------------------------------------------------------- */

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // market | competitive | financial | delivery
  source: text("source").notNull(), // strategic | wargame
  probability: numeric("probability", { precision: 5, scale: 4 }).notNull(),
  driverDeltas: jsonb("driver_deltas").notNull().default({}), // { assumptionKey: deltaFraction }
  earlyWarningIndicatorIds: jsonb("early_warning_indicator_ids").notNull().default([]),
  linkedDecisionId: integer("linked_decision_id"),
  linkedObjectiveId: integer("linked_objective_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wargameMoves = pgTable("wargame_moves", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull(),
  round: integer("round").notNull(),
  actor: text("actor").notNull(), // "us" | rival name
  move: text("move").notNull(),
  ourResponse: text("our_response").notNull().default(""),
  impact: text("impact").notNull().default(""),
});

/* -------------------------------------------------------------------------- */
/* G. Early-warning indicators                                                */
/* -------------------------------------------------------------------------- */

export const indicators = pgTable("indicators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(), // market | delivery | people | financial
  metric: text("metric").notNull(),
  direction: text("direction").notNull(), // above_is_bad | below_is_bad
  threshold: numeric("threshold", { precision: 14, scale: 4 }).notNull(),
  unit: text("unit").notNull().default(""),
  currentValue: numeric("current_value", { precision: 14, scale: 4 }).notNull(),
  status: text("status").notNull().default("ok"), // ok | watch | breach
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
});

export const indicatorReadings = pgTable("indicator_readings", {
  id: serial("id").primaryKey(),
  indicatorId: integer("indicator_id").notNull(),
  date: date("date").notNull(),
  value: numeric("value", { precision: 14, scale: 4 }).notNull(),
});

/* -------------------------------------------------------------------------- */
/* Part 04 stand-in: calibration ledger (predicted vs actual, feeds Explain<T>) */
/* -------------------------------------------------------------------------- */

export const calibrationRecords = pgTable("calibration_records", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(), // delivery | decision | financial
  refType: text("ref_type").notNull(),
  refId: integer("ref_id").notNull(),
  predictedP50: text("predicted_p50").notNull(),
  predictedDistribution: jsonb("predicted_distribution").notNull(),
  actualValue: text("actual_value").notNull(),
  actualDate: date("actual_date").notNull(),
  errorValue: numeric("error_value", { precision: 14, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* F. Board pack archive (determinism evidence)                               */
/* -------------------------------------------------------------------------- */

export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  periodLabel: text("period_label").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  payload: jsonb("payload").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Part 07 stand-in: scheduler job log                                        */
/* -------------------------------------------------------------------------- */

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(), // ok | error
  detail: jsonb("detail").notNull().default({}),
});
