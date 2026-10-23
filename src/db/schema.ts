// LEADOS — Strategic Frontier & AI-Native Organization
// Schema covering: Innovation, Brand, Partnerships, M&A, Regulatory, Executive Team,
// Negotiation, Succession, Digital Coworkers, Self-Evolving Architecture, Management
// Rituals, Enterprise Deployment, Formal Methods, Value Realization, Methodology
// Research, and the Capstone Charter.
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* 108 — Innovation & R&D portfolio                                    */
/* ------------------------------------------------------------------ */
export const ideas = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("incremental"), // incremental | adjacent | transformational
  thesis: text("thesis").notNull(),
  stage: text("stage").notNull().default("ideate"), // ideate|discover|validate|build|scale|killed|graduated
  trl: integer("trl").notNull().default(1),
  costToDateUsd: numeric("cost_to_date_usd").notNull().default("0"),
  remainingCostUsd: numeric("remaining_cost_usd").notNull().default("0"),
  npvUsd: numeric("npv_usd").notNull().default("0"),
  probTechnical: numeric("prob_technical").notNull().default("0.5"),
  probCommercial: numeric("prob_commercial").notNull().default("0.5"),
  killMetric: text("kill_metric"),
  killThreshold: text("kill_threshold"),
  killByDate: text("kill_by_date"),
  killRationale: text("kill_rationale"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 109 — Brand & reputation intelligence                                */
/* ------------------------------------------------------------------ */
export const mediaItems = pgTable("media_items", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sourceReliability: numeric("source_reliability").notNull().default("0.5"),
  reach: integer("reach").notNull().default(0),
  sentiment: numeric("sentiment").notNull().default("0"), // -1..1
  topics: text("topics").notNull().default(""),
  verified: text("verified").notNull().default("unverified"), // primary|secondary|unverified
  mentionsUs: boolean("mentions_us").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const brandHealth = pgTable("brand_health", {
  id: serial("id").primaryKey(),
  metric: text("metric").notNull(), // awareness|consideration|preference|trust|nps
  segment: text("segment").notNull().default("overall"),
  value: numeric("value").notNull(),
  method: text("method").notNull().default("survey"), // survey|social-listening|search-share|panel
  sampleSize: integer("sample_size").notNull().default(0),
  ciLow: numeric("ci_low"),
  ciHigh: numeric("ci_high"),
  trend: text("trend").notNull().default("flat"), // up|flat|down
  measuredAt: timestamp("measured_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 110 — Partnerships, BD & ecosystem strategy                          */
/* ------------------------------------------------------------------ */
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("channel"), // channel|tech|strategic|supplier
  jointValueThesis: text("joint_value_thesis").notNull(),
  sourcedRevenueUsd: numeric("sourced_revenue_usd").notNull().default("0"),
  influencedRevenueUsd: numeric("influenced_revenue_usd").notNull().default("0"),
  enablementCostUsd: numeric("enablement_cost_usd").notNull().default("0"),
  healthScore: numeric("health_score").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channelEconomics = pgTable("channel_economics", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => partners.id),
  channel: text("channel").notNull(),
  cac: numeric("cac").notNull().default("0"),
  ltv: numeric("ltv").notNull().default("0"),
  paybackMonths: numeric("payback_months").notNull().default("0"),
  cannibalizationFactor: numeric("cannibalization_factor").notNull().default("0"),
  attributionMethod: text("attribution_method").notNull().default("first-touch"),
  honesty: text("honesty").notNull().default("modeled"), // measured|modeled
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 111 — M&A integration execution                                      */
/* ------------------------------------------------------------------ */
export const integrationPlans = pgTable("integration_plans", {
  id: serial("id").primaryKey(),
  dealName: text("deal_name").notNull(),
  archetype: text("archetype").notNull().default("tuck-in"), // tuck-in|merger-of-equals-lite|carve-out
  day1ChecklistTotal: integer("day1_checklist_total").notNull().default(0),
  day1ChecklistDone: integer("day1_checklist_done").notNull().default(0),
  rollbackPlan: text("rollback_plan").notNull().default(""),
  status: text("status").notNull().default("planning"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const synergyItems = pgTable("synergy_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => integrationPlans.id),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("cost"), // revenue|cost|capital
  plannedRunRateUsd: numeric("planned_run_rate_usd").notNull().default("0"),
  achievedRunRateUsd: numeric("achieved_run_rate_usd").notNull().default("0"),
  oneTimeCostsUsd: numeric("one_time_costs_usd").notNull().default("0"),
  financeVerified: boolean("finance_verified").notNull().default(false),
  confidence: numeric("confidence").notNull().default("0.5"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 112 — Regulatory affairs & public policy intelligence                */
/* ------------------------------------------------------------------ */
export const regulatoryItems = pgTable("regulatory_items", {
  id: serial("id").primaryKey(),
  jurisdiction: text("jurisdiction").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("proposed"), // proposed|consultation|enacted|effective
  evidenceClass: text("evidence_class").notNull().default("reputable-press"),
  probability: numeric("probability").notNull().default("0.5"),
  impactUsd: numeric("impact_usd").notNull().default("0"),
  proximityDays: integer("proximity_days").notNull().default(365),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const obligations = pgTable("obligations", {
  id: serial("id").primaryKey(),
  regulatoryItemId: integer("regulatory_item_id").references(() => regulatoryItems.id),
  clause: text("clause").notNull(),
  controlRefs: text("control_refs").notNull().default(""),
  status: text("status").notNull().default("gap"), // covered|partial|gap
  owner: text("owner").notNull().default("unassigned"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 113 — Executive team effectiveness                                   */
/* ------------------------------------------------------------------ */
export const teamDiagnostics = pgTable("team_diagnostics", {
  id: serial("id").primaryKey(),
  teamName: text("team_name").notNull(),
  dimension: text("dimension").notNull(), // decision-quality|info-sharing|conflict|commitment|accountability|learning
  score: numeric("score").notNull(),
  method: text("method").notNull().default("consent-survey"),
  sampleSizeN: integer("sample_size_n").notNull(),
  ciLow: numeric("ci_low"),
  ciHigh: numeric("ci_high"),
  measuredAt: timestamp("measured_at").notNull().defaultNow(),
});

export const decisionScorecards = pgTable("decision_scorecards", {
  id: serial("id").primaryKey(),
  decisionTitle: text("decision_title").notNull(),
  optionsConsidered: integer("options_considered").notNull().default(0),
  dissentSought: boolean("dissent_sought").notNull().default(false),
  assumptionsLabeled: boolean("assumptions_labeled").notNull().default(false),
  predictionsMade: boolean("predictions_made").notNull().default(false),
  reviewScheduled: boolean("review_scheduled").notNull().default(false),
  outcomeScored: boolean("outcome_scored").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 114 — Negotiation & stakeholder strategy workbench                   */
/* ------------------------------------------------------------------ */
export const negotiationCases = pgTable("negotiation_cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  counterpartyName: text("counterparty_name").notNull(),
  ourInterests: text("our_interests").notNull().default(""),
  theirInterests: text("their_interests").notNull().default(""),
  ourReservation: numeric("our_reservation").notNull(),
  ourTarget: numeric("our_target").notNull(),
  theirReservationEstimate: numeric("their_reservation_estimate"),
  batnaEvidence: text("batna_evidence").default(""),
  currency: text("currency").notNull().default("USD"),
  deadline: text("deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 115 — Succession & leadership pipeline                                */
/* ------------------------------------------------------------------ */
export const benchRoles = pgTable("bench_roles", {
  id: serial("id").primaryKey(),
  roleTitle: text("role_title").notNull(),
  critical: boolean("critical").notNull().default(true),
  coverageStatus: text("coverage_status").notNull().default("gap"), // covered|thin|gap
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const successors = pgTable("successors", {
  id: serial("id").primaryKey(),
  benchRoleId: integer("bench_role_id").references(() => benchRoles.id),
  personName: text("person_name").notNull(),
  readiness: text("readiness").notNull().default("ready-3yr+"), // ready-now|ready-1yr|ready-2yr|ready-3yr+
  evidenceNotes: text("evidence_notes").default(""),
  developmentGaps: text("development_gaps").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 116 — Digital coworkers (supervised agent teams)                     */
/* ------------------------------------------------------------------ */
export const agentRoles = pgTable("agent_roles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  responsibilities: text("responsibilities").notNull().default(""),
  forbidden: text("forbidden").notNull().default(""),
  riskCeiling: text("risk_ceiling").notNull().default("T1"), // T0..T2 only
  humanAccountable: text("human_accountable").notNull(), // always a person
  evalSuiteId: text("eval_suite_id").notNull().default(""),
  supervisionSlaHours: numeric("supervision_sla_hours").notNull().default("24"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const delegations = pgTable("delegations", {
  id: serial("id").primaryKey(),
  agentRoleId: integer("agent_role_id").references(() => agentRoles.id),
  fromPerson: text("from_person").notNull(),
  task: text("task").notNull(),
  budgetUsd: numeric("budget_usd").notNull().default("0"),
  windowLabel: text("window_label").notNull().default(""),
  grantedTools: text("granted_tools").notNull().default(""),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 117 — Self-evolving architecture                                      */
/* ------------------------------------------------------------------ */
export const fitnessFunctions = pgTable("fitness_functions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("structure"),
  measure: text("measure").notNull(),
  threshold: numeric("threshold").notNull(),
  direction: text("direction").notNull().default("max"), // max|min
  enforcement: text("enforcement").notNull().default("ratchet"), // block|ratchet|warn
  currentValue: numeric("current_value").notNull(),
  bestValue: numeric("best_value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const debtItems = pgTable("debt_items", {
  id: serial("id").primaryKey(),
  className: text("class_name").notNull(),
  surface: text("surface").notNull(),
  interestPerWeek: numeric("interest_per_week").notNull().default("0"),
  principal: numeric("principal").notNull().default("1"),
  exitCriteria: text("exit_criteria").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 118 — Management system on a loop                                     */
/* ------------------------------------------------------------------ */
export const rituals = pgTable("rituals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cadence: text("cadence").notNull().default("weekly"), // daily|weekly|monthly|quarterly|annual
  owner: text("owner").notNull(),
  humanMinutesBudget: numeric("human_minutes_budget").notNull().default("60"),
  lastRunAt: timestamp("last_run_at"),
  onTimeRate: numeric("on_time_rate").notNull().default("1"),
  outputQuality: numeric("output_quality").notNull().default("4"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull().default("draft"), // draft|testing|adopted|review-due|sunset|retired
  adoptedAt: timestamp("adopted_at"),
  reviewEveryDays: integer("review_every_days").notNull().default(90),
  evidenceOfEffect: text("evidence_of_effect").default(""),
  sunsetTrigger: text("sunset_trigger").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 119 — Enterprise deployment & multi-tenant scale                      */
/* ------------------------------------------------------------------ */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isolation: text("isolation").notNull().default("row-level"), // row-level|schema|database
  usersLimit: integer("users_limit").notNull().default(100),
  storageGbLimit: integer("storage_gb_limit").notNull().default(50),
  agentRunsPerDayLimit: integer("agent_runs_per_day_limit").notNull().default(1000),
  dataResidency: text("data_residency").notNull().default("us"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolloutWaves = pgTable("rollout_waves", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  waveNumber: integer("wave_number").notNull().default(1),
  cohortName: text("cohort_name").notNull(),
  users: integer("users").notNull().default(0),
  dataReady: boolean("data_ready").notNull().default(false),
  trained: boolean("trained").notNull().default(false),
  pilotPassed: boolean("pilot_passed").notNull().default(false),
  rollbackReady: boolean("rollback_ready").notNull().default(false),
  adoptionPct: numeric("adoption_pct").notNull().default("0"),
  status: text("status").notNull().default("planned"), // planned|active|complete|blocked
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 120 — Formal methods for management processes                        */
/* ------------------------------------------------------------------ */
export const processSpecs = pgTable("process_specs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  statesList: text("states_list").notNull().default(""), // comma-separated state names
  transitions: text("transitions").notNull().default(""), // "from>to;from>to"
  invariants: text("invariants").notNull().default(""), // comma-separated forbidden-state substrings
  maxBoundedStates: integer("max_bounded_states").notNull().default(5000),
  lastCheckedAt: timestamp("last_checked_at"),
  verdict: text("verdict").notNull().default("inconclusive-bound"), // verified|violated|inconclusive-bound
  statesExplored: integer("states_explored").notNull().default(0),
  counterexamples: text("counterexamples").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 121 — Value realization & ROI proof                                    */
/* ------------------------------------------------------------------ */
export const valueHypotheses = pgTable("value_hypotheses", {
  id: serial("id").primaryKey(),
  capability: text("capability").notNull(),
  beneficiary: text("beneficiary").notNull(),
  mechanism: text("mechanism").notNull(),
  metricName: text("metric_name").notNull(),
  baseline: numeric("baseline").notNull().default("0"),
  target: numeric("target").notNull().default("0"),
  method: text("method").notNull().default("self-report"), // rct|diff-in-diff|matched-pairs|time-series|self-report
  status: text("status").notNull().default("hypothesized"), // hypothesized|measuring|validated|refuted|unknown
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benefitRealizations = pgTable("benefit_realizations", {
  id: serial("id").primaryKey(),
  hypothesisId: integer("hypothesis_id").references(() => valueHypotheses.id),
  measured: numeric("measured").notNull(),
  ciLow: numeric("ci_low"),
  ciHigh: numeric("ci_high"),
  realizedValueUsd: numeric("realized_value_usd").notNull().default("0"),
  confidence: text("confidence").notNull().default("self-reported"), // causal|associational|self-reported
  measuredAt: timestamp("measured_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 122 — Continuous methodology research layer                           */
/* ------------------------------------------------------------------ */
export const methodCandidates = pgTable("method_candidates", {
  id: serial("id").primaryKey(),
  targetEngine: text("target_engine").notNull(),
  currentName: text("current_name").notNull(),
  currentEvalScore: numeric("current_eval_score").notNull().default("0"),
  proposedName: text("proposed_name").notNull(),
  proposedEvalScore: numeric("proposed_eval_score"),
  evidenceGrade: text("evidence_grade").notNull().default("practitioner"), // peer-reviewed|preprint|practitioner|anecdotal
  decision: text("decision").notNull().default("pilot"), // pilot|reject|adopt|defer
  rationale: text("rationale").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 123 — Capstone V: the living program gate                              */
/* ------------------------------------------------------------------ */
export const charterStatements = pgTable("charter_statements", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  statementClass: text("statement_class").notNull().default("does"), // does|never-does
  enforcementRef: text("enforcement_ref").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
