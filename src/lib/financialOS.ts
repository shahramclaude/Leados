/**
 * src/lib/financialOS.ts
 *
 * Core Financial Intelligence OS domain logic. Pure functions only — no
 * database access here (that lives in `src/lib/financialReport.ts`, which
 * fetches rows and calls into this module).
 *
 * This file is organized as:
 *   1. Shared domain types (Domain, Person, FinancialEvent, BurnTrend)
 *   2. Baseline financial math (burn stats, deterministic runway, burn trend,
 *      financial health score) — the "existing" model this slice extends.
 *   3. NEW: Monte Carlo runway simulation (`runMonteCarloRunway`)
 *   4. NEW: Cost attribution by domain/team (`addCostAttribution`)
 */

import { createMersenneTwister } from "./prng";
import { compoundGrowthStep, mean, percentile, sampleStandardNormal, sampleStdDev } from "./monteCarlo";

// ---------------------------------------------------------------------------
// 1. Shared domain types
// ---------------------------------------------------------------------------

export type Domain =
  | "engineering"
  | "product"
  | "design"
  | "sales"
  | "marketing"
  | "operations"
  | "finance"
  | "people"
  | "other";

export const ALL_DOMAINS: Domain[] = [
  "engineering",
  "product",
  "design",
  "sales",
  "marketing",
  "operations",
  "finance",
  "people",
  "other",
];

export type FinancialEventType = "burn" | "revenue" | "expense" | "funding" | "pl_summary";

export interface FinancialEvent {
  id: string;
  date: string; // ISO date string
  type: FinancialEventType;
  domain: Domain | null;
  team: string | null;
  amount: number; // always a positive magnitude; direction implied by `type`
  description: string;
  category: string | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  domain: Domain;
  team: string;
  monthlySalary: number | null;
  active: boolean;
}

export type BurnTrend = "improving" | "flat" | "deteriorating";

// ---------------------------------------------------------------------------
// 2. Baseline financial math (existing model)
// ---------------------------------------------------------------------------

interface MonthlyNet {
  monthKey: string; // YYYY-MM
  netBurn: number; // outflow - inflow for that month (positive = burning cash)
}

function groupNetBurnByMonth(events: FinancialEvent[]): MonthlyNet[] {
  const byMonth = new Map<string, number>();
  for (const e of events) {
    if (e.type === "pl_summary") continue; // summary rows aren't raw cash movements
    const monthKey = e.date.slice(0, 7); // YYYY-MM
    const signed =
      e.type === "revenue" || e.type === "funding" ? -e.amount : e.amount; // inflow reduces net burn
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + signed);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([monthKey, netBurn]) => ({ monthKey, netBurn }));
}

/**
 * Computes the mean and sample standard deviation of monthly net burn over a
 * trailing lookback window, from raw ledger events. This feeds the Monte
 * Carlo simulation's burn distribution parameters.
 */
export function computeMonthlyBurnStats(
  events: FinancialEvent[],
  lookbackMonths = 6,
): { mean: number; stdDev: number; monthsObserved: number } {
  const months = groupNetBurnByMonth(events).slice(-lookbackMonths);
  const values = months.map((m) => m.netBurn);
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, monthsObserved: 0 };
  }
  return { mean: mean(values), stdDev: sampleStdDev(values), monthsObserved: values.length };
}

/** Simple deterministic runway: balance / burn. This is the naive baseline the Monte Carlo model refines. */
export function computeDeterministicRunwayMonths(currentBalance: number, monthlyBurnMean: number): number {
  if (monthlyBurnMean <= 0) return Infinity;
  return currentBalance / monthlyBurnMean;
}

/**
 * Classifies the burn trend by comparing the most recent 3 months of net
 * burn against the preceding 3 months. >10% increase = deteriorating, >10%
 * decrease = improving, otherwise flat.
 */
export function classifyBurnTrend(events: FinancialEvent[]): BurnTrend {
  const months = groupNetBurnByMonth(events);
  if (months.length < 2) return "flat";

  const recent = months.slice(-3);
  const prior = months.slice(-6, -3);
  if (prior.length === 0) return "flat";

  const recentAvg = mean(recent.map((m) => m.netBurn));
  const priorAvg = mean(prior.map((m) => m.netBurn));
  if (priorAvg === 0) return "flat";

  const changeRatio = (recentAvg - priorAvg) / Math.abs(priorAvg);
  if (changeRatio > 0.1) return "deteriorating";
  if (changeRatio < -0.1) return "improving";
  return "flat";
}

// ---------------------------------------------------------------------------
// 3. NEW: Monte Carlo runway simulation
// ---------------------------------------------------------------------------

export interface RunwayDistribution {
  p10RunwayMonths: number;
  p50RunwayMonths: number;
  p90RunwayMonths: number;
  probabilityOfRunwayAbove18Months: number;
  probabilityOfRunwayAbove12Months: number;
  pathsBelow6Months: number; // fraction in [0,1], not a percent
  histogram: { bucketMonths: number; count: number }[];
}

/** Paths that survive this long are "censored" at the cap — see note below. */
export const MAX_SIMULATED_MONTHS = 60;
const HISTOGRAM_BUCKET_SIZE_MONTHS = 3;

/**
 * Monte Carlo simulation of cash runway.
 *
 * Per simulated path, for each month until cash runs out (or the 60-month
 * cap is hit):
 *   1. Draw a standard-normal variate Z via the Box-Muller transform
 *      (see `sampleStandardNormal` in monteCarlo.ts), seeded by a Mersenne
 *      Twister PRNG (`createMersenneTwister`) so the whole simulation is
 *      reproducible given the same seed.
 *   2. Model that month's burn as an ADDITIVE GAUSSIAN NOISE process:
 *        burn_t = max(0, burnMean + Z * burnStdDev)
 *      NOTE: this is an UNVERIFIED simplification. It is not geometric
 *      Brownian motion (which models multiplicative/log-normal moves on a
 *      price-like quantity, dS = mu*S*dt + sigma*S*dW). Burn rate here is
 *      modeled as a stationary Gaussian around the trailing mean because the
 *      caller supplies burn as a (mean, stdDev) pair rather than a process
 *      with its own growth rate. This is a common, simple approximation used
 *      in startup runway calculators, not a textbook stochastic-process
 *      model — label kept here intentionally so future readers do not assume
 *      otherwise.
 *   3. Grow revenue deterministically via the COMPOUND (GEOMETRIC) GROWTH
 *      FORMULA: revenue_t = revenue_(t-1) * (1 + revenueGrowthRate). This is
 *      a standard, verifiable formula (not a simplification).
 *   4. balance -= (burn_t - revenue_t); stop when balance <= 0.
 *
 * Percentiles (p10/p50/p90) use linear interpolation of the empirical CDF
 * (see `percentile` in monteCarlo.ts, matching NumPy's default method).
 */
export function runMonteCarloRunway(
  currentBalance: number,
  monthlyBurnMean: number,
  monthlyBurnStdDev: number,
  expectedMonthlyRevenue: number,
  revenueGrowthRate: number,
  n: number = 5000,
  seed: number = 42,
): RunwayDistribution {
  const rng = createMersenneTwister(seed);
  const runways = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    let balance = currentBalance;
    let revenue = expectedMonthlyRevenue;
    let month = 0;

    while (balance > 0 && month < MAX_SIMULATED_MONTHS) {
      const z = sampleStandardNormal(rng); // Box-Muller standard normal draw
      const burnThisMonth = Math.max(0, monthlyBurnMean + z * monthlyBurnStdDev); // additive Gaussian noise model (UNVERIFIED simplification)
      revenue = compoundGrowthStep(revenue, revenueGrowthRate); // compound/geometric growth formula
      const netBurn = burnThisMonth - revenue;
      balance -= netBurn;
      month += 1;
    }

    runways[i] = month;
  }

  runways.sort((a, b) => a - b);

  const p10 = percentile(runways, 0.1);
  const p50 = percentile(runways, 0.5);
  const p90 = percentile(runways, 0.9);

  const above18 = runways.filter((m) => m >= 18).length / n;
  const above12 = runways.filter((m) => m >= 12).length / n;
  const below6 = runways.filter((m) => m < 6).length / n;

  const histogramMap = new Map<number, number>();
  for (const m of runways) {
    const bucket = Math.floor(m / HISTOGRAM_BUCKET_SIZE_MONTHS) * HISTOGRAM_BUCKET_SIZE_MONTHS;
    histogramMap.set(bucket, (histogramMap.get(bucket) ?? 0) + 1);
  }
  const histogram = Array.from(histogramMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketMonths, count]) => ({ bucketMonths, count }));

  return {
    p10RunwayMonths: p10,
    p50RunwayMonths: p50,
    p90RunwayMonths: p90,
    probabilityOfRunwayAbove18Months: above18,
    probabilityOfRunwayAbove12Months: above12,
    pathsBelow6Months: below6,
    histogram,
  };
}

/**
 * Financial health score, 0-100. Pure function so it can be shared between
 * the /api/financial route and the orchestrator.
 *
 * Formula (as specified):
 *  - start at 100
 *  - -30 if p50RunwayMonths < 12
 *  - -20 if p50RunwayMonths < 18 (and >= 12)
 *  - -15 if burnTrend === 'deteriorating'
 *  - -10 if pathsBelow6Months > 0.10
 *  - clamp to [0, 100]
 */
export function computeFinancialHealthScore(runway: RunwayDistribution, burnTrend: BurnTrend): number {
  let score = 100;

  if (runway.p50RunwayMonths < 12) {
    score -= 30;
  } else if (runway.p50RunwayMonths < 18) {
    score -= 20;
  }

  if (burnTrend === "deteriorating") {
    score -= 15;
  }

  if (runway.pathsBelow6Months > 0.1) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// 4. NEW: Cost attribution by domain / team
// ---------------------------------------------------------------------------

/**
 * UNVERIFIED ESTIMATE: role -> median fully-loaded monthly cost in USD
 * (base + ~25-30% overhead for benefits/payroll tax/tooling), derived from
 * general US tech-industry compensation ranges. This is NOT sourced from
 * this repository's data and should be treated as a rough placeholder used
 * only when a person record has no `monthlySalary` on file.
 */
export const ROLE_COST_MAP: Record<string, number> = {
  "software engineer": 14500,
  "senior software engineer": 19000,
  "staff engineer": 24000,
  "principal engineer": 27000,
  "engineering manager": 22000,
  "product manager": 17000,
  "senior product manager": 20500,
  designer: 13500,
  "senior designer": 16500,
  "data scientist": 16500,
  "data analyst": 11500,
  "sales rep": 11000,
  "account executive": 13000,
  "sales manager": 18000,
  "vp sales": 26000,
  "marketing manager": 14000,
  "marketing specialist": 10000,
  "customer support": 7000,
  "customer success manager": 11500,
  "operations manager": 15000,
  "finance analyst": 12500,
  controller: 17500,
  cfo: 30000,
  ceo: 28000,
  coo: 27000,
  cto: 29000,
  "hr manager": 13000,
  recruiter: 10500,
  "office manager": 8500,
  default: 12000,
};

function estimatePersonMonthlyCost(person: Person): number {
  if (person.monthlySalary != null && person.monthlySalary > 0) {
    return person.monthlySalary;
  }
  const key = person.role.trim().toLowerCase();
  return ROLE_COST_MAP[key] ?? ROLE_COST_MAP.default;
}

export interface CostAttributionReport {
  byDomain: Record<Domain, { headcount: number; estimatedCost: number }>;
  byTeam: Record<string, { headcount: number; estimatedCost: number }>;
  topCostCenters: { name: string; cost: number; trend: "up" | "flat" | "down" }[];
  totalBurn: number;
  /** True if at least one person's cost was estimated via ROLE_COST_MAP rather than an actual salary on file. */
  containsEstimatedCosts: boolean;
}

/**
 * Determines whether a team's spend is trending up/flat/down by comparing
 * its two most recent months of `expense`/`burn` ledger events (>5% change
 * threshold). Falls back to 'flat' when there isn't enough history.
 */
function computeTeamTrend(team: string, events: FinancialEvent[]): "up" | "flat" | "down" {
  const teamEvents = events.filter(
    (e) => e.team === team && (e.type === "expense" || e.type === "burn"),
  );
  const byMonth = new Map<string, number>();
  for (const e of teamEvents) {
    const key = e.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + e.amount);
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (months.length < 2) return "flat";

  const [, latest] = months[months.length - 1];
  const [, previous] = months[months.length - 2];
  if (previous === 0) return "flat";

  const change = (latest - previous) / previous;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

/**
 * Builds a cost attribution report: headcount + estimated monthly cost by
 * domain and by team, plus the top cost centers ranked by spend with a
 * simple month-over-month trend indicator.
 */
export function addCostAttribution(events: FinancialEvent[], people: Person[]): CostAttributionReport {
  const byDomain = {} as Record<Domain, { headcount: number; estimatedCost: number }>;
  for (const domain of ALL_DOMAINS) {
    byDomain[domain] = { headcount: 0, estimatedCost: 0 };
  }

  const byTeam: Record<string, { headcount: number; estimatedCost: number }> = {};
  let containsEstimatedCosts = false;

  for (const person of people) {
    if (!person.active) continue;

    const cost = estimatePersonMonthlyCost(person);
    if (person.monthlySalary == null || person.monthlySalary <= 0) {
      containsEstimatedCosts = true;
    }

    byDomain[person.domain].headcount += 1;
    byDomain[person.domain].estimatedCost += cost;

    const teamKey = person.team?.trim() || "Unassigned";
    if (!byTeam[teamKey]) {
      byTeam[teamKey] = { headcount: 0, estimatedCost: 0 };
    }
    byTeam[teamKey].headcount += 1;
    byTeam[teamKey].estimatedCost += cost;
  }

  const totalBurn = Object.values(byDomain).reduce((sum, d) => sum + d.estimatedCost, 0);

  const topCostCenters = Object.entries(byTeam)
    .map(([name, { estimatedCost }]) => ({
      name,
      cost: estimatedCost,
      trend: computeTeamTrend(name, events),
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  return { byDomain, byTeam, topCostCenters, totalBurn, containsEstimatedCosts };
}
