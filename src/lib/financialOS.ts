// financialOS — the financial operating system: P&L, cash flow, Monte Carlo
// runway (scenario-conditioned by a hiring plan), fundraising readiness, and
// covenant/headroom tracking.
//
// Every number this module returns that depends on randomness is returned as
// a *distribution* (p10/p50/p90 + full percentile ladder), never a single
// point estimate — see `runMonteCarloRunway`. Every number is also returned
// alongside the assumptions that produced it, because these are
// decision-support simulations, not facts.
import { mulberry32, makeGaussian, summarizeDistribution, type Distribution } from "@/lib/prng";

export interface FinancialEventRecord {
  date: string; // ISO date
  type: "revenue" | "expense" | "funding" | "pl_summary";
  domain?: string | null;
  team?: string | null;
  amount: number;
  category: string;
  description?: string | null;
}

export interface FinanceAssumptions {
  currentCashBalance: number;
  baselineMonthlyRevenue: number;
  baselineRevenueGrowthRate: number;
  grossMarginPct: number;
  covenantMinCashMonths: number;
  covenantMinCashBalance: number;
}

export interface HiringPlanItem {
  role: string;
  domain: string;
  team: string;
  startMonth: string; // ISO date, first of month
  monthlyCostEstimate: number;
  headcountDelta: number;
  scenarioTag: string;
}

function monthKey(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthlyPnL {
  month: string;
  revenue: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  grossProfit: number;
  netIncome: number;
}

/** Groups raw financial ledger events into monthly P&L statements. */
export function buildMonthlyPnL(events: FinancialEventRecord[]): MonthlyPnL[] {
  const byMonth = new Map<string, MonthlyPnL>();
  for (const e of events) {
    if (e.type === "pl_summary" || e.type === "funding") continue; // informational / below-the-line
    const key = monthKey(e.date);
    if (!byMonth.has(key)) {
      byMonth.set(key, { month: key, revenue: 0, expensesByCategory: {}, totalExpenses: 0, grossProfit: 0, netIncome: 0 });
    }
    const row = byMonth.get(key)!;
    if (e.type === "revenue") {
      row.revenue += e.amount;
    } else if (e.type === "expense") {
      row.expensesByCategory[e.category] = (row.expensesByCategory[e.category] ?? 0) + e.amount;
      row.totalExpenses += e.amount;
    }
  }
  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const row of rows) {
    row.grossProfit = row.revenue; // no COGS line in the seed ledger; gross margin applied separately for unit economics
    row.netIncome = row.revenue - row.totalExpenses;
  }
  return rows;
}

export interface BurnTrend {
  trailingAvgMonthlyBurn: number;
  priorAvgMonthlyBurn: number;
  trend: "accelerating" | "stable" | "improving";
  trendPct: number;
}

/** Compares the most recent `lookback` months of net burn against the prior `lookback` months. */
export function computeBurnTrend(pnl: MonthlyPnL[], lookback = 3): BurnTrend {
  const sorted = [...pnl].sort((a, b) => a.month.localeCompare(b.month));
  const recent = sorted.slice(-lookback);
  const prior = sorted.slice(-lookback * 2, -lookback);
  const avg = (rows: MonthlyPnL[]) =>
    rows.length ? rows.reduce((s, r) => s + Math.max(0, r.totalExpenses - r.revenue), 0) / rows.length : 0;
  const trailingAvgMonthlyBurn = avg(recent);
  const priorAvgMonthlyBurn = avg(prior.length ? prior : recent);
  const trendPct = priorAvgMonthlyBurn > 0 ? (trailingAvgMonthlyBurn - priorAvgMonthlyBurn) / priorAvgMonthlyBurn : 0;
  const trend: BurnTrend["trend"] = trendPct > 0.05 ? "accelerating" : trendPct < -0.05 ? "improving" : "stable";
  return { trailingAvgMonthlyBurn, priorAvgMonthlyBurn, trend, trendPct };
}

export interface RunwayMonteCarloInput {
  currentCash: number;
  baselineMonthlyBurn: number;
  baselineMonthlyRevenue: number;
  revenueGrowthRate: number;
  burnVolatility?: number; // stddev as a fraction of monthly burn, default 0.18
  hiringPlan?: HiringPlanItem[];
  horizonMonths?: number;
  seed?: number;
  n?: number;
}

export interface RunwayMonteCarloResult {
  monthsToBankruptcy: Distribution;
  cashByMonth: { month: number; p10: number; p50: number; p90: number }[];
  bankruptcyRiskWithin12Months: number;
  assumptions: Omit<RunwayMonteCarloInput, "hiringPlan"> & { hiringPlanHeadcountDelta: number };
}

/**
 * Monte Carlo runway: burn follows geometric Brownian motion
 * (burn_{t+1} = burn_t * exp(-0.5*sigma^2 + sigma*Z)), revenue compounds at
 * `revenueGrowthRate`, and a hiring plan adds deterministic step-ups to burn
 * from each item's start month onward (headcount cost is a planning
 * decision, not a random variable — only market/execution variance is
 * stochastic here). Reproducible: same seed + inputs -> identical output.
 */
export function runMonteCarloRunway(input: RunwayMonteCarloInput): RunwayMonteCarloResult {
  const {
    currentCash,
    baselineMonthlyBurn,
    baselineMonthlyRevenue,
    revenueGrowthRate,
    burnVolatility = 0.18,
    hiringPlan = [],
    horizonMonths = 24,
    seed = 1337,
    n = 2000,
  } = input;

  const rng = mulberry32(seed);
  const gaussian = makeGaussian(rng);
  const monthsToBankruptcy: number[] = [];
  const cashPaths: number[][] = [];

  const hiringCostByMonthIndex = (monthIdx: number, startDate: Date): number => {
    let total = 0;
    for (const item of hiringPlan) {
      const start = new Date(item.startMonth);
      const monthsFromStart =
        (start.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (start.getUTCMonth() - startDate.getUTCMonth());
      if (monthIdx >= monthsFromStart) total += item.monthlyCostEstimate;
    }
    return total;
  };

  const startDate = new Date();

  for (let sim = 0; sim < n; sim++) {
    let cash = currentCash;
    let burn = baselineMonthlyBurn;
    let revenue = baselineMonthlyRevenue;
    let bankruptMonth = horizonMonths;
    let wentBankrupt = false;
    const path: number[] = [];

    for (let m = 0; m < horizonMonths; m++) {
      const z = gaussian();
      burn = burn * Math.exp(-0.5 * burnVolatility ** 2 + burnVolatility * z);
      revenue = revenue * (1 + revenueGrowthRate);
      const hiringAdd = hiringCostByMonthIndex(m, startDate);
      const netBurn = Math.max(0, burn + hiringAdd - revenue);
      cash = cash - netBurn;
      path.push(Math.max(0, cash));
      if (cash <= 0 && !wentBankrupt) {
        bankruptMonth = m + 1;
        wentBankrupt = true;
      }
    }
    monthsToBankruptcy.push(bankruptMonth);
    cashPaths.push(path);
  }

  const cashByMonth: RunwayMonteCarloResult["cashByMonth"] = [];
  for (let m = 0; m < horizonMonths; m++) {
    const valuesAtMonth = cashPaths.map((p) => p[m]);
    const sorted = [...valuesAtMonth].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    cashByMonth.push({ month: m + 1, p10: pct(10), p50: pct(50), p90: pct(90) });
  }

  const bankruptcyRiskWithin12Months = monthsToBankruptcy.filter((m) => m <= 12).length / monthsToBankruptcy.length;

  return {
    monthsToBankruptcy: summarizeDistribution(monthsToBankruptcy, seed),
    cashByMonth,
    bankruptcyRiskWithin12Months,
    assumptions: {
      currentCash,
      baselineMonthlyBurn,
      baselineMonthlyRevenue,
      revenueGrowthRate,
      burnVolatility,
      horizonMonths,
      seed,
      n,
      hiringPlanHeadcountDelta: hiringPlan.reduce((s, h) => s + h.headcountDelta, 0),
    },
  };
}

export interface FundraisingReadiness {
  score: number;
  raiseNowOrWait: "raise_now" | "wait" | "urgent";
  strengths: string[];
  weaknesses: string[];
}

/** DESIGN PARAMETER: scoring weights — runway 40pt, growth 35pt, burn discipline 25pt. */
export function computeFundraisingReadiness(
  runway: RunwayMonteCarloResult,
  revenueGrowthRate: number,
  burnTrend: BurnTrend,
): FundraisingReadiness {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const p50 = runway.monthsToBankruptcy.p50;

  if (p50 >= 18) {
    score += 40;
    strengths.push(`Median simulated runway of ${p50} months gives strong negotiating leverage.`);
  } else if (p50 >= 9) {
    score += 22;
    weaknesses.push(`Median simulated runway is ${p50} months — a raise will be time-pressured.`);
  } else {
    weaknesses.push(`Median simulated runway of ${p50} months is a critical red flag for investors.`);
  }

  if (revenueGrowthRate >= 0.06) {
    score += 35;
    strengths.push(`Revenue growth of ${(revenueGrowthRate * 100).toFixed(1)}%/mo is a strong growth story.`);
  } else if (revenueGrowthRate >= 0.02) {
    score += 18;
    weaknesses.push(`Revenue growth of ${(revenueGrowthRate * 100).toFixed(1)}%/mo is modest for a new raise.`);
  } else {
    weaknesses.push(`Revenue growth of ${(revenueGrowthRate * 100).toFixed(1)}%/mo is stalled.`);
  }

  if (burnTrend.trend === "improving") {
    score += 25;
    strengths.push("Burn is improving quarter over quarter — capital discipline reads well in diligence.");
  } else if (burnTrend.trend === "stable") {
    score += 14;
  } else {
    weaknesses.push(`Burn is accelerating (+${(burnTrend.trendPct * 100).toFixed(0)}% vs prior period) — expect diligence questions.`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const raiseNowOrWait: FundraisingReadiness["raiseNowOrWait"] = p50 < 6 ? "urgent" : score >= 65 ? "raise_now" : "wait";
  return { score, raiseNowOrWait, strengths, weaknesses };
}

export interface CovenantStatus {
  currentCash: number;
  minCashBalance: number;
  minCashMonths: number;
  headroom: number;
  headroomPct: number;
  monthsToBreachP50: number | null;
  status: "healthy" | "watch" | "breach_risk";
}

/** Tracks headroom against a simple minimum-cash covenant. */
export function computeCovenantStatus(assumptions: FinanceAssumptions, runway: RunwayMonteCarloResult): CovenantStatus {
  const headroom = assumptions.currentCashBalance - assumptions.covenantMinCashBalance;
  const headroomPct = assumptions.covenantMinCashBalance > 0 ? headroom / assumptions.covenantMinCashBalance : 1;
  const breachMonth = runway.cashByMonth.find((c) => c.p50 <= assumptions.covenantMinCashBalance);
  const monthsToBreachP50 = breachMonth ? breachMonth.month : null;
  const status: CovenantStatus["status"] =
    headroom <= 0 ? "breach_risk" : monthsToBreachP50 !== null && monthsToBreachP50 <= assumptions.covenantMinCashMonths ? "watch" : "healthy";
  return { currentCash: assumptions.currentCashBalance, minCashBalance: assumptions.covenantMinCashBalance, minCashMonths: assumptions.covenantMinCashMonths, headroom, headroomPct, monthsToBreachP50, status };
}
