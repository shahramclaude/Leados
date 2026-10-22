// src/lib/twin/types.ts
//
// Shared types for the LEADOS organisational digital twin.
//
// IMPORTANT — honesty contract: every value produced by this subsystem is a
// MODEL ESTIMATE derived from a synthetic generative model. Nothing here is
// an observation of a real organisation. Types are named plainly so callers
// cannot accidentally present a `WeeklyMetrics` as ground truth.

export type Skill =
  | "delivery"
  | "strategy"
  | "coaching"
  | "dataAnalysis"
  | "stakeholderMgmt"
  | "technical";

export const ALL_SKILLS: Skill[] = [
  "delivery",
  "strategy",
  "coaching",
  "dataAnalysis",
  "stakeholderMgmt",
  "technical",
];

export interface AgentState {
  personId: string;
  skills: Record<Skill, number>; // 0..1 proficiency level
  capacityHrs: number; // nominal focus hours/week available for initiative work
  focusLoad: number; // 0..1 fraction of capacity already committed to BAU
  fatigue: number; // 0..1, higher = more depleted
  motivation: number; // 0..1, higher = more engaged
  tenureYears: number;
  teamId: string;
  active: boolean; // false once departed (attrition / key-person loss)
  influenceScore: number; // 0..1 static centrality proxy, used by network.ts
}

export type WorkItemStatus = "queued" | "active" | "done" | "dropped";

export interface WorkItem {
  id: string;
  arrivalWeek: number;
  effortHrsEstimate: number; // drawn from log-normal
  effortHrsRemaining: number;
  requiredSkill: Skill;
  priority: number; // lower = higher priority
  status: WorkItemStatus;
  startWeek: number | null;
  completeWeek: number | null;
}

export interface NetworkEdge {
  from: string; // personId
  to: string; // personId
  weight: number; // p_uv in [0,1], independent-cascade activation probability
}

export type QueueDiscipline = "fifo" | "priority";

export type ShockType =
  | "attritionSpike"
  | "demandSurge"
  | "keyPersonLoss"
  | "budgetCut"
  | "qualityIncident";

export interface ShockEventBase {
  type: ShockType;
  weekApplied: number;
  label?: string;
}

export interface AttritionSpikeShock extends ShockEventBase {
  type: "attritionSpike";
  extraDeparturesFraction: number; // 0..1 of active agents who leave that week
}

export interface DemandSurgeShock extends ShockEventBase {
  type: "demandSurge";
  arrivalMultiplier: number; // multiplies lambda for `durationWeeks`
  durationWeeks: number;
}

export interface KeyPersonLossShock extends ShockEventBase {
  type: "keyPersonLoss";
  // if personId omitted, the highest-influence active agent is selected
  personId?: string;
}

export interface BudgetCutShock extends ShockEventBase {
  type: "budgetCut";
  wipLimitReduction: number; // absolute reduction in concurrent WIP slots
  capacityReductionFraction: number; // 0..1 reduction in per-agent capacity
}

export interface QualityIncidentShock extends ShockEventBase {
  type: "qualityIncident";
  reworkItems: number; // number of synthetic rework items injected
  moraleHitFraction: number; // 0..1 flat motivation reduction org-wide
}

export type ShockEvent =
  | AttritionSpikeShock
  | DemandSurgeShock
  | KeyPersonLossShock
  | BudgetCutShock
  | QualityIncidentShock;

/** Form-shaped scenario input as authored in the Simulation Lab UI (no code). */
export interface ScenarioInput {
  name: string;
  horizonWeeks: number;
  orgSize: number;
  teamCount: number;
  arrivalRateLambda: number; // initiatives/week, Poisson
  effortMeanHrs: number; // mean of log-normal effort distribution
  effortSpread: number; // sigma of log-normal (shape), >0
  wipLimit: number;
  queueDiscipline: QueueDiscipline;
  headcountDeltaFraction: number; // e.g. +0.1 = hire 10% more, -0.1 = cut 10%
  headcountChangeWeek: number;
  demandMultiplier: number; // sustained multiplier on arrival lambda from week 1
  costPerHeadWeek: number; // $ fully loaded cost per person per week
  costPerEffortHr: number; // $ cost per hour of initiative effort delivered
  valuePerEffortHr: number; // $ expected value per hour of initiative effort delivered (Part 04 belief EV)
  shocks: ShockEvent[];
  ensembleRuns: number;
  seedBase: number;
}

/** Fully resolved scenario used internally by the engine. */
export interface ScenarioDefinition extends ScenarioInput {
  scenarioHash: string;
}

export interface OrgTwinState {
  week: number;
  agents: AgentState[];
  network: NetworkEdge[];
  backlog: WorkItem[];
  activeInfluenced: Set<string>;
  cascadeFrontier: Set<string>;
  nextItemSeq: number;
  wipLimitOverride: number | null;
  capacityMultiplierOverride: number;
  arrivalMultiplierOverride: number;
  arrivalMultiplierExpiresWeek: number | null;
}

export interface WeeklyMetrics {
  week: number;
  arrivalsThisWeek: number;
  completedThisWeek: number;
  backlogLength: number; // L component: items queued+active at week end
  avgSojournWeeksCompleted: number | null; // mean (completeWeek-arrivalWeek+1) for items done this week
  avgFatigue: number;
  avgMotivation: number;
  activeHeadcount: number;
  cascadeActivatedFraction: number;
  headcountCostThisWeek: number;
  initiativeCostThisWeek: number;
  expectedValueThisWeek: number;
  netValueThisWeek: number;
  cumulativeNetValue: number;
  shockApplied: ShockType | null;
}

export interface SimulationRunResult {
  runId: string;
  seed: number;
  antithetic: boolean;
  weeks: WeeklyMetrics[];
  totalArrivals: number; // used as the control-variate instrument
}

export interface PercentileSeriesPoint {
  week: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export type MetricKey =
  | "backlogLength"
  | "completedThisWeek"
  | "cascadeActivatedFraction"
  | "avgFatigue"
  | "avgMotivation"
  | "netValueThisWeek"
  | "cumulativeNetValue"
  | "activeHeadcount";

export interface EnsembleResult {
  scenarioHash: string;
  modelVersion: string;
  seedBase: number;
  runsRequested: number;
  runsCompleted: number;
  antitheticPairs: boolean;
  controlVariateApplied: boolean;
  controlVariateMetric: string | null;
  durationMs: number;
  bands: Record<MetricKey, PercentileSeriesPoint[]>;
  finalValues: Record<MetricKey, number[]>; // raw per-run final-week values, used by attribution
  cancelled: boolean;
  controlVariateDiagnostics: ControlVariateDiagnostics | null;
  antitheticDiagnostics: AntitheticDiagnostics | null;
}

export interface ControlVariateDiagnostics {
  metric: MetricKey;
  instrument: "totalArrivals";
  rawMean: number;
  rawStdErr: number;
  adjustedMean: number;
  adjustedStdErr: number;
  varianceReductionPct: number;
}

export interface AntitheticDiagnostics {
  metric: MetricKey;
  pairs: number;
  independentStdErr: number; // std err treating every run as independent
  pairedStdErr: number; // std err of the mean using paired-average estimator
  varianceReductionPct: number;
}

export interface FactorSpec {
  key: string;
  label: string;
  baselineValue: ScenarioInput;
  interventionValue: ScenarioInput;
  apply: (scenario: ScenarioInput, useIntervention: boolean) => ScenarioInput;
}

export interface AttributionContribution {
  factorKey: string;
  factorLabel: string;
  oatEffect: number; // one-at-a-time delta vs baseline
  shapleyEffect: number; // Shapley value (sums exactly to total effect)
}

export interface AttributionResult {
  metric: MetricKey;
  totalEffect: number; // val(allIntervention) - val(allBaseline)
  sumOfShapley: number;
  sumErrorPct: number;
  contributions: AttributionContribution[];
  coalitionsEvaluated: number;
  runsPerCoalition: number;
}

export interface BacktestCase {
  caseId: string;
  groundTruthSeed: number;
  predictionSeedBase: number;
}

export interface BacktestCaseResult {
  caseId: string;
  metric: MetricKey;
  realized: number;
  p10: number;
  p50: number;
  p90: number;
  covered: boolean; // realized within [p10, p90]
}

export interface BacktestReport {
  modelVersion: string;
  metric: MetricKey;
  nominalCoverage: number; // 0.8 for an 80% PI
  casesEvaluated: number;
  casesCovered: number;
  empiricalCoveragePct: number;
  withinGate: boolean; // 70-90%
  cases: BacktestCaseResult[];
}
