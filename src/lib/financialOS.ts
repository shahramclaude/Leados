import type { CapitalEfficiencyReport, FundraisingReadiness, MonteCarloResult, RunwayPath, RunwayReport, UnitEconomics } from "@/lib/types";
import type { FinanceSnapshotState } from "@/lib/eventBrain";
import { mulberry32, makeGaussian, percentile, buildHistogram } from "@/lib/prng";

// ─────────────────────────────────────────────────────────────────────────
// financialOS — runway Monte Carlo (GBM via Box-Muller), unit economics,
// fundraising readiness, and capital efficiency.
// ─────────────────────────────────────────────────────────────────────────

// DESIGN PARAMETER: Monte Carlo sample size n=2000, horizon = 24 months,
// monthly volatility of burn = 18% (sigma), default seed = 1337 (caller
// can override for reproducibility tests).
const DEFAULT_N = 2000;
const HORIZON_MONTHS = 24;
const BURN_VOLATILITY = 0.18;

/**
 * Monte Carlo runway simulation modeled as Geometric Brownian Motion on the
 * monthly burn rate: burn_{t+1} = burn_t * exp((mu - 0.5*sigma^2) + sigma*Z)
 * where Z ~ N(0,1) via Box-Muller. Cash depletes by burn_t minus any
 * modeled revenue growth, each month, until <= 0 (bankruptcy month).
 */
export function runMonteCarloRunway(
  currentCash: number,
  monthlyBurn: number,
  revenueGrowthRate = 0.0,
  seed = 1337,
  n: number = DEFAULT_N
): RunwayReport {
  const rng = mulberry32(seed);
  const gaussian = makeGaussian(rng);
  const mu = 0; // no deterministic drift in burn itself; growth offsets separately
  const monthsToBankruptcy: number[] = [];
  const paths: RunwayPath[] = [];

  for (let i = 0; i < n; i++) {
    let cash = currentCash;
    let burn = monthlyBurn;
    let revenue = monthlyBurn * revenueGrowthRate * 3; // small offsetting revenue base
    let month = 0;
    const weeks: number[] = [];
    const cashTrack: number[] = [];
    for (; month < HORIZON_MONTHS; month++) {
      const z = gaussian();
      burn = burn * Math.exp(mu - 0.5 * BURN_VOLATILITY ** 2 + BURN_VOLATILITY * z);
      revenue = revenue * (1 + revenueGrowthRate);
      cash = cash - Math.max(0, burn - revenue);
      if (i < 5) {
        weeks.push(month);
        cashTrack.push(Math.max(0, cash));
      }
      if (cash <= 0) {
        month += (currentCash % 1 >= 0 ? 0 : 0); // no-op, keeps fractional month if needed
        break;
      }
    }
    if (i < 5) paths.push({ weeks, cash: cashTrack });
    monthsToBankruptcy.push(Math.min(HORIZON_MONTHS, month + (cash <= 0 ? 1 : 0)));
  }

  monthsToBankruptcy.sort((a, b) => a - b);
  const mean = monthsToBankruptcy.reduce((a, b) => a + b, 0) / monthsToBankruptcy.length;
  const monteCarlo: MonteCarloResult = {
    n,
    p5: percentile(monthsToBankruptcy, 5),
    p10: percentile(monthsToBankruptcy, 10),
    p25: percentile(monthsToBankruptcy, 25),
    p50: percentile(monthsToBankruptcy, 50),
    p75: percentile(monthsToBankruptcy, 75),
    p90: percentile(monthsToBankruptcy, 90),
    p95: percentile(monthsToBankruptcy, 95),
    mean,
    histogram: buildHistogram(monthsToBankruptcy, 20),
    seed,
  };
  const bankruptcyRisk = monthsToBankruptcy.filter((m) => m <= 1).length / monthsToBankruptcy.length;

  return { monteCarlo, paths, bankruptcyRisk, currentCash, monthlyBurn };
}

// DESIGN PARAMETER: unit economics health thresholds — ltvCacRatio >= 3
// "healthy", 1.5-3 "watch", < 1.5 "critical".
export function computeUnitEconomics(snapshot: FinanceSnapshotState): UnitEconomics {
  const cac = snapshot.newCustomers > 0 ? snapshot.salesSpend / snapshot.newCustomers : snapshot.cac || 1;
  const arpa = snapshot.customers > 0 ? (snapshot.mrr * 12) / snapshot.customers : 0;
  const grossMargin = snapshot.grossMarginPct || 0.7;
  const monthlyChurn = 0.02; // DESIGN PARAMETER: default monthly logo churn assumption when not modeled elsewhere
  const lifetimeMonths = monthlyChurn > 0 ? 1 / monthlyChurn : 36;
  const ltv = arpa * grossMargin * (lifetimeMonths / 12);
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const paybackPeriodMonths = arpa > 0 ? cac / ((arpa / 12) * grossMargin) : 0;
  const health: UnitEconomics["health"] = ltvCacRatio >= 3 ? "healthy" : ltvCacRatio >= 1.5 ? "watch" : "critical";
  return { ltv, cac, ltvCacRatio, grossMargin, paybackPeriodMonths, health };
}

// DESIGN PARAMETER: fundraising readiness scoring weights — runway (30pt),
// growth (25pt), unit economics (25pt), momentum/decisions (20pt).
export function computeFundraisingReadiness(
  runway: RunwayReport,
  unitEconomics: UnitEconomics,
  arrGrowthRate: number,
  monthsSinceLastRound: number
): FundraisingReadiness {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (runway.monteCarlo.p50 >= 12) {
    score += 30;
    strengths.push(`Median runway of ${runway.monteCarlo.p50.toFixed(0)} months gives negotiating leverage.`);
  } else if (runway.monteCarlo.p50 >= 6) {
    score += 15;
    weaknesses.push(`Median runway is only ${runway.monteCarlo.p50.toFixed(0)} months — time pressure will show in terms.`);
  } else {
    weaknesses.push(`Median runway of ${runway.monteCarlo.p50.toFixed(0)} months is a critical red flag for investors.`);
  }

  if (arrGrowthRate >= 0.08) {
    score += 25;
    strengths.push(`ARR growth rate of ${(arrGrowthRate * 100).toFixed(1)}%/mo is a strong growth story.`);
  } else if (arrGrowthRate >= 0.03) {
    score += 12;
    weaknesses.push(`ARR growth rate of ${(arrGrowthRate * 100).toFixed(1)}%/mo is modest for a new raise.`);
  } else {
    weaknesses.push(`ARR growth is stalled at ${(arrGrowthRate * 100).toFixed(1)}%/mo.`);
  }

  if (unitEconomics.ltvCacRatio >= 3) {
    score += 25;
    strengths.push(`LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x demonstrates efficient growth.`);
  } else if (unitEconomics.ltvCacRatio >= 1.5) {
    score += 10;
    weaknesses.push(`LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x needs improvement before a raise.`);
  } else {
    weaknesses.push(`LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x is below sustainable thresholds.`);
  }

  if (monthsSinceLastRound >= 12) {
    score += 20;
    strengths.push(`${monthsSinceLastRound} months since last round — market timing is natural.`);
  } else {
    score += Math.max(0, 20 - (12 - monthsSinceLastRound) * 2);
    weaknesses.push(`Only ${monthsSinceLastRound} months since last round — early for a new raise unless urgent.`);
  }

  score = Math.max(0, Math.min(100, score));
  const raiseNowOrWait: FundraisingReadiness["raiseNowOrWait"] =
    runway.monteCarlo.p50 < 4 ? "urgent" : score >= 65 ? "raise_now" : "wait";

  return { score, raiseNowOrWait, strengths, weaknesses };
}

// DESIGN PARAMETER: capital efficiency scoring — see rubric below, max 100.
export function computeCapitalEfficiency(
  snapshot: FinanceSnapshotState,
  unitEconomics: UnitEconomics
): CapitalEfficiencyReport {
  const netNewArr = Math.max(1, snapshot.newArr - snapshot.churnedArr);
  const burnMultiple = snapshot.monthlyBurn / (netNewArr / 12 || 1);
  const revenuePerEmployee = snapshot.headcount > 0 ? (snapshot.mrr * 12) / snapshot.headcount : 0;
  const costPerAcquisition = unitEconomics.cac;
  const paybackPeriodMonths = unitEconomics.paybackPeriodMonths;
  const engineeringEfficiency = snapshot.rdHeadcountCost > 0 ? (snapshot.mrr * 12) / snapshot.rdHeadcountCost : 0;

  let score = 0;
  if (burnMultiple < 1.5) score += 30;
  if (burnMultiple < 2) score += 20;
  if (unitEconomics.ltvCacRatio > 3) score += 25;
  if (paybackPeriodMonths < 18) score += 20;
  if (revenuePerEmployee > 200000) score += 25;
  score = Math.max(0, Math.min(100, score));

  const overallRating: CapitalEfficiencyReport["overallRating"] =
    score > 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

  const narrativeBullets = [
    `Burn multiple of ${burnMultiple.toFixed(2)}x (net burn / net new ARR) is the single largest driver of this score.`,
    `Revenue per employee of $${Math.round(revenuePerEmployee).toLocaleString()} reflects organizational leverage${
      revenuePerEmployee > 200000 ? ", which is strong." : "; closing this gap would materially improve the rating."
    }`,
    `LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x and a ${paybackPeriodMonths.toFixed(1)}-month payback period ${
      unitEconomics.ltvCacRatio > 3 && paybackPeriodMonths < 18 ? "both support capital-efficient growth." : "both constrain the rating today."
    }`,
  ];

  return {
    burnMultiple,
    revenuePerEmployee,
    costPerAcquisition,
    paybackPeriodMonths,
    engineeringEfficiency,
    overallRating,
    narrativeBullets,
    score,
  };
}
