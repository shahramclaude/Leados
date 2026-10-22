// Part 08 — top-level finance orchestrator: builds/evaluates the model DAG,
// runs the rolling Monte Carlo forecast, the variance decomposition, and the
// DCF valuation bridge. All finance API routes and UI pages go through this
// module instead of touching `dag.ts` / `financialModel.ts` directly.

import { buildFinancialModelNodes } from "./financialModel";
import { DagNodeDef, EvaluatedModel, OverrideMap, evaluateDag } from "./dag";
import { MONTHS, CUTOVER_INDEX, HISTORY_MONTHS } from "./timeline";
import * as budget from "./budgetModel";
import { ORG_DEPARTMENTS, COST_PER_HEAD_MONTHLY } from "@/lib/org/costBridge";
import { decomposeSalesVariance, decomposeOpexVariance, SalesVarianceDecomposition, OpexVarianceDecomposition } from "./variance";
import { discountedCashFlow, sensitivityGrid, DcfResult, SensitivityCell } from "./investment";
import { FactLedger } from "./citations";
import { kpiSnapshotAt, KpiSnapshot } from "./kpis";
import { unitEconomicsAt, UnitEconomicsSnapshot } from "./unitEconomics";
import { runMonteCarlo, sampleNormal, MonteCarloBand } from "./montecarlo";

let cachedNodes: DagNodeDef[] | null = null;
export function getModelNodes(): DagNodeDef[] {
  if (!cachedNodes) cachedNodes = buildFinancialModelNodes();
  return cachedNodes;
}

export function evaluateModel(overrides: OverrideMap = {}): EvaluatedModel {
  return evaluateDag(getModelNodes(), MONTHS, overrides);
}

export interface MonthSnapshot {
  index: number;
  month: string;
  kpis: KpiSnapshot;
  unitEconomics: UnitEconomicsSnapshot;
}

export function snapshotAt(model: EvaluatedModel, ledger: FactLedger, i: number): MonthSnapshot {
  return { index: i, month: model.months[i], kpis: kpiSnapshotAt(model, ledger, i), unitEconomics: unitEconomicsAt(model, ledger, i) };
}

// ---------------------------------------------------------------------------
// Variance decomposition (actual vs plan)
// ---------------------------------------------------------------------------

export interface MonthVariance {
  month: string;
  revenue: SalesVarianceDecomposition;
  opexByCategory: OpexVarianceDecomposition[];
}

/** One demo month carries a deliberate, labeled one-off G&A cost (a $45k
 * legal true-up) that is NOT explained by headcount x rate, to prove the
 * ">20% of |delta| => flagged unexplained" rule actually fires rather than
 * being silently rounded into the rate effect. See AI-SESSION-LOG.md. */
export const VARIANCE_DEMO_MONTH_INDEX = 10;
export const VARIANCE_DEMO_ONE_OFF_GA = 45_000;

export function varianceAtMonth(model: EvaluatedModel, i: number): MonthVariance {
  const planCustomers = budget.planExistingCustomersCore();
  const segments = [
    {
      name: "Core platform",
      planPrice: budget.planFor(budget.PLAN_PRICE_CORE, i),
      actualPrice: model.nodes["priceCore"].values[i],
      planVolume: budget.planFor(planCustomers, i),
      actualVolume: model.nodes["existingCustomersCore"].values[i],
    },
    {
      name: "Professional services",
      planPrice: budget.planFor(budget.PLAN_PRICE_SERVICES, i),
      actualPrice: model.nodes["priceServices"].values[i],
      planVolume: budget.planFor(budget.PLAN_SERVICES_PROJECTS, i),
      actualVolume: model.nodes["servicesProjects"].values[i],
    },
  ];
  const revenue = decomposeSalesVariance(segments);

  const opexByCategory: OpexVarianceDecomposition[] = ORG_DEPARTMENTS.map((dept) => {
    const headcountNodeId = `headcount_${dept}`;
    return decomposeOpexVariance({
      name: `${dept} headcount cost`,
      planHeadcount: budget.planFor(budget.PLAN_HEADCOUNT[dept], i),
      actualHeadcount: model.nodes[headcountNodeId].values[i],
      planCostPerHead: budget.PLAN_COST_PER_HEAD[dept],
      actualCostPerHead: COST_PER_HEAD_MONTHLY[dept],
      unexplainedAdjustment: dept === "ga" && i === VARIANCE_DEMO_MONTH_INDEX ? VARIANCE_DEMO_ONE_OFF_GA : 0,
    });
  });

  return { month: model.months[i], revenue, opexByCategory };
}

// ---------------------------------------------------------------------------
// DCF valuation bridge
// ---------------------------------------------------------------------------

export interface ValuationResult {
  dcf: DcfResult;
  sensitivity: SensitivityCell[][];
  waccRange: number[];
  growthRange: number[];
  freeCashFlows: number[];
  forecastMonths: string[];
}

export function computeValuation(model: EvaluatedModel, waccAnnualOverride?: number, terminalGrowthOverride?: number): ValuationResult {
  const forecastIndices = model.months.map((_, i) => i).filter((i) => i > CUTOVER_INDEX);
  const cfo = model.nodes["cfo"].values;
  const cfi = model.nodes["cfi"].values;
  const freeCashFlows = forecastIndices.map((i) => cfo[i] + cfi[i]);
  const wacc = waccAnnualOverride ?? model.nodes["waccAnnual"].values[0];
  const growth = terminalGrowthOverride ?? model.nodes["terminalGrowthAnnual"].values[0];
  const dcf = discountedCashFlow({ freeCashFlows, wacc, terminalGrowth: growth });
  const waccRange = [wacc - 0.04, wacc - 0.02, wacc, wacc + 0.02, wacc + 0.04].map((v) => Math.max(0.05, v));
  const growthRange = [growth - 0.02, growth - 0.01, growth, growth + 0.01, growth + 0.02].map((v) => Math.max(0, v));
  const sensitivity = sensitivityGrid(freeCashFlows, waccRange, growthRange);
  return { dcf, sensitivity, waccRange, growthRange, freeCashFlows, forecastMonths: forecastIndices.map((i) => model.months[i]) };
}

// ---------------------------------------------------------------------------
// Monte Carlo rolling forecast (parameter uncertainty through the whole DAG)
// ---------------------------------------------------------------------------

export const FORECAST_OUTPUT_NODES = ["totalRevenue", "grossProfit", "ebitda", "netIncome", "cashBalance", "arr", "runwayMonths"];

export interface ForecastBandsResult {
  months: string[];
  bands: Record<string, MonteCarloBand[]>;
  iterations: number;
}

export function monteCarloForecast(
  model: EvaluatedModel,
  baseOverrides: OverrideMap = {},
  outputNodeIds: string[] = FORECAST_OUTPUT_NODES,
  iterations = 150,
  seed = 777,
): ForecastBandsResult {
  const nodes = getModelNodes();
  const forecastIndices = model.months.map((_, i) => i).filter((i) => i > CUTOVER_INDEX);
  const perturbable = nodes.filter((n) => n.type === "driver" && n.relUncertainty && n.id !== "financingEvents");

  const bands = runMonteCarlo(iterations, seed, (rng) => {
    const overrides: OverrideMap = {};
    for (const key of Object.keys(baseOverrides)) overrides[key] = { ...baseOverrides[key] };
    for (const node of perturbable) {
      const baseSeries = model.nodes[node.id].values;
      const existing = overrides[node.id] ?? {};
      for (const i of forecastIndices) {
        if (existing[i] !== undefined) continue; // respect explicit overrides/asserted values
        const h = i - CUTOVER_INDEX;
        const relStd = node.relUncertainty! * Math.sqrt(h);
        const perturbed = baseSeries[i] * (1 + sampleNormal(rng, 0, relStd));
        existing[i] = Math.max(0, perturbed);
      }
      overrides[node.id] = existing;
    }
    const trialModel = evaluateDag(nodes, model.months, overrides, { cache: false });
    const out: Record<string, number[]> = {};
    for (const id of outputNodeIds) {
      out[id] = forecastIndices.map((i) => trialModel.nodes[id].values[i]);
    }
    return out;
  });

  return { months: forecastIndices.map((i) => model.months[i]), bands, iterations };
}

export { HISTORY_MONTHS, CUTOVER_INDEX, MONTHS };
