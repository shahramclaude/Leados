// src/lib/financialOS.ts
//
// "Financial Nervous System" — Part 5.
//
// PROVENANCE: this sandbox only contained the bare Next.js/Postgres starter
// template; none of src/lib/financialOS.ts, finIntel.ts, monteCarlo.ts,
// realOptions.ts, scenarioEngine.ts, beliefFabric.ts, or src/db/schema.ts
// tables existed before this change. This file is therefore a from-scratch
// implementation built to the Part 5 spec. Supporting primitives
// (mulberry32, hashSeed, mean, percentile, sampleStdNormal) were
// reconstructed in src/lib/monteCarlo.ts — see that file's header for their
// exact signatures and standard-textbook provenance (Box-Muller 1958,
// FNV-1a hash, mulberry32 public-domain PRNG).

import {
  mulberry32,
  hashSeed,
  mean,
  percentile,
  sampleStdNormal,
} from "./monteCarlo";
import type {
  Decision,
  FinancialEvent,
  MetricDefRecord,
  MetricValueRecord,
  MonteCarloMonthPoint,
  MonteCarloPath,
  RaiseTiming,
  RunwayDistribution,
  RunwayHistogramBucket,
  RunwayInputs,
  UnitEconomics,
  UnitEconomicsHealth,
  FundraisingReadiness,
} from "./types";

export type {
  RunwayDistribution,
  RunwayInputs,
  UnitEconomics,
  FundraisingReadiness,
} from "./types";

// =============================================================================
// A. Monte Carlo Runway Simulation
// =============================================================================
//
// MODEL: Geometric Brownian Motion (GBM) style discrete monthly step.
//
// This is the standard discrete-time approximation used to simulate a
// quantity whose percentage change each period is normally distributed
// (i.e. the quantity itself is log-normal-ish over time). It is textbook
// stochastic-process material, not derived from any file in this repo.
//
//   cashBalance_{t+1} = cashBalance_t - burnRate_t + revenue_t
//   burnRate_{t+1}    = burnRate_t * (1 + burnGrowth + eps_burn)
//                         where eps_burn ~ N(0, burnVolatility)
//   revenue_{t+1}     = revenue_t * (1 + revenueGrowth + eps_rev)
//                         where eps_rev ~ N(0, revenueVolatility)
//
// eps_burn and eps_rev are each drawn as:  Z * volatility
// where Z ~ N(0,1) comes from the Box-Muller transform (Box & Muller,
// 1958) implemented in sampleStdNormal() — see monteCarlo.ts.
//
// Reproducibility: the PRNG stream is seeded once via
// hashSeed(seedKey ?? String(cashBalance)) and fed into mulberry32(seed).
// Math.random() is never used anywhere in this module.

/** DESIGN PARAMETER defaults — not calibrated from historical data. */
const DEFAULT_BURN_GROWTH = 0.0;
const DEFAULT_BURN_VOLATILITY = 0.08; // 8% monthly stddev on burn
const DEFAULT_REVENUE_GROWTH = 0.0;
const DEFAULT_REVENUE_VOLATILITY = 0.12; // 12% monthly stddev on revenue
const DEFAULT_PATHS = 5000;
const DEFAULT_MAX_MONTHS = 60;

const HISTOGRAM_BUCKETS = 24;
const HISTOGRAM_BUCKET_WIDTH_MONTHS = 2; // 24 * 2 = 48 month histogram span

function simulateSinglePath(
  pathId: number,
  rng: () => number,
  inputs: Required<
    Pick<
      RunwayInputs,
      | "cashBalance"
      | "burnRate"
      | "revenue"
      | "burnGrowth"
      | "burnVolatility"
      | "revenueGrowth"
      | "revenueVolatility"
      | "maxMonths"
    >
  >
): MonteCarloPath {
  const {
    cashBalance,
    burnRate,
    revenue,
    burnGrowth,
    burnVolatility,
    revenueGrowth,
    revenueVolatility,
    maxMonths,
  } = inputs;

  let cash = cashBalance;
  let burn = burnRate;
  let rev = revenue;

  const monthly: MonteCarloMonthPoint[] = [{ month: 0, cash, burn, revenue: rev }];
  let runwayMonth = maxMonths; // survived the full horizon unless set otherwise below

  for (let month = 1; month <= maxMonths; month++) {
    // GBM standard discrete step: cash moves first using this month's
    // burn/revenue, then burn/revenue drift+diffuse into next month.
    cash = cash - burn + rev;

    const epsBurn = sampleStdNormal(rng) * burnVolatility; // Box-Muller 1958
    const epsRev = sampleStdNormal(rng) * revenueVolatility; // Box-Muller 1958
    burn = Math.max(0, burn * (1 + burnGrowth + epsBurn));
    rev = Math.max(0, rev * (1 + revenueGrowth + epsRev));

    monthly.push({ month, cash, burn, revenue: rev });

    if (cash <= 0) {
      runwayMonth = month;
      break; // bankruptcy reached — stop simulating this path
    }
  }

  return { pathId, monthly, runwayMonth };
}

function buildHistogram(runwayMonths: number[]): RunwayHistogramBucket[] {
  const counts = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  for (const m of runwayMonths) {
    const bucket = Math.min(
      HISTOGRAM_BUCKETS - 1,
      Math.floor(Math.max(0, m) / HISTOGRAM_BUCKET_WIDTH_MONTHS)
    );
    counts[bucket] += 1;
  }
  const total = runwayMonths.length || 1;
  return counts.map((count, bucket) => ({
    bucket,
    count,
    pct: (count / total) * 100,
  }));
}

function pickRepresentativePaths(
  allPaths: MonteCarloPath[],
  targets: number[]
): MonteCarloPath[] {
  const used = new Set<number>();
  const result: MonteCarloPath[] = [];
  for (const target of targets) {
    let best: MonteCarloPath | null = null;
    let bestDiff = Infinity;
    for (const path of allPaths) {
      if (used.has(path.pathId)) continue;
      const diff = Math.abs(path.runwayMonth - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = path;
      }
    }
    if (best) {
      used.add(best.pathId);
      result.push(best);
    }
  }
  return result;
}

/**
 * runMonteCarloRunway — simulates `paths` independent GBM-style cash
 * trajectories and summarizes the resulting runway (months-to-bankruptcy)
 * distribution. See module header for the exact discrete-step formulas and
 * Box-Muller (1958) provenance.
 */
export function runMonteCarloRunway(inputs: RunwayInputs): RunwayDistribution {
  const cashBalance = inputs.cashBalance;
  const burnRate = inputs.burnRate;
  const revenue = inputs.revenue;
  const burnGrowth = inputs.burnGrowth ?? DEFAULT_BURN_GROWTH;
  const burnVolatility = inputs.burnVolatility ?? DEFAULT_BURN_VOLATILITY;
  const revenueGrowth = inputs.revenueGrowth ?? DEFAULT_REVENUE_GROWTH;
  const revenueVolatility =
    inputs.revenueVolatility ?? DEFAULT_REVENUE_VOLATILITY;
  const paths = inputs.paths ?? DEFAULT_PATHS;
  const maxMonths = inputs.maxMonths ?? DEFAULT_MAX_MONTHS;

  // Reproducibility: seed derived from a string key via hashSeed(), fed
  // into mulberry32(seed): () => number, per monteCarlo.ts.
  const seed = hashSeed(inputs.seedKey ?? String(cashBalance));
  const rng = mulberry32(seed);

  const allPaths: MonteCarloPath[] = [];
  const runwayMonths: number[] = [];

  for (let i = 0; i < paths; i++) {
    const path = simulateSinglePath(i, rng, {
      cashBalance,
      burnRate,
      revenue,
      burnGrowth,
      burnVolatility,
      revenueGrowth,
      revenueVolatility,
      maxMonths,
    });
    allPaths.push(path);
    runwayMonths.push(path.runwayMonth);
  }

  const p5 = percentile(runwayMonths, 5);
  const p10 = percentile(runwayMonths, 10);
  const p25 = percentile(runwayMonths, 25);
  const p50 = percentile(runwayMonths, 50);
  const p75 = percentile(runwayMonths, 75);
  const p90 = percentile(runwayMonths, 90);
  const p95 = percentile(runwayMonths, 95);

  const probabilityCritical =
    runwayMonths.filter((m) => m < 6).length / runwayMonths.length;
  const probabilityComfortable =
    runwayMonths.filter((m) => m > 18).length / runwayMonths.length;

  const histogram = buildHistogram(runwayMonths);

  // 5 representative paths for visualization, matched by closeness of
  // their individual runwayMonth to each percentile's value.
  const topPaths = pickRepresentativePaths(allPaths, [p10, p25, p50, p75, p90]);

  return {
    p5,
    p10,
    p25,
    p50,
    p75,
    p90,
    p95,
    mean: mean(runwayMonths),
    probabilityCritical,
    probabilityComfortable,
    histogram,
    topPaths,
    seed,
  };
}

// =============================================================================
// B. Unit Economics
// =============================================================================
//
// UNITS/ASSUMPTIONS (DESIGN ASSUMPTIONS, documented explicitly because the
// underlying metric store is a generic key/value time series with no
// enforced unit metadata):
//   - 'gross_margin' is stored as a percentage (0-100).
//   - 'churn_rate' is stored as a monthly fraction (0-1), e.g. 0.04 = 4%.
//   - 'cac', 'ltv', 'monthly_revenue', 'net_burn', 'new_arr' are stored in
//     the same currency unit (assumed USD).
//   - 'customer_count' is a unit count.

function latestValue(
  metricValues: MetricValueRecord[],
  key: string
): number | null {
  const series = metricValues
    .filter((v) => v.metricKey === key)
    .sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
  if (series.length === 0) return null;
  return series[series.length - 1].value;
}

function sortedSeries(
  metricValues: MetricValueRecord[],
  key: string
): MetricValueRecord[] {
  return metricValues
    .filter((v) => v.metricKey === key)
    .sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
}

/**
 * computeUnitEconomics — derives standard SaaS unit-economics metrics from
 * the generic metric_values time series. `events` and `metricDefs` are
 * accepted per the Part 5 spec for forward compatibility (e.g. future
 * cohort-level event derivations and unit/label metadata) but the current
 * computation only strictly requires `metricValues`.
 */
export function computeUnitEconomics(
  events: FinancialEvent[],
  metricValues: MetricValueRecord[],
  metricDefs: MetricDefRecord[]
): UnitEconomics {
  // `events` and `metricDefs` are reserved for richer derivations (e.g.
  // cohort expansion events, unit-aware formatting) in later parts; the
  // references below keep them "used" without changing behavior today.
  void events;
  void metricDefs;

  const cac = latestValue(metricValues, "cac");
  const ltvExplicit = latestValue(metricValues, "ltv");
  const grossMargin = latestValue(metricValues, "gross_margin");
  const monthlyRevenue = latestValue(metricValues, "monthly_revenue");
  const customerCount = latestValue(metricValues, "customer_count");
  const churnRate = latestValue(metricValues, "churn_rate");
  const netBurn = latestValue(metricValues, "net_burn");
  const newArr = latestValue(metricValues, "new_arr");

  const arpu =
    monthlyRevenue !== null && customerCount !== null && customerCount > 0
      ? monthlyRevenue / customerCount
      : null;

  // LTV fallback formula (used only when no explicit 'ltv' metric value
  // exists): LTV = ARPU * grossMargin% / churnRate. This is a standard,
  // widely-published SaaS approximation (e.g. "SaaS Metrics 2.0" style
  // formulas), not derived from any file in this repo.
  let ltv = ltvExplicit;
  if (
    ltv === null &&
    arpu !== null &&
    grossMargin !== null &&
    churnRate !== null &&
    churnRate > 0
  ) {
    ltv = (arpu * (grossMargin / 100)) / churnRate;
  }

  const ltvCacRatio = ltv !== null && cac !== null && cac > 0 ? ltv / cac : null;

  // paybackMonths = CAC / (monthly revenue per customer), per spec.
  const paybackMonths =
    cac !== null && arpu !== null && arpu > 0 ? cac / arpu : null;

  const burnMultiple =
    netBurn !== null && newArr !== null && newArr > 0 ? netBurn / newArr : null;

  // Revenue growth rate for Rule of 40: DESIGN ASSUMPTION — Rule of 40
  // classically uses YoY growth; with only a monthly time series available
  // we approximate an annualized rate by compounding the latest
  // month-over-month delta. This is an explicit simplification.
  const revenueSeries = sortedSeries(metricValues, "monthly_revenue");
  let revenueGrowthRatePct: number | null = null;
  if (revenueSeries.length >= 2) {
    const prev = revenueSeries[revenueSeries.length - 2].value;
    const latest = revenueSeries[revenueSeries.length - 1].value;
    if (prev > 0) {
      const momGrowth = latest / prev - 1;
      revenueGrowthRatePct = (Math.pow(1 + momGrowth, 12) - 1) * 100;
    }
  }

  const ruleOf40Score =
    revenueGrowthRatePct !== null && grossMargin !== null
      ? revenueGrowthRatePct + grossMargin
      : null;

  // Net revenue retention: DESIGN ASSUMPTION — no 'nrr' metric is in the
  // required key list, so we approximate NRR purely from churn:
  //   NRR% = (1 - churnRate) * 100
  // This ignores expansion revenue (upsell/cross-sell) and will
  // understate true NRR for accounts expanding net of churn. Flagged
  // explicitly as a simplification, not a calibrated model.
  const netRevenueRetention = churnRate !== null ? (1 - churnRate) * 100 : null;

  let unitEconomicsHealth: UnitEconomicsHealth = "unknown";
  if (ltvCacRatio !== null) {
    if (ltvCacRatio >= 3) unitEconomicsHealth = "strong";
    else if (ltvCacRatio >= 2) unitEconomicsHealth = "adequate";
    else unitEconomicsHealth = "weak";
  }

  return {
    cac,
    ltv,
    ltvCacRatio,
    paybackMonths,
    grossMargin,
    netRevenueRetention,
    arpu,
    burnMultiple,
    ruleOf40Score,
    unitEconomicsHealth,
  };
}

// =============================================================================
// C. Fundraising Readiness
// =============================================================================
//
// Every numeric coefficient below is a DESIGN PARAMETER chosen to produce a
// sensible 0-100 score shape; none of them are statistically calibrated
// against real fundraising outcomes.

const MAX_SIGNALS = 4;

export function computeFundraisingReadiness(
  runway: RunwayDistribution,
  unitEconomics: UnitEconomics,
  orgHealthScore: number,
  teamSize: number,
  recentDecisions: Decision[]
): FundraisingReadiness {
  let score = 0;
  const strengthSignals: string[] = [];
  const weaknessSignals: string[] = [];
  const diligenceRisks: string[] = [];

  // --- runway contribution --------------------------------------------
  // DESIGN PARAMETER: +20 if p50 >= 18mo, +10 if p50 in [12, 18)mo.
  if (runway.p50 >= 18) {
    score += 20;
    strengthSignals.push(
      `Median runway of ${Math.round(runway.p50)} months gives room to raise on your own timeline.`
    );
  } else if (runway.p50 >= 12) {
    score += 10;
    strengthSignals.push(
      `Median runway of ${Math.round(runway.p50)} months is workable but not abundant.`
    );
  } else {
    weaknessSignals.push(
      `Median runway is only ${Math.round(runway.p50)} months — investors will price this in.`
    );
  }

  // --- unit economics: LTV:CAC ------------------------------------------
  // DESIGN PARAMETER: +20 if ratio >= 3, +10 if ratio >= 2.
  if (unitEconomics.ltvCacRatio !== null && unitEconomics.ltvCacRatio >= 3) {
    score += 20;
    strengthSignals.push(
      `LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x clears the 3x "strong" benchmark.`
    );
  } else if (unitEconomics.ltvCacRatio !== null && unitEconomics.ltvCacRatio >= 2) {
    score += 10;
  } else if (unitEconomics.ltvCacRatio !== null) {
    weaknessSignals.push(
      `LTV:CAC of ${unitEconomics.ltvCacRatio.toFixed(1)}x is below the 3x benchmark investors look for.`
    );
    diligenceRisks.push("Unit economics (LTV:CAC) will be heavily scrutinized.");
  }

  // --- org health ---------------------------------------------------------
  // DESIGN PARAMETER: +15 if orgHealthScore >= 70.
  if (orgHealthScore >= 70) {
    score += 15;
    strengthSignals.push(`Org health score of ${orgHealthScore} signals a stable team.`);
  } else {
    diligenceRisks.push("Organizational health / team stability will be probed.");
  }

  // --- rule of 40 -----------------------------------------------------------
  // DESIGN PARAMETER: +15 if ruleOf40Score >= 40.
  if (unitEconomics.ruleOf40Score !== null && unitEconomics.ruleOf40Score >= 40) {
    score += 15;
    strengthSignals.push(
      `Rule of 40 score of ${unitEconomics.ruleOf40Score.toFixed(0)} clears the classic growth+profitability bar.`
    );
  } else if (unitEconomics.ruleOf40Score !== null) {
    weaknessSignals.push(
      `Rule of 40 score of ${unitEconomics.ruleOf40Score.toFixed(0)} is below the 40 benchmark.`
    );
  }

  // --- net revenue retention ------------------------------------------------
  // DESIGN PARAMETER: +15 if NRR >= 110%.
  if (
    unitEconomics.netRevenueRetention !== null &&
    unitEconomics.netRevenueRetention >= 110
  ) {
    score += 15;
    strengthSignals.push(
      `Net revenue retention of ${unitEconomics.netRevenueRetention.toFixed(0)}% shows the base is expanding.`
    );
  } else if (
    unitEconomics.netRevenueRetention !== null &&
    unitEconomics.netRevenueRetention < 100
  ) {
    weaknessSignals.push(
      `Net revenue retention of ${unitEconomics.netRevenueRetention.toFixed(0)}% implies net contraction.`
    );
    diligenceRisks.push("Churn / net revenue retention trend will be requested.");
  }

  // --- team size (institutional scale signal) ------------------------------
  // DESIGN PARAMETER: +5 if teamSize >= 20.
  if (teamSize >= 20) {
    score += 5;
    strengthSignals.push(`Team of ${teamSize} signals institutional scale.`);
  }

  // --- decision velocity ----------------------------------------------------
  // DESIGN PARAMETER: +10 if any recent board-level decision had a cycle
  // time under 7 days.
  const promptBoardDecisions = recentDecisions.filter(
    (d) => d.level === "board" && d.cycleTimeDays < 7
  );
  const anyBoardDecisions = recentDecisions.some((d) => d.level === "board");
  if (promptBoardDecisions.length > 0) {
    score += 10;
    strengthSignals.push(
      `${promptBoardDecisions.length} board-level decision(s) resolved in under 7 days — fast governance.`
    );
  } else if (anyBoardDecisions) {
    weaknessSignals.push(
      "Board decisions are taking longer than a week to resolve."
    );
    diligenceRisks.push("Governance / decision velocity will be probed.");
  }

  if (unitEconomics.burnMultiple !== null && unitEconomics.burnMultiple > 2) {
    weaknessSignals.push(
      `Burn multiple of ${unitEconomics.burnMultiple.toFixed(1)}x is inefficient (> 2x benchmark).`
    );
    diligenceRisks.push("Capital efficiency (burn multiple) will be questioned.");
  }

  if (runway.probabilityCritical > 0.2) {
    diligenceRisks.push(
      "Simulations show an elevated probability of running out of cash within 6 months."
    );
  }

  diligenceRisks.push(
    "Customer concentration, cohort retention, and churn drivers will be requested."
  );

  const readinessScore = Math.min(100, Math.max(0, score));

  // raiseNowOrWait — evaluated in this explicit priority order (DESIGN
  // DECISION: the spec lists these as bullet conditions; some overlap, so
  // we evaluate most-urgent/most-specific first):
  //   1. p50 < 9 months -> raise_now (no choice, survival trumps readiness)
  //   2. readinessScore >= 75 AND p50 < 18 -> raise_now
  //   3. p50 >= 36 AND readinessScore >= 70 -> no_need
  //   4. readinessScore >= 60 AND p50 < 24 -> raise_in_3_months
  //   5. readinessScore >= 40 -> raise_in_6_months
  //   6. otherwise -> not_ready
  let raiseNowOrWait: RaiseTiming;
  if (runway.p50 < 9) {
    raiseNowOrWait = "raise_now";
  } else if (readinessScore >= 75 && runway.p50 < 18) {
    raiseNowOrWait = "raise_now";
  } else if (runway.p50 >= 36 && readinessScore >= 70) {
    raiseNowOrWait = "no_need";
  } else if (readinessScore >= 60 && runway.p50 < 24) {
    raiseNowOrWait = "raise_in_3_months";
  } else if (readinessScore >= 40) {
    raiseNowOrWait = "raise_in_6_months";
  } else {
    raiseNowOrWait = "not_ready";
  }

  // optimalRaiseWindowMonths — DESIGN PARAMETER mapping from the decision
  // above to a concrete number of months from now.
  let optimalRaiseWindowMonths: number;
  switch (raiseNowOrWait) {
    case "raise_now":
      optimalRaiseWindowMonths = 0;
      break;
    case "raise_in_3_months":
      optimalRaiseWindowMonths = 3;
      break;
    case "raise_in_6_months":
      optimalRaiseWindowMonths = 6;
      break;
    case "no_need":
      optimalRaiseWindowMonths = Math.round(runway.p50);
      break;
    case "not_ready":
    default:
      optimalRaiseWindowMonths = 9;
      break;
  }

  return {
    readinessScore,
    raiseNowOrWait,
    strengthSignals: strengthSignals.slice(0, MAX_SIGNALS),
    weaknessSignals: weaknessSignals.slice(0, MAX_SIGNALS),
    optimalRaiseWindowMonths,
    diligenceRisks,
  };
}

// =============================================================================
// Aggregate scoring helper (used by the /api/financial route)
// =============================================================================

/**
 * computeFinancialHealthScore — simple additive-penalty score starting at
 * 100. Every deduction is a DESIGN PARAMETER, evaluated in this order; only
 * the single deepest matching runway penalty applies (they are mutually
 * exclusive bands), while the unit-economics and belief-posterior
 * penalties are independent and can stack.
 */
export function computeFinancialHealthScore(
  runwayP50: number,
  ltvCacRatio: number | null,
  burnMultiple: number | null,
  financialRiskPosterior: number
): number {
  let score = 100;

  if (runwayP50 < 6) {
    score -= 50; // DESIGN PARAMETER
  } else if (runwayP50 < 12) {
    score -= 30; // DESIGN PARAMETER
  } else if (runwayP50 < 18) {
    score -= 15; // DESIGN PARAMETER
  }

  if (ltvCacRatio !== null && ltvCacRatio < 1) {
    score -= 25; // DESIGN PARAMETER
  }

  if (burnMultiple !== null && burnMultiple > 3) {
    score -= 15; // DESIGN PARAMETER
  }

  if (financialRiskPosterior > 0.6) {
    score -= 10; // DESIGN PARAMETER
  }

  return Math.min(100, Math.max(0, score));
}
