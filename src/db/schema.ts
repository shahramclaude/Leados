// LEADOS — Part 54: Org Design Lab, M&A Deal Room, Human-Impact Ledger,
// Post-Mortem Bridge.
//
// Lineage (read-before-write, see AI-SESSION-LOG.md):
//  - Part 06 twin: org dynamics digital twin + model cards (error bars, limits)
//  - Part 09: people scoping / aggregate signals (talent-flight risk inputs)
//  - Part 31: ecosystem graph (cohesion, choke points, bus factor)
//  - Part 37: multi-entity model (deals span legal entities / counterparties)
//  - Part 53: obligation cascade (change-of-control triggers)
//
// This file is additive: it only introduces new tables for Part 54 and does
// not remove the starter's empty schema contract.

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Org twin — structure, people, ecosystem graph (Part 06 / Part 31)  */
/* ------------------------------------------------------------------ */

export const orgUnits = pgTable("od_org_units", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("team"), // team | department | division
  parentId: integer("parent_id"),
  headcount: integer("headcount").notNull().default(0),
  location: text("location").notNull().default("unspecified"),
  costCenter: text("cost_center").notNull().default("n/a"),
  cycleTimeDays: real("cycle_time_days").notNull().default(10),
  capacityUnits: real("capacity_units").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgPeople = pgTable("od_org_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unitId: integer("unit_id").notNull(),
  role: text("role").notNull(),
  title: text("title").notNull(),
  tenureMonths: integer("tenure_months").notNull().default(12),
  isManager: boolean("is_manager").notNull().default(false),
  uniqueSkill: boolean("unique_skill").notNull().default(false), // bus-factor flag
  flightRiskScore: real("flight_risk_score").notNull().default(0.2), // Part 09 aggregate signal placeholder
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Collaboration / ecosystem graph edges between units (Part 31 twin extension)
export const orgEdges = pgTable("od_org_edges", {
  id: serial("id").primaryKey(),
  fromUnitId: integer("from_unit_id").notNull(),
  toUnitId: integer("to_unit_id").notNull(),
  weight: real("weight").notNull().default(1), // collaboration intensity
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Twin model parameters + model card (honesty rules)                 */
/* ------------------------------------------------------------------ */

export const twinModelParameters = pgTable("od_twin_model_parameters", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  params: jsonb("params").notNull(), // scaling coefficients used by twinEngine
  errorMargins: jsonb("error_margins").notNull(), // declared +/- bands by dimension
  calibratedAt: timestamp("calibrated_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
});

/* ------------------------------------------------------------------ */
/* Structural moves + simulation runs                                 */
/* ------------------------------------------------------------------ */

export const structuralMoves = pgTable("od_structural_moves", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // merge | split | reporting_line_change | centralize | decentralize
  description: text("description").notNull(),
  payload: jsonb("payload").notNull(), // unit ids involved + parameters
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationRuns = pgTable("od_simulation_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // structural_move | scenario | deal
  moveId: integer("move_id"),
  dealId: integer("deal_id"),
  scenarioId: integer("scenario_id"),
  label: text("label").notNull().default(""),
  status: text("status").notNull().default("completed"),
  deliveryImpact: jsonb("delivery_impact").notNull(),
  networkImpact: jsonb("network_impact").notNull(),
  humanImpactSummary: jsonb("human_impact_summary").notNull(),
  modelParamsVersion: integer("model_params_version").notNull(),
  modelCard: jsonb("model_card").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Human-Impact Ledger (mandatory, never collapsed into one number)   */
/* ------------------------------------------------------------------ */

export const supportPlans = pgTable("od_support_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  resources: jsonb("resources").notNull(), // list of offered resources
});

export const humanImpactEntries = pgTable("od_human_impact_entries", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").notNull(),
  personId: integer("person_id").notNull(),
  unitId: integer("unit_id").notNull(),
  roleChangeType: text("role_change_type").notNull(), // none|title_change|manager_change|relocation|redundancy_risk|promotion|lateral_move
  disruptionClass: text("disruption_class").notNull(), // none|low|moderate|high|severe
  supportPlanId: integer("support_plan_id"),
  rationale: text("rationale").notNull().default(""),
  visibleToSelfAt: timestamp("visible_to_self_at", { withTimezone: true }).notNull().defaultNow(),
  announcedOrgWideAt: timestamp("announced_org_wide_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* M&A Deal Room (Part 37 multi-entity, Part 53 obligation cascade)   */
/* ------------------------------------------------------------------ */

export const maDeals = pgTable("od_ma_deals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetCompany: text("target_company").notNull(),
  phase: text("phase").notNull().default("diligence"), // diligence|announce|integrate|complete
  closeDate: timestamp("close_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const synergyEstimates = pgTable("od_synergy_estimates", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  category: text("category").notNull(), // cost | revenue | capability
  low: real("low").notNull(),
  mid: real("mid").notNull(),
  high: real("high").notNull(),
  confidence: real("confidence").notNull(),
  assumptions: jsonb("assumptions").notNull(),
  rationale: text("rationale").notNull(),
  method: text("method").notNull().default("twin-explain-v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Legal/contractual obligations carried over from Part 53's model,
// referenced here so change-of-control cascades can fire against them.
export const obligations = pgTable("od_obligations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // change_of_control | notice_period | vendor_contract | benefit_continuation
  counterparty: text("counterparty").notNull(),
  ownerUnitId: integer("owner_unit_id"),
  triggerCondition: text("trigger_condition").notNull(), // change_of_control | phase:announce | phase:integrate
  dealId: integer("deal_id"),
  status: text("status").notNull().default("dormant"), // dormant | triggered | fulfilled | breached
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obligationCascadeEvents = pgTable("od_obligation_cascade_events", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  obligationId: integer("obligation_id").notNull(),
  triggerType: text("trigger_type").notNull(),
  firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").notNull().default("triggered"), // triggered|acknowledged|resolved
  notes: text("notes").notNull().default(""),
});

export const integrationDifficultyScores = pgTable("od_integration_difficulty_scores", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  cultureDistance: real("culture_distance").notNull(),
  systemsOverlapPct: real("systems_overlap_pct").notNull(),
  talentFlightRisk: real("talent_flight_risk").notNull(),
  compositeLow: real("composite_low").notNull(),
  compositeMid: real("composite_mid").notNull(),
  compositeHigh: real("composite_high").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readinessChecklistItems = pgTable("od_readiness_checklist_items", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  phase: text("phase").notNull(), // diligence|announce|integrate
  item: text("item").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull().default("pending"), // pending|in_progress|done|blocked
  dueOffsetDays: integer("due_offset_days").notNull().default(0), // relative to close date
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Scenario comparison (wind-tunnel extension, Part 24)                */
/* ------------------------------------------------------------------ */

export const scenarios = pgTable("od_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  moveIds: jsonb("move_ids").notNull(), // int[]
  simulationRunId: integer("simulation_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Post-change tracking + recalibration loop (Part 39 counterfactual) */
/* ------------------------------------------------------------------ */

export const postChangeTracking = pgTable("od_post_change_tracking", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").notNull(),
  predicted: jsonb("predicted").notNull(),
  realized: jsonb("realized").notNull(),
  variance: jsonb("variance").notNull(),
  recalibrationApplied: boolean("recalibration_applied").notNull().default(false),
  newParamsVersion: integer("new_params_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Historical moves used for calibration validation (seeded ground    */
/* truth — synthetic, documented as such; never passed off as real)   */
/* ------------------------------------------------------------------ */

export const historicalMoves = pgTable(
  "od_historical_moves",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    actualCapacityChangePct: real("actual_capacity_change_pct").notNull(),
    actualCycleTimeChangeDays: real("actual_cycle_time_change_days").notNull(),
    actualCohesionChange: real("actual_cohesion_change").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    labelIdx: uniqueIndex("od_historical_moves_label_idx").on(t.label),
  }),
);
