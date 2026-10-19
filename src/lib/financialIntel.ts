import { mulberry32, gaussianFactory } from "./prng";
import { clamp01 } from "./beliefFabric";

export type RunwayInputs = {
  cashBalance: number;
  burnRate: number; // monthly gross burn
  revenue: number; // monthly revenue at t=0
  revenueGrowth: number; // monthly fractional growth, e.g. 0.05
};

export type MonteCarloRunwayResult = {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p50RunwayMonths: number;
  mean: number;
  samples: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

const MAX_MONTHS_CAP = 60;

/**
 * Runs n simulated cash paths with a seeded PRNG so the same inputs +
 * seed always reproduce the same distribution (FI_04).
 */
export function runMonteCarloRunway(
  inputs: RunwayInputs,
  n = 500,
  seed = 42,
): MonteCarloRunwayResult {
  const rng = mulberry32(seed);
  const gaussian = gaussianFactory(rng);
  const results: number[] = [];

  for (let i = 0; i < n; i++) {
    let cash = inputs.cashBalance;
    let revenue = Math.max(0, inputs.revenue);
    let monthsElapsed = 0;
    let runway = MAX_MONTHS_CAP;

    for (let m = 0; m < MAX_MONTHS_CAP; m++) {
      const burnMultiplier = Math.max(0.5, 1 + 0.15 * gaussian());
      const revenueMultiplier = Math.max(0, 1 + 0.1 * gaussian());

      const burnThisMonth = inputs.burnRate * burnMultiplier;
      const revenueThisMonth = revenue * revenueMultiplier;
      const netBurn = burnThisMonth - revenueThisMonth;

      if (netBurn <= 0) {
        // Profitable this month — effectively infinite runway, capped.
        runway = MAX_MONTHS_CAP;
        break;
      }

      if (cash - netBurn <= 0) {
        const fraction = cash / netBurn;
        runway = monthsElapsed + Math.max(0, Math.min(1, fraction));
        break;
      }

      cash -= netBurn;
      revenue = revenue * (1 + inputs.revenueGrowth);
      monthsElapsed += 1;
      runway = monthsElapsed;
    }

    results.push(runway);
  }

  results.sort((a, b) => a - b);
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const p50 = percentile(results, 50);

  return {
    p5: percentile(results, 5),
    p10: percentile(results, 10),
    p25: percentile(results, 25),
    p50,
    p75: percentile(results, 75),
    p90: percentile(results, 90),
    p95: percentile(results, 95),
    p50RunwayMonths: p50,
    mean,
    samples: results.length,
  };
}

export type FundraisingInputs = {
  revenueGrowthRate: number; // monthly fraction, e.g. 0.1 = 10%
  runwayMonths: number;
  grossMargin: number; // 0..1
  customerChurnRate: number; // monthly fraction
  teamCompleteness: number; // 0..1
  marketSizeScore: number; // 0..1
  existingInvestorSupport: number; // 0..1
};

export type FundraisingReadiness = {
  readinessScore: number; // 0..100
  breakdown: Record<string, number>;
};

export function computeFundraisingReadiness(inputs: FundraisingInputs): FundraisingReadiness {
  const growthScore = clamp01(inputs.revenueGrowthRate / 0.2);
  const runwayScore = clamp01(inputs.runwayMonths / 18);
  const marginScore = clamp01(inputs.grossMargin);
  const churnScore = clamp01(1 - inputs.customerChurnRate / 0.1);
  const teamScore = clamp01(inputs.teamCompleteness);
  const marketScore = clamp01(inputs.marketSizeScore);
  const investorScore = clamp01(inputs.existingInvestorSupport);

  const weights = {
    growth: 0.2,
    runway: 0.15,
    margin: 0.15,
    churn: 0.15,
    team: 0.15,
    market: 0.1,
    investor: 0.1,
  };

  const weighted =
    growthScore * weights.growth +
    runwayScore * weights.runway +
    marginScore * weights.margin +
    churnScore * weights.churn +
    teamScore * weights.team +
    marketScore * weights.market +
    investorScore * weights.investor;

  const readinessScore = Math.max(0, Math.min(100, weighted * 100));

  return {
    readinessScore,
    breakdown: {
      growthScore,
      runwayScore,
      marginScore,
      churnScore,
      teamScore,
      marketScore,
      investorScore,
    },
  };
}
