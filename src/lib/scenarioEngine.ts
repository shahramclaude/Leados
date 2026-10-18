// src/lib/scenarioEngine.ts
//
// LEADOS Scenario Engine — Part 8: Strategic Simulation Platform.
//
// A "scenario" is baseline business state + a set of causal assumptions
// (overrides / multipliers / one-off events) applied to a 12-month monthly
// projection. Each metric's trajectory is projected twice: a deterministic
// "base" path, and a Monte Carlo distribution (p10/p50/p90) that propagates
// each metric's own volatility assumption through the same causal structure.
//
// Second-order effects are modeled two ways:
//   1. Organically, through derived metrics (e.g. runwayMonths is always
//      recomputed from cashBalance / burnRate, so any assumption that moves
//      burnRate automatically moves runway without anyone wiring that by hand).
//   2. Explicitly, through `causedEffects` on an assumption (e.g. "key hire
//      departure" directly dents `employeeEngagement` and `pipelineCoverage`
//      as a stated causal belief, not just a side-effect of the formulas).
//
// Pure, dependency-free (besides the Monte Carlo helpers), no DB calls.

import { clamp, hashSeed, mean, mulberry32, percentile, sampleStdNormal } from "./monteCarlo";

// ---------------------------------------------------------------------------
// Baseline domain model
// ---------------------------------------------------------------------------

export type MetricKey =
  | "revenue"
  | "burnRate"
  | "cashBalance"
  | "runwayMonths"
  | "headcount"
  | "churnRate"
  | "grossMargin"
  | "marketShare"
  | "pipelineCoverage"
  | "employeeEngagement"
  | "nps";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  unit: string;
  /** Monthly trend growth rate, e.g. 0.03 = +3%/month */
  monthlyGrowth: number;
  /** Monte Carlo volatility, as a fraction of value, applied as N(0, volatility) noise each month */
  volatility: number;
  /** Higher value is strategically better (used for composite scoring) */
  higherIsBetter: boolean;
  /** Derived metrics are recomputed from other metrics each period rather than grown directly */
  derived?: boolean;
  /** Typical healthy range, used to normalize for composite scoring / heatmaps */
  normalRange: [number, number];
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "revenue", label: "Monthly Revenue", unit: "$", monthlyGrowth: 0.03, volatility: 0.06, higherIsBetter: true, normalRange: [0, 1_200_000] },
  { key: "burnRate", label: "Net Burn", unit: "$", monthlyGrowth: 0.01, volatility: 0.08, higherIsBetter: false, normalRange: [0, 500_000] },
  { key: "cashBalance", label: "Cash Balance", unit: "$", monthlyGrowth: 0, volatility: 0.02, higherIsBetter: true, derived: true, normalRange: [0, 6_000_000] },
  { key: "runwayMonths", label: "Runway", unit: "months", monthlyGrowth: 0, volatility: 0, higherIsBetter: true, derived: true, normalRange: [0, 36] },
  { key: "headcount", label: "Headcount", unit: "people", monthlyGrowth: 0.012, volatility: 0.03, higherIsBetter: true, normalRange: [0, 200] },
  { key: "churnRate", label: "Customer Churn", unit: "%", monthlyGrowth: 0, volatility: 0.1, higherIsBetter: false, normalRange: [0, 12] },
  { key: "grossMargin", label: "Gross Margin", unit: "%", monthlyGrowth: 0.002, volatility: 0.03, higherIsBetter: true, normalRange: [0, 90] },
  { key: "marketShare", label: "Market Share", unit: "%", monthlyGrowth: 0.004, volatility: 0.05, higherIsBetter: true, normalRange: [0, 30] },
  { key: "pipelineCoverage", label: "Pipeline Coverage", unit: "x", monthlyGrowth: 0.005, volatility: 0.07, higherIsBetter: true, normalRange: [0, 8] },
  { key: "employeeEngagement", label: "Employee Engagement", unit: "idx", monthlyGrowth: 0.001, volatility: 0.04, higherIsBetter: true, normalRange: [0, 100] },
  { key: "nps", label: "NPS", unit: "pts", monthlyGrowth: 0.002, volatility: 0.12, higherIsBetter: true, normalRange: [-100, 100] },
];

export const METRIC_KEYS: MetricKey[] = METRIC_DEFINITIONS.map((m) => m.key);

export type BaselineState = Record<MetricKey, number>;

export function defaultBaselineState(): BaselineState {
  return {
    revenue: 420_000,
    burnRate: 180_000,
    cashBalance: 2_500_000,
    runwayMonths: 14,
    headcount: 64,
    churnRate: 2.4,
    grossMargin: 68,
    marketShare: 6.2,
    pipelineCoverage: 3.4,
    employeeEngagement: 71,
    nps: 32,
  };
}

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

export type ScenarioType = "base" | "stress" | "opportunity" | "crisis" | "competitive";
export type ScenarioStatus = "draft" | "active" | "archived";
export type AssumptionType = "override" | "multiplier" | "event";

export interface CausedEffect {
  targetKey: MetricKey;
  /** Fractional impact applied to the target metric at the same month, e.g. -0.2 = -20% */
  impactPct: number;
  rationale?: string;
}

export interface ScenarioAssumption {
  id: string;
  key: MetricKey;
  type: AssumptionType;
  /** override: absolute value to set. multiplier/event: fractional change, e.g. 0.2 = +20%, -0.3 = -30% */
  value: number;
  description?: string;
  /** Month (1-12) the assumption takes effect. Defaults to 1. */
  month?: number;
  causedEffects?: CausedEffect[];
}

export interface Scenario {
  id: string;
  name: string;
  type: ScenarioType;
  status: ScenarioStatus;
  description: string;
  assumptions: ScenarioAssumption[];
  /** Quick-access overrides: metric -> immediate % shift applied at month 1 (e.g. 0.2 = +20%) */
  variableOverrides: Partial<Record<MetricKey, number>>;
  createdBy?: string;
  createdAt: string;
}

let scenarioCounter = 0;
function genId(prefix: string): string {
  scenarioCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${scenarioCounter.toString(36)}`;
}

export function defineScenario(
  name: string,
  type: ScenarioType,
  assumptions: Omit<ScenarioAssumption, "id">[],
  variableOverrides: Partial<Record<MetricKey, number>> = {},
  opts: { description?: string; createdBy?: string; status?: ScenarioStatus } = {},
): Scenario {
  return {
    id: genId("scn"),
    name,
    type,
    status: opts.status ?? "draft",
    description: opts.description ?? "",
    assumptions: assumptions.map((a) => ({ ...a, id: genId("asm") })),
    variableOverrides,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ScenarioMetricPath {
  base: number[];
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface ScenarioTimelinePeriod {
  month: number;
  label: string;
  compositeScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export type ScenarioTimeline = ScenarioTimelinePeriod[];

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface ScenarioRisk {
  id: string;
  month: number;
  severity: RiskSeverity;
  title: string;
  description: string;
  metric: MetricKey | "composite";
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  monteCarloIterations: number;
  timeline: ScenarioTimeline;
  keyMetrics: Record<MetricKey, ScenarioMetricPath>;
  riskEvents: ScenarioRisk[];
  summary: string;
  /** Composite expected-outcome score at month 12, base path. 0-100. */
  expectedOutcomeScore: number;
  /** Composite score at month 12 using the p10 path per metric — a downside read. 0-100. */
  downsideScore: number;
  /** 0-100: fewer/smaller risk events + more runway headroom = more flexible to respond to shocks. */
  flexibilityScore: number;
}

const MONTHS = 12;

const WEIGHTS: Partial<Record<MetricKey, number>> = {
  revenue: 0.18,
  runwayMonths: 0.16,
  grossMargin: 0.12,
  marketShare: 0.12,
  pipelineCoverage: 0.1,
  employeeEngagement: 0.12,
  nps: 0.1,
  churnRate: 0.1,
};

function normalize01(def: MetricDefinition, value: number): number {
  const [lo, hi] = def.normalRange;
  const n = clamp((value - lo) / (hi - lo || 1), 0, 1);
  return def.higherIsBetter ? n : 1 - n;
}

/** Weighted composite "org health / trajectory" score, 0-100. */
export function compositeScore(values: Partial<Record<MetricKey, number>>): number {
  let total = 0;
  let weightSum = 0;
  for (const def of METRIC_DEFINITIONS) {
    const w = WEIGHTS[def.key];
    if (!w) continue;
    const v = values[def.key];
    if (v === undefined || Number.isNaN(v)) continue;
    total += normalize01(def, v) * 100 * w;
    weightSum += w;
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 50;
}

function riskLevelFromScore(score: number): RiskSeverity {
  if (score < 30) return "critical";
  if (score < 50) return "high";
  if (score < 70) return "medium";
  return "low";
}

/** Applies all assumption/override effects active up to & including `month` onto a mutable value map. */
function applyShocksForMonth(
  month: number,
  values: Record<MetricKey, number>,
  scenario: Scenario,
): void {
  // variableOverrides apply once, at month 1, as an immediate step shift
  if (month === 1) {
    for (const [key, pct] of Object.entries(scenario.variableOverrides) as [MetricKey, number][]) {
      if (pct === undefined || pct === null) continue;
      values[key] = values[key] * (1 + pct);
    }
  }

  for (const a of scenario.assumptions) {
    const atMonth = a.month ?? 1;
    if (atMonth !== month) continue;

    if (a.type === "override") {
      values[a.key] = a.value;
    } else if (a.type === "multiplier" || a.type === "event") {
      values[a.key] = values[a.key] * (1 + a.value);
    }

    for (const effect of a.causedEffects ?? []) {
      values[effect.targetKey] = values[effect.targetKey] * (1 + effect.impactPct);
    }
  }
}

function recomputeDerived(values: Record<MetricKey, number>, prevCash: number): void {
  const nextCash = prevCash + (values.revenue - values.burnRate);
  values.cashBalance = nextCash;
  values.runwayMonths = values.burnRate > 0 ? clamp(nextCash / values.burnRate, 0, 60) : 60;
}

/**
 * Deterministic month-by-month base path, honoring assumption shocks and
 * organic second-order effects through the derived-metric recompute.
 */
function projectBasePath(scenario: Scenario, baseline: BaselineState): Record<MetricKey, number[]> {
  const paths = Object.fromEntries(METRIC_KEYS.map((k) => [k, [] as number[]])) as Record<MetricKey, number[]>;
  const current: Record<MetricKey, number> = { ...baseline };

  for (let month = 1; month <= MONTHS; month++) {
    if (month > 1) {
      for (const def of METRIC_DEFINITIONS) {
        if (def.derived) continue;
        current[def.key] = current[def.key] * (1 + def.monthlyGrowth);
      }
    }
    applyShocksForMonth(month, current, scenario);
    const prevCash = month === 1 ? baseline.cashBalance : paths.cashBalance[month - 2];
    recomputeDerived(current, prevCash);

    for (const key of METRIC_KEYS) paths[key].push(Math.round(current[key] * 100) / 100);
  }

  return paths;
}

/**
 * Monte Carlo pass: re-runs the same causal structure `iterations` times with
 * per-metric gaussian noise applied to the monthly growth step, collecting
 * percentile bands per metric per month.
 */
function projectMonteCarlo(
  scenario: Scenario,
  baseline: BaselineState,
  iterations: number,
): Record<MetricKey, { p10: number[]; p50: number[]; p90: number[] }> {
  const samples: Record<MetricKey, number[][]> = Object.fromEntries(
    METRIC_KEYS.map((k) => [k, Array.from({ length: MONTHS }, () => [] as number[])]),
  ) as Record<MetricKey, number[][]>;

  const rngSeed = hashSeed(`${scenario.id}:${scenario.name}`);

  for (let iter = 0; iter < iterations; iter++) {
    const rand = mulberry32(rngSeed + iter * 7919);
    const current: Record<MetricKey, number> = { ...baseline };
    let prevCash = baseline.cashBalance;

    for (let month = 1; month <= MONTHS; month++) {
      if (month > 1) {
        for (const def of METRIC_DEFINITIONS) {
          if (def.derived) continue;
          const noise = def.volatility > 0 ? sampleStdNormal(rand) * def.volatility : 0;
          current[def.key] = current[def.key] * (1 + def.monthlyGrowth + noise);
        }
      }
      applyShocksForMonth(month, current, scenario);
      recomputeDerived(current, prevCash);
      prevCash = current.cashBalance;

      for (const key of METRIC_KEYS) samples[key][month - 1].push(current[key]);
    }
  }

  const result = {} as Record<MetricKey, { p10: number[]; p50: number[]; p90: number[] }>;
  for (const key of METRIC_KEYS) {
    const p10: number[] = [];
    const p50: number[] = [];
    const p90: number[] = [];
    for (let m = 0; m < MONTHS; m++) {
      const sorted = [...samples[key][m]].sort((a, b) => a - b);
      p10.push(Math.round(percentile(sorted, 0.1) * 100) / 100);
      p50.push(Math.round(percentile(sorted, 0.5) * 100) / 100);
      p90.push(Math.round(percentile(sorted, 0.9) * 100) / 100);
    }
    result[key] = { p10, p50, p90 };
  }
  return result;
}

function detectRiskEvents(scenario: Scenario, basePaths: Record<MetricKey, number[]>): ScenarioRisk[] {
  const risks: ScenarioRisk[] = [];
  let riskCounter = 0;
  const nextId = () => {
    riskCounter += 1;
    return `risk_${scenario.id}_${riskCounter}`;
  };

  for (let i = 0; i < MONTHS; i++) {
    const month = i + 1;
    const runway = basePaths.runwayMonths[i];
    const churn = basePaths.churnRate[i];
    const margin = basePaths.grossMargin[i];
    const engagement = basePaths.employeeEngagement[i];
    const nps = basePaths.nps[i];

    if (runway < 3) {
      risks.push({ id: nextId(), month, severity: "critical", metric: "runwayMonths", title: "Insolvency risk", description: `Runway falls to ${runway.toFixed(1)} months — board-level cash emergency.` });
    } else if (runway < 6) {
      risks.push({ id: nextId(), month, severity: "high", metric: "runwayMonths", title: "Runway critical", description: `Runway drops to ${runway.toFixed(1)} months — a financing event or burn cut is required.` });
    } else if (runway < 10) {
      risks.push({ id: nextId(), month, severity: "medium", metric: "runwayMonths", title: "Runway tightening", description: `Runway at ${runway.toFixed(1)} months — start the fundraise/cut-burn clock.` });
    }

    if (churn > 6) {
      risks.push({ id: nextId(), month, severity: "high", metric: "churnRate", title: "Churn spike", description: `Customer churn reaches ${churn.toFixed(1)}%/mo, well above healthy range.` });
    }
    if (margin < 45) {
      risks.push({ id: nextId(), month, severity: "medium", metric: "grossMargin", title: "Margin compression", description: `Gross margin compresses to ${margin.toFixed(1)}%.` });
    }
    if (engagement < 50) {
      risks.push({ id: nextId(), month, severity: "medium", metric: "employeeEngagement", title: "Engagement erosion", description: `Employee engagement index falls to ${engagement.toFixed(0)} — elevated attrition risk.` });
    }
    if (nps < 0) {
      risks.push({ id: nextId(), month, severity: "medium", metric: "nps", title: "Negative NPS", description: `NPS turns negative (${nps.toFixed(0)}) — detractors outnumber promoters.` });
    }
  }

  // Scheduled shocks become their own risk timeline entries regardless of threshold breach
  for (const a of scenario.assumptions) {
    if (a.type !== "event") continue;
    risks.push({
      id: nextId(),
      month: a.month ?? 1,
      severity: Math.abs(a.value) > 0.25 ? "high" : "medium",
      metric: a.key,
      title: a.description || `Scheduled event: ${a.key}`,
      description: a.description || `${a.key} shocked by ${(a.value * 100).toFixed(0)}% at month ${a.month ?? 1}.`,
    });
  }

  return risks.sort((a, b) => a.month - b.month);
}

function buildSummary(scenario: Scenario, basePaths: Record<MetricKey, number[]>, risks: ScenarioRisk[], expected: number, downside: number): string {
  const revStart = basePaths.revenue[0];
  const revEnd = basePaths.revenue[MONTHS - 1];
  const revDeltaPct = revStart ? Math.round(((revEnd - revStart) / revStart) * 100) : 0;
  const runwayEnd = basePaths.runwayMonths[MONTHS - 1];
  const criticalCount = risks.filter((r) => r.severity === "critical" || r.severity === "high").length;

  const trajectory = revDeltaPct >= 0 ? `grows ${revDeltaPct}%` : `contracts ${Math.abs(revDeltaPct)}%`;
  const riskLine =
    criticalCount > 0
      ? `${criticalCount} high/critical risk event(s) surface over the horizon, concentrated around ${risks.find((r) => r.severity === "critical" || r.severity === "high")?.title ?? "key thresholds"}.`
      : "No high-severity risk thresholds are breached on the base path.";

  return (
    `Under "${scenario.name}" (${scenario.type}), revenue ${trajectory} over 12 months, ending runway is ` +
    `${runwayEnd.toFixed(1)} months. Expected outcome score ${expected}/100 vs. downside (p10) read of ${downside}/100. ${riskLine} ` +
    `Monte Carlo bands reflect per-metric volatility propagated through the same causal structure as the base path.`
  );
}

export function runScenario(
  scenario: Scenario,
  baselineState: BaselineState = defaultBaselineState(),
  monteCarloIterations = 5000,
): ScenarioResult {
  const basePaths = projectBasePath(scenario, baselineState);
  const mc = projectMonteCarlo(scenario, baselineState, Math.max(100, Math.min(monteCarloIterations, 20000)));

  const keyMetrics = {} as Record<MetricKey, ScenarioMetricPath>;
  for (const key of METRIC_KEYS) {
    keyMetrics[key] = {
      base: basePaths[key],
      p10: mc[key].p10,
      p50: mc[key].p50,
      p90: mc[key].p90,
    };
  }

  const timeline: ScenarioTimeline = [];
  for (let i = 0; i < MONTHS; i++) {
    const monthValues = Object.fromEntries(METRIC_KEYS.map((k) => [k, basePaths[k][i]])) as Record<MetricKey, number>;
    const score = compositeScore(monthValues);
    timeline.push({ month: i + 1, label: `Month ${i + 1}`, compositeScore: score, riskLevel: riskLevelFromScore(score) });
  }

  const riskEvents = detectRiskEvents(scenario, basePaths);

  const finalBase = Object.fromEntries(METRIC_KEYS.map((k) => [k, basePaths[k][MONTHS - 1]])) as Record<MetricKey, number>;
  const finalP10 = Object.fromEntries(METRIC_KEYS.map((k) => [k, mc[k].p10[MONTHS - 1]])) as Record<MetricKey, number>;
  const expectedOutcomeScore = compositeScore(finalBase);
  const downsideScore = compositeScore(finalP10);

  const highSeverity = riskEvents.filter((r) => r.severity === "high").length;
  const criticalSeverity = riskEvents.filter((r) => r.severity === "critical").length;
  const runwayHeadroom = clamp((finalBase.runwayMonths - 6) / 18, 0, 1) * 100;
  const flexibilityScore = Math.round(
    clamp(100 - highSeverity * 8 - criticalSeverity * 20 + runwayHeadroom * 0.3, 0, 100),
  );

  const summary = buildSummary(scenario, basePaths, riskEvents, expectedOutcomeScore, downsideScore);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioType: scenario.type,
    monteCarloIterations,
    timeline,
    keyMetrics,
    riskEvents,
    summary,
    expectedOutcomeScore,
    downsideScore,
    flexibilityScore,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ScenarioComparisonRow {
  scenarioId: string;
  scenarioName: string;
  expectedOutcomeScore: number;
  downsideRisk: number; // 100 - downsideScore: higher = riskier
  flexibilityScore: number;
  rank: number;
}

export interface TradeoffCell {
  scenarioId: string;
  scenarioName: string;
  metric: MetricKey;
  value: number;
  normalized: number; // 0-100, heatmap-ready, higher = better
}

export interface ScenarioComparison {
  scenarios: string[];
  ranking: ScenarioComparisonRow[];
  bestExpectedOutcome: string;
  lowestDownsideRisk: string;
  highestFlexibility: string;
  tradeoffMatrix: TradeoffCell[];
}

const TRADEOFF_METRICS: MetricKey[] = [
  "revenue",
  "runwayMonths",
  "grossMargin",
  "marketShare",
  "pipelineCoverage",
  "employeeEngagement",
  "nps",
  "churnRate",
];

export function compareScenarios(scenarios: ScenarioResult[]): ScenarioComparison {
  const rows: ScenarioComparisonRow[] = scenarios
    .map((s) => ({
      scenarioId: s.scenarioId,
      scenarioName: s.scenarioName,
      expectedOutcomeScore: s.expectedOutcomeScore,
      downsideRisk: 100 - s.downsideScore,
      flexibilityScore: s.flexibilityScore,
      rank: 0,
    }))
    .sort((a, b) => b.expectedOutcomeScore - a.expectedOutcomeScore)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const bestExpectedOutcome = [...rows].sort((a, b) => b.expectedOutcomeScore - a.expectedOutcomeScore)[0]?.scenarioName ?? "";
  const lowestDownsideRisk = [...rows].sort((a, b) => a.downsideRisk - b.downsideRisk)[0]?.scenarioName ?? "";
  const highestFlexibility = [...rows].sort((a, b) => b.flexibilityScore - a.flexibilityScore)[0]?.scenarioName ?? "";

  const tradeoffMatrix: TradeoffCell[] = [];
  for (const s of scenarios) {
    for (const metric of TRADEOFF_METRICS) {
      const def = METRIC_DEFINITIONS.find((m) => m.key === metric)!;
      const value = s.keyMetrics[metric]?.base[MONTHS - 1] ?? 0;
      const normalized = Math.round(normalize01(def, value) * 100);
      tradeoffMatrix.push({ scenarioId: s.scenarioId, scenarioName: s.scenarioName, metric, value, normalized });
    }
  }

  return {
    scenarios: scenarios.map((s) => s.scenarioName),
    ranking: rows,
    bestExpectedOutcome,
    lowestDownsideRisk,
    highestFlexibility,
    tradeoffMatrix,
  };
}

// ---------------------------------------------------------------------------
// Stress testing
// ---------------------------------------------------------------------------

export type StressorKind = "recession" | "key_hire_departure" | "customer_churn" | "supply_disruption" | "custom";

export interface Stressor {
  id: string;
  kind: StressorKind;
  label: string;
  description: string;
  targetMetric: MetricKey;
  /** Fractional shock to apply, e.g. -0.3 = -30% */
  magnitudePct: number;
  month?: number;
  causedEffects?: CausedEffect[];
}

export const STRESSOR_CATALOG: Stressor[] = [
  {
    id: "recession",
    kind: "recession",
    label: "Macro recession",
    description: "Broad demand contraction cuts new bookings and slows expansion revenue.",
    targetMetric: "revenue",
    magnitudePct: -0.3,
    month: 2,
    causedEffects: [
      { targetKey: "pipelineCoverage", impactPct: -0.2, rationale: "Buyers freeze budgets, pipeline thins" },
      { targetKey: "marketShare", impactPct: -0.05, rationale: "Competitors discount to defend share" },
    ],
  },
  {
    id: "key_hire_departure",
    kind: "key_hire_departure",
    label: "Key hire departure",
    description: "A critical leader or top performer exits unexpectedly.",
    targetMetric: "employeeEngagement",
    magnitudePct: -0.15,
    month: 1,
    causedEffects: [
      { targetKey: "pipelineCoverage", impactPct: -0.1, rationale: "Deal continuity and relationships disrupted" },
      { targetKey: "churnRate", impactPct: 0.1, rationale: "Customer-facing relationship risk increases" },
    ],
  },
  {
    id: "customer_churn",
    kind: "customer_churn",
    label: "Major customer churn",
    description: "A top-5 account churns, taking logo and referenceability with it.",
    targetMetric: "churnRate",
    magnitudePct: 0.8,
    month: 1,
    causedEffects: [
      { targetKey: "revenue", impactPct: -0.12, rationale: "Direct ARR loss plus knock-on renewal risk" },
      { targetKey: "nps", impactPct: -0.15, rationale: "Reference loss dents market perception" },
    ],
  },
  {
    id: "supply_disruption",
    kind: "supply_disruption",
    label: "Supply / vendor disruption",
    description: "A critical vendor or supply chain link fails, raising cost-to-serve.",
    targetMetric: "grossMargin",
    magnitudePct: -0.18,
    month: 2,
    causedEffects: [
      { targetKey: "burnRate", impactPct: 0.1, rationale: "Emergency sourcing costs more" },
      { targetKey: "nps", impactPct: -0.08, rationale: "Delivery delays frustrate customers" },
    ],
  },
];

export function buildStressTest(stressors: Stressor[]): Scenario[] {
  return stressors.map((stressor) =>
    defineScenario(
      stressor.label,
      "stress",
      [
        {
          key: stressor.targetMetric,
          type: "event",
          value: stressor.magnitudePct,
          description: stressor.description,
          month: stressor.month ?? 1,
          causedEffects: stressor.causedEffects,
        },
      ],
      {},
      { description: stressor.description, status: "active" },
    ),
  );
}
