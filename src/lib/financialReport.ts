/**
 * src/lib/financialReport.ts
 *
 * Server-only data access layer: fetches rows via Drizzle ORM and feeds them
 * into the pure functions in `financialOS.ts`. Shared by both
 * `/api/financial` and `/api/export` so the two routes never duplicate
 * aggregation logic.
 */
import { db } from "@/db";
import { financeAssumptions, financialEvents, people } from "@/db/schema";
import { desc } from "drizzle-orm";
import {
  addCostAttribution,
  classifyBurnTrend,
  computeFinancialHealthScore,
  computeMonthlyBurnStats,
  runMonteCarloRunway,
  type BurnTrend,
  type CostAttributionReport,
  type Domain,
  type FinancialEvent,
  type Person,
  type RunwayDistribution,
} from "@/lib/financialOS";

export interface FinancialIntelligenceReport {
  runway: RunwayDistribution;
  costAttribution: CostAttributionReport;
  financialHealthScore: number;
  latestPLEvent: FinancialEvent | null;
  burnTrend: BurnTrend;
  currentCashBalance: number;
  baselineMonthlyRevenue: number;
  baselineRevenueGrowthRate: number;
  monthlyBurnMean: number;
  monthlyBurnStdDev: number;
  events: FinancialEvent[];
  generatedAt: string;
}

// Sensible fallbacks so the dashboard is never empty on a fresh database.
const DEFAULT_ASSUMPTIONS = {
  currentCashBalance: 2_000_000,
  baselineMonthlyRevenue: 50_000,
  baselineRevenueGrowthRate: 0.03,
};

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value == null) return fallback;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadAssumptions() {
  const rows = await db.select().from(financeAssumptions).orderBy(desc(financeAssumptions.updatedAt)).limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_ASSUMPTIONS;
  return {
    currentCashBalance: toNumber(row.currentCashBalance, DEFAULT_ASSUMPTIONS.currentCashBalance),
    baselineMonthlyRevenue: toNumber(row.baselineMonthlyRevenue, DEFAULT_ASSUMPTIONS.baselineMonthlyRevenue),
    baselineRevenueGrowthRate: toNumber(
      row.baselineRevenueGrowthRate,
      DEFAULT_ASSUMPTIONS.baselineRevenueGrowthRate,
    ),
  };
}

async function loadEvents(): Promise<FinancialEvent[]> {
  const rows = await db.select().from(financialEvents).orderBy(desc(financialEvents.date)).limit(500);
  return rows
    .map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      type: r.type,
      domain: r.domain as Domain | null,
      team: r.team,
      amount: toNumber(r.amount),
      description: r.description,
      category: r.category,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function loadPeople(): Promise<Person[]> {
  const rows = await db.select().from(people);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    domain: r.domain as Domain,
    team: r.team,
    monthlySalary: r.monthlySalary == null ? null : toNumber(r.monthlySalary),
    active: r.active,
  }));
}

export interface ExecutiveWeeklyReport {
  weekEnding: string;
  orgHealthScore: number;
  top3Risks: string[];
  financialSnapshot: {
    runwayP50Months: number;
    runwayRangeMonths: [number, number];
    probabilityRunwayAbove18Months: number;
    monthlyBurnMean: number;
    totalMonthlyHeadcountCost: number;
    burnTrend: BurnTrend;
    financialHealthScore: number;
  };
  peopleSnapshot: {
    totalHeadcount: number;
    headcountByDomain: Partial<Record<Domain, number>>;
    costEstimateIsPartiallyInferred: boolean;
  };
  strategicSnapshot: {
    note: string;
    pillarsAvailable: string[];
  };
  nextWeekPriorities: string[];
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function buildExecutiveWeeklyReport(
  report: FinancialIntelligenceReport,
  peopleRows: Person[],
): ExecutiveWeeklyReport {
  const risks: { text: string; severity: number }[] = [];

  if (report.runway.p50RunwayMonths < 12) {
    risks.push({
      text: `Runway is below 12 months (median ${report.runway.p50RunwayMonths.toFixed(1)} mo) — a financing event or material burn reduction is needed soon.`,
      severity: 100,
    });
  } else if (report.runway.p50RunwayMonths < 18) {
    risks.push({
      text: `Runway is below the 18-month comfort threshold (median ${report.runway.p50RunwayMonths.toFixed(1)} mo).`,
      severity: 60,
    });
  }

  if (report.burnTrend === "deteriorating") {
    risks.push({ text: "Net burn has increased >10% over the last 3 months vs. the prior 3 months.", severity: 70 });
  }

  if (report.runway.pathsBelow6Months > 0.1) {
    risks.push({
      text: `${pct(report.runway.pathsBelow6Months)} of simulated cash-flow paths hit a critical (<6 month) runway.`,
      severity: 80,
    });
  }

  const totalBurn = report.costAttribution.totalBurn;
  const topCenter = report.costAttribution.topCostCenters[0];
  if (topCenter && totalBurn > 0 && topCenter.cost / totalBurn > 0.4) {
    risks.push({
      text: `Cost is concentrated in "${topCenter.name}" (${pct(topCenter.cost / totalBurn)} of total headcount spend).`,
      severity: 40,
    });
  }

  if (risks.length === 0) {
    risks.push({ text: "No major financial risks detected this week.", severity: 0 });
  }

  const top3Risks = risks
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map((r) => r.text);

  const headcountByDomain: Partial<Record<Domain, number>> = {};
  for (const [domain, info] of Object.entries(report.costAttribution.byDomain) as [Domain, { headcount: number }][]) {
    if (info.headcount > 0) headcountByDomain[domain] = info.headcount;
  }

  const nextWeekPriorities: string[] = [];
  if (report.runway.p50RunwayMonths < 18) {
    nextWeekPriorities.push("Review hiring plan and discretionary spend to extend runway.");
  }
  if (report.burnTrend === "deteriorating") {
    nextWeekPriorities.push("Audit the top 3 cost centers driving the recent burn increase.");
  }
  if (topCenter) {
    nextWeekPriorities.push(`Review headcount plan for "${topCenter.name}" (largest cost center).`);
  }
  if (nextWeekPriorities.length === 0) {
    nextWeekPriorities.push("Maintain current spend discipline; re-run Monte Carlo runway check next week.");
  }

  return {
    weekEnding: report.generatedAt.slice(0, 10),
    orgHealthScore: report.financialHealthScore,
    top3Risks,
    financialSnapshot: {
      runwayP50Months: report.runway.p50RunwayMonths,
      runwayRangeMonths: [report.runway.p10RunwayMonths, report.runway.p90RunwayMonths],
      probabilityRunwayAbove18Months: report.runway.probabilityOfRunwayAbove18Months,
      monthlyBurnMean: report.monthlyBurnMean,
      totalMonthlyHeadcountCost: report.costAttribution.totalBurn,
      burnTrend: report.burnTrend,
      financialHealthScore: report.financialHealthScore,
    },
    peopleSnapshot: {
      totalHeadcount: peopleRows.filter((p) => p.active).length,
      headcountByDomain,
      costEstimateIsPartiallyInferred: report.costAttribution.containsEstimatedCosts,
    },
    strategicSnapshot: {
      note: "Strategic OS module is not part of this codebase slice; this section intentionally reports only what financialOS can verify.",
      pillarsAvailable: ["financial"],
    },
    nextWeekPriorities,
  };
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvExport(report: FinancialIntelligenceReport): string {
  const lines: string[] = [];

  lines.push("SECTION,EVENTS");
  lines.push(["date", "type", "domain", "team", "amount_usd", "category", "description"].join(","));
  for (const e of report.events) {
    lines.push(
      [
        csvEscape(e.date.slice(0, 10)),
        csvEscape(e.type),
        csvEscape(e.domain ?? ""),
        csvEscape(e.team ?? ""),
        csvEscape(e.amount),
        csvEscape(e.category ?? ""),
        csvEscape(e.description),
      ].join(","),
    );
  }

  lines.push("");
  lines.push("SECTION,COST_ATTRIBUTION_BY_DOMAIN");
  lines.push(["domain", "headcount", "estimated_monthly_cost_usd"].join(","));
  for (const [domain, info] of Object.entries(report.costAttribution.byDomain)) {
    if (info.headcount === 0) continue;
    lines.push([csvEscape(domain), csvEscape(info.headcount), csvEscape(info.estimatedCost.toFixed(2))].join(","));
  }

  lines.push("");
  lines.push("SECTION,METRICS");
  lines.push(["metric", "value"].join(","));
  lines.push(["current_cash_balance_usd", report.currentCashBalance.toFixed(2)].join(","));
  lines.push(["monthly_burn_mean_usd", report.monthlyBurnMean.toFixed(2)].join(","));
  lines.push(["monthly_burn_std_dev_usd", report.monthlyBurnStdDev.toFixed(2)].join(","));
  lines.push(["runway_p10_months", report.runway.p10RunwayMonths.toFixed(1)].join(","));
  lines.push(["runway_p50_months", report.runway.p50RunwayMonths.toFixed(1)].join(","));
  lines.push(["runway_p90_months", report.runway.p90RunwayMonths.toFixed(1)].join(","));
  lines.push(["probability_runway_above_12mo", report.runway.probabilityOfRunwayAbove12Months.toFixed(3)].join(","));
  lines.push(["probability_runway_above_18mo", report.runway.probabilityOfRunwayAbove18Months.toFixed(3)].join(","));
  lines.push(["paths_below_6mo_fraction", report.runway.pathsBelow6Months.toFixed(3)].join(","));
  lines.push(["burn_trend", report.burnTrend].join(","));
  lines.push(["financial_health_score", report.financialHealthScore].join(","));
  lines.push(["total_monthly_headcount_cost_usd", report.costAttribution.totalBurn.toFixed(2)].join(","));

  return lines.join("\n");
}

export async function getFinancialIntelligenceReport(
  overrides: {
    monthlyBurnMeanMultiplier?: number;
    revenueGrowthRateOverride?: number;
    headcountDelta?: number;
  } = {},
): Promise<FinancialIntelligenceReport> {
  const [assumptions, events, peopleRows] = await Promise.all([loadAssumptions(), loadEvents(), loadPeople()]);

  const burnStats = computeMonthlyBurnStats(events);
  const costAttribution = addCostAttribution(events, peopleRows);

  const averageCostPerHead =
    costAttribution.totalBurn > 0 && peopleRows.length > 0 ? costAttribution.totalBurn / peopleRows.filter((p) => p.active).length : 12_000;

  const headcountDelta = overrides.headcountDelta ?? 0;
  const burnMultiplier = overrides.monthlyBurnMeanMultiplier ?? 1;

  const effectiveBurnMean = Math.max(0, burnStats.mean * burnMultiplier + headcountDelta * averageCostPerHead);
  const effectiveGrowthRate = overrides.revenueGrowthRateOverride ?? assumptions.baselineRevenueGrowthRate;

  const runway = runMonteCarloRunway(
    assumptions.currentCashBalance,
    effectiveBurnMean,
    burnStats.stdDev,
    assumptions.baselineMonthlyRevenue,
    effectiveGrowthRate,
    5000,
    42,
  );

  const burnTrend = classifyBurnTrend(events);
  const financialHealthScore = computeFinancialHealthScore(runway, burnTrend);

  const latestPLEvent = events.filter((e) => e.type === "pl_summary").sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;

  return {
    runway,
    costAttribution,
    financialHealthScore,
    latestPLEvent,
    burnTrend,
    currentCashBalance: assumptions.currentCashBalance,
    baselineMonthlyRevenue: assumptions.baselineMonthlyRevenue,
    baselineRevenueGrowthRate: assumptions.baselineRevenueGrowthRate,
    monthlyBurnMean: burnStats.mean,
    monthlyBurnStdDev: burnStats.stdDev,
    events,
    generatedAt: new Date().toISOString(),
  };
}
