// scenarioEngine — the finance/market scenario studio. Wraps financialOS's
// Monte Carlo runway model with a named, versionable, comparable scenario
// abstraction, plus an early-warning indicator derivation: "if this metric
// crosses X, scenario B becomes likely."
import { runMonteCarloRunway, type HiringPlanItem, type RunwayMonteCarloResult } from "@/lib/financialOS";

export interface ScenarioAssumptions {
  startingCash: number;
  monthlyBurn: number;
  monthlyRevenue: number;
  revenueGrowthRate: number;
  burnVolatility: number;
  headcountDelta: number;
  monthlyBurnDelta: number;
  months: number;
  seed?: number;
  hiringPlan?: HiringPlanItem[];
}

export interface ScenarioRunResult {
  runway: RunwayMonteCarloResult;
  effectiveMonthlyBurn: number;
  assumptions: ScenarioAssumptions;
}

/** Runs one named scenario end-to-end through the Monte Carlo runway model. */
export function runScenario(assumptions: ScenarioAssumptions): ScenarioRunResult {
  const effectiveMonthlyBurn = Math.max(0, assumptions.monthlyBurn + assumptions.monthlyBurnDelta);
  const runway = runMonteCarloRunway({
    currentCash: assumptions.startingCash,
    baselineMonthlyBurn: effectiveMonthlyBurn,
    baselineMonthlyRevenue: assumptions.monthlyRevenue,
    revenueGrowthRate: assumptions.revenueGrowthRate,
    burnVolatility: assumptions.burnVolatility,
    hiringPlan: assumptions.hiringPlan,
    horizonMonths: Math.max(assumptions.months, 6),
    seed: assumptions.seed ?? 1337,
  });
  return { runway, effectiveMonthlyBurn, assumptions };
}

export interface ScenarioComparisonRow {
  id: number | string;
  name: string;
  p10RunwayMonths: number;
  p50RunwayMonths: number;
  p90RunwayMonths: number;
  bankruptcyRiskWithin12Months: number;
}

/** Side-by-side comparison view across any number of persisted scenarios. */
export function compareScenarios(
  scenarios: { id: number | string; name: string; results: { monthsToBankruptcy: { p10: number; p50: number; p90: number }; bankruptcyRiskWithin12Months: number } }[],
): ScenarioComparisonRow[] {
  return scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    p10RunwayMonths: s.results.monthsToBankruptcy.p10,
    p50RunwayMonths: s.results.monthsToBankruptcy.p50,
    p90RunwayMonths: s.results.monthsToBankruptcy.p90,
    bankruptcyRiskWithin12Months: s.results.bankruptcyRiskWithin12Months,
  }));
}

export interface EarlyWarningIndicator {
  metric: "monthly_burn" | "monthly_revenue" | "revenue_growth_rate";
  comparator: "above" | "below";
  threshold: number;
  impliesScenario: string;
  rationale: string;
}

/**
 * Searches (via bisection over a bounded multiplier range, not random search
 * — so this is itself deterministic) for the burn level and the revenue
 * growth level at which this scenario's median runway crosses into
 * "critical" (<6 months), and expresses those as monitorable thresholds.
 * This is what powers "if this metric crosses X, scenario B becomes likely."
 */
export function deriveEarlyWarningIndicators(name: string, assumptions: ScenarioAssumptions): EarlyWarningIndicator[] {
  const indicators: EarlyWarningIndicator[] = [];
  const CRITICAL_RUNWAY_MONTHS = 6;

  // Burn threshold: bisection on a multiplier in [1, 3]x current burn.
  {
    let lo = 1;
    let hi = 3;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const result = runScenario({ ...assumptions, monthlyBurn: assumptions.monthlyBurn * mid, monthlyBurnDelta: 0 });
      if (result.runway.monthsToBankruptcy.p50 <= CRITICAL_RUNWAY_MONTHS) hi = mid;
      else lo = mid;
    }
    const thresholdBurn = assumptions.monthlyBurn * hi;
    indicators.push({
      metric: "monthly_burn",
      comparator: "above",
      threshold: Math.round(thresholdBurn),
      impliesScenario: name,
      rationale: `If monthly burn crosses $${Math.round(thresholdBurn).toLocaleString()} (vs $${Math.round(assumptions.monthlyBurn).toLocaleString()} today) with revenue/growth held constant, median runway falls to ${CRITICAL_RUNWAY_MONTHS} months or less under "${name}".`,
    });
  }

  // Revenue growth threshold: bisection on growth rate in [-0.1, baseline].
  {
    let lo = -0.1;
    let hi = Math.max(assumptions.revenueGrowthRate, 0);
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const result = runScenario({ ...assumptions, revenueGrowthRate: mid });
      if (result.runway.monthsToBankruptcy.p50 <= CRITICAL_RUNWAY_MONTHS) hi = mid;
      else lo = mid;
    }
    indicators.push({
      metric: "revenue_growth_rate",
      comparator: "below",
      threshold: Math.round(hi * 1000) / 1000,
      impliesScenario: name,
      rationale: `If revenue growth falls below ${(hi * 100).toFixed(1)}%/mo (vs ${(assumptions.revenueGrowthRate * 100).toFixed(1)}%/mo today), median runway falls to ${CRITICAL_RUNWAY_MONTHS} months or less under "${name}".`,
    });
  }

  return indicators;
}
