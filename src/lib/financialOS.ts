// A. Driver-based financial model — the single source of truth.
//
// Design contract:
//  - Every driver lives in `assumptions` (src/lib/assumptions.ts). This file
//    never hardcodes a growth rate, churn number, comp inflation figure, etc.
//  - P&L / cash are DERIVED from (1) actual `financial_events`, and
//    (2) assumption-driven projections for future months.
//  - Reconciliation ties derived historical P&L to an independent ledger-close
//    table (`reported_actuals`) to the cent (tolerance documented below).
//  - Runway/burn are reported as distributions (p10/p50/p90), never points.
import { db } from "@/db";
import { financialEvents, reportedActuals, covenants } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { explain, type Explain } from "@/lib/explain";
import { num, round2, monthKey, addMonths, isoDate } from "@/lib/format";
import { assumptionsAsMap } from "@/lib/assumptions";
import { runMonteCarlo, distributionSummary, tornadoSensitivity, type DriverRange } from "@/lib/simulation";
import { decomposeRevenueVariance, decomposeCostVariance } from "@/lib/causal";

export const RECONCILIATION_TOLERANCE_CENTS = 0.01;

export type MonthlyLine = { month: string; category: string; amount: number };

async function actualEvents() {
  return db.select().from(financialEvents).where(eq(financialEvents.source, "actual")).orderBy(asc(financialEvents.eventDate));
}

/** Aggregates raw ledger lines into a month x category P&L. This IS the derivation step. */
export async function derivedHistoricalPnL(): Promise<MonthlyLine[]> {
  const rows = await actualEvents();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.category === "headcount") continue; // non-dollar metric, excluded from P&L
    const key = `${monthKey(r.eventDate)}::${r.category}`;
    map.set(key, round2((map.get(key) ?? 0) + num(r.amount)));
  }
  return [...map.entries()].map(([key, amount]) => {
    const [month, category] = key.split("::");
    return { month, category, amount };
  });
}

/**
 * Cash balance is a derived running total of every dollar-denominated actual
 * event (revenue, cogs, salaries, opex_other, one_time, financing) up to and
 * including the given month — including the seeded "opening cash balance"
 * financing event. No hardcoded cash figure lives in this file.
 */
export async function cashBalanceThroughMonth(month: string): Promise<number> {
  const rows = await actualEvents();
  let total = 0;
  for (const r of rows) {
    if (r.category === "headcount") continue;
    if (monthKey(r.eventDate) <= month) total += num(r.amount);
  }
  return round2(total);
}

/** Month -> net headcount at month end, derived from category='headcount' actual events. */
export async function derivedHeadcountByMonth(): Promise<Record<string, number>> {
  const rows = await actualEvents();
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.category !== "headcount") continue;
    map[monthKey(r.eventDate)] = num(r.amount);
  }
  return map;
}

export type ReconciliationRow = {
  month: string;
  category: string;
  derived: number;
  reported: number;
  diff: number;
  withinTolerance: boolean;
};

/**
 * Acceptance gate (1): model output vs seeded historicals ties out to the cent.
 * `reported_actuals` represents the independent ledger close; in a production
 * deployment that table is populated by the accounting system / ERP export,
 * not by this model — here it is seeded alongside the raw events so the
 * aggregation *logic* itself is what gets proven correct.
 */
export async function reconcile(): Promise<Explain<{ pass: boolean; rows: ReconciliationRow[] }>> {
  const derived = await derivedHistoricalPnL();
  const reportedRows = await db.select().from(reportedActuals);

  const derivedMap = new Map(derived.map((d) => [`${d.month}::${d.category}`, d.amount]));
  const reportedMap = new Map(reportedRows.map((r) => [`${monthKey(r.periodMonth)}::${r.category}`, num(r.amount)]));

  const keys = new Set([...derivedMap.keys(), ...reportedMap.keys()]);
  const rows: ReconciliationRow[] = [...keys].sort().map((key) => {
    const [month, category] = key.split("::");
    const d = derivedMap.get(key) ?? 0;
    const r = reportedMap.get(key) ?? 0;
    const diff = round2(d - r);
    return { month, category, derived: d, reported: r, diff, withinTolerance: Math.abs(diff) <= RECONCILIATION_TOLERANCE_CENTS };
  });

  const pass = rows.every((r) => r.withinTolerance);

  return explain(
    { pass, rows },
    {
      confidence: 1,
      method: `sum(financial_events where source='actual') grouped by month+category, compared to reported_actuals, tolerance $${RECONCILIATION_TOLERANCE_CENTS}`,
      evidence: rows.map((r) => ({ table: "financial_events/reported_actuals", id: `${r.month}:${r.category}` })),
      assumptionsUsed: [],
      caveats: pass ? [] : ["One or more month/category pairs exceed the reconciliation tolerance — treat forecast outputs built on this history as suspect until resolved."],
    },
  );
}

/* ----------------------------- Forward model ----------------------------- */

type Assumptions = Awaited<ReturnType<typeof assumptionsAsMap>>;

function anchorMonth(derived: MonthlyLine[]) {
  const months = [...new Set(derived.map((d) => d.month))].sort();
  return months[months.length - 1];
}

function sumAt(derived: MonthlyLine[], month: string, category: string) {
  return derived.filter((d) => d.month === month && d.category === category).reduce((a, b) => a + b.amount, 0);
}

/**
 * Deterministic monthly projection for a GIVEN scalar setting of every driver
 * (either all "base", or a Monte Carlo sample, or a tornado low/high probe).
 * Revenue events also carry a price/units split so later variance decomposition
 * is possible without re-deriving history.
 */
export function projectMonths(
  anchor: { revenue: number; cogs: number; salaries: number; opexOther: number; cash: number; headcount: number; unitPrice: number; units: number },
  drivers: Record<string, number>,
  monthsAhead: number,
): { month: number; revenue: number; cogs: number; salaries: number; opexOther: number; netCashFlow: number; cash: number; headcount: number }[] {
  const out = [];
  let { revenue, cogs, salaries, opexOther, cash, headcount, unitPrice, units } = anchor;
  const growth = drivers["revenue_growth_monthly"] ?? 0;
  const churn = drivers["gross_churn_monthly"] ?? 0;
  const priceAnnual = drivers["price_increase_annual"] ?? 0;
  const priceMonthly = priceAnnual / 12;
  const compAnnual = drivers["comp_inflation_annual"] ?? 0;
  const compMonthly = compAnnual / 12;
  const netAdds = drivers["hiring_plan_net_adds_monthly"] ?? 0;
  const costPerHead = drivers["fully_loaded_cost_per_head_monthly"] ?? salaries / Math.max(headcount, 1);
  const cogsPct = drivers["cogs_pct_of_revenue"] ?? (anchor.revenue !== 0 ? Math.abs(cogs) / anchor.revenue : 0);
  const opexGrowth = drivers["opex_other_growth_monthly"] ?? 0;
  const paymentTermsDays = drivers["payment_terms_days"] ?? 30;

  for (let m = 1; m <= monthsAhead; m++) {
    units = units * (1 + growth - churn);
    unitPrice = unitPrice * (1 + priceMonthly);
    revenue = round2(units * unitPrice);
    cogs = round2(-Math.abs(revenue) * cogsPct);
    headcount = Math.max(0, headcount + netAdds);
    salaries = round2(-(headcount * costPerHead * (1 + compMonthly * m)));
    opexOther = round2(opexOther * (1 + opexGrowth));
    // Working-capital drag: a longer collection cycle delays cash from revenue growth.
    const wcDrag = round2(-(revenue - revenue / (1 + growth - churn || 1)) * (paymentTermsDays / 30) * 0.5);
    const netCashFlow = round2(revenue + cogs + salaries + opexOther + wcDrag);
    cash = round2(cash + netCashFlow);
    out.push({ month: m, revenue, cogs, salaries, opexOther, netCashFlow, cash, headcount });
  }
  return out;
}

async function getAnchor() {
  const derived = await derivedHistoricalPnL();
  const headcountByMonth = await derivedHeadcountByMonth();
  const month = anchorMonth(derived);
  const revenueRows = (await actualEvents()).filter((r) => r.category === "revenue" && monthKey(r.eventDate) === month);
  const units = revenueRows.reduce((a, r) => a + num(r.units ?? 0), 0);
  const revenueTotal = revenueRows.reduce((a, r) => a + num(r.amount), 0);
  const unitPrice = units > 0 ? revenueTotal / units : num(revenueRows[0]?.unitPrice ?? 1);
  const cash0 = await cashBalanceThroughMonth(month);
  return {
    month,
    revenue: sumAt(derived, month, "revenue"),
    cogs: sumAt(derived, month, "cogs"),
    salaries: sumAt(derived, month, "salaries"),
    opexOther: sumAt(derived, month, "opex_other"),
    cash: cash0,
    headcount: headcountByMonth[month] ?? 0,
    unitPrice,
    units,
  };
}

function driverRangesFromAssumptions(a: Assumptions, keys: string[]): DriverRange[] {
  return keys.filter((k) => a[k]).map((k) => ({ key: k, low: a[k].low, base: a[k].base, high: a[k].high }));
}

const RUNWAY_DRIVER_KEYS = [
  "revenue_growth_monthly",
  "gross_churn_monthly",
  "price_increase_annual",
  "comp_inflation_annual",
  "hiring_plan_net_adds_monthly",
  "fully_loaded_cost_per_head_monthly",
  "cogs_pct_of_revenue",
  "opex_other_growth_monthly",
  "payment_terms_days",
];

/** Base-case (point) forecast, for the board pack narrative and charts. */
export async function baseForecast(monthsAhead = 12) {
  const anchor = await getAnchor();
  const a = await assumptionsAsMap();
  const baseDrivers: Record<string, number> = {};
  for (const k of RUNWAY_DRIVER_KEYS) if (a[k]) baseDrivers[k] = a[k].base;
  return { anchor, months: projectMonths(anchor, baseDrivers, monthsAhead) };
}

/** C/A acceptance: runway as a distribution via Monte Carlo over driver ranges. */
export async function runwayDistribution(trials = 2000, horizonMonths = 36, seed = 7): Promise<Explain<{ p10: number; p50: number; p90: number; mean: number; censoredPct: number }>> {
  const anchor = await getAnchor();
  const a = await assumptionsAsMap();
  const drivers = driverRangesFromAssumptions(a, RUNWAY_DRIVER_KEYS);

  let censored = 0;
  const runwayMonths = runMonteCarlo(
    trials,
    drivers,
    (sample) => {
      const months = projectMonths(anchor, sample, horizonMonths);
      const zeroIdx = months.findIndex((m) => m.cash <= 0);
      if (zeroIdx === -1) {
        censored++;
        return horizonMonths; // never runs out within horizon — reported as censored
      }
      return months[zeroIdx].month;
    },
    seed,
  );

  const summary = distributionSummary(runwayMonths);
  return explain(
    { ...summary, censoredPct: censored / trials },
    {
      confidence: 0.7,
      method: `Monte Carlo, ${trials} trials, triangular(low/base/high) per driver, seed=${seed}, horizon=${horizonMonths}mo`,
      drivers: drivers.map((d) => ({ name: d.key, contribution: d.high - d.low, direction: "neutral", assumptionKey: d.key })),
      assumptionsUsed: RUNWAY_DRIVER_KEYS,
      caveats: [
        "Parameter-uncertainty Monte Carlo: each trial samples one trajectory-wide value per driver (no month-to-month re-sampling).",
        censored / trials > 0.05 ? `${Math.round((censored / trials) * 100)}% of trials never exhausted cash within the ${horizonMonths}-month horizon and are right-censored at that value — p90 may understate true runway.` : "",
      ].filter(Boolean),
    },
  );
}

/** Adversarial self-review Q1: which assumption dominates the runway forecast, tornado'd. */
export async function runwayTornado(): Promise<Explain<{ key: string; label: string; owner: string; low: number; high: number; swingMonths: number }[]>> {
  const anchor = await getAnchor();
  const a = await assumptionsAsMap();
  const drivers = driverRangesFromAssumptions(a, RUNWAY_DRIVER_KEYS);
  const horizonMonths = 36;

  const metric = (overrides: Record<string, number>) => {
    const months = projectMonths(anchor, overrides, horizonMonths);
    const zeroIdx = months.findIndex((m) => m.cash <= 0);
    return zeroIdx === -1 ? horizonMonths : zeroIdx + 1;
  };

  const sens = tornadoSensitivity(drivers, metric);
  const rows = sens.map((s) => ({
    key: s.key,
    label: a[s.key]?.label ?? s.key,
    owner: a[s.key]?.owner ?? "unassigned",
    low: s.low,
    high: s.high,
    swingMonths: round2(s.swing),
  }));

  return explain(rows, {
    confidence: 0.85,
    method: "one-at-a-time sensitivity: perturb each driver to its low/high bound, hold others at base, measure runway swing in months",
    assumptionsUsed: RUNWAY_DRIVER_KEYS,
    evidence: [],
    caveats: ["Does not capture interaction effects between drivers moving together (see Monte Carlo distribution for that)."],
  });
}

/* ------------------------------ Variance ------------------------------- */

export type MonthVariance = {
  month: string;
  revenue: Explain<ReturnType<typeof decomposeRevenueVarianceSync>>;
  cost: Explain<ReturnType<typeof decomposeCostVarianceSync>>;
};
function decomposeRevenueVarianceSync(x: ReturnType<typeof decomposeRevenueVariance>["value"]) { return x; }
function decomposeCostVarianceSync(x: ReturnType<typeof decomposeCostVariance>["value"]) { return x; }

/** Plan-vs-actual variance analysis that drills to root cause (price/volume, headcount/comp). */
export async function varianceAnalysis(month: string) {
  const a = await assumptionsAsMap();
  const rows = await actualEvents();
  const headcountByMonth = await derivedHeadcountByMonth();

  const months = [...new Set(rows.map((r) => monthKey(r.eventDate)))].sort();
  const idx = months.indexOf(month);
  if (idx <= 0) return null; // no prior month to build a counterfactual plan from
  const prevMonth = months[idx - 1];

  const revRows = rows.filter((r) => r.category === "revenue" && monthKey(r.eventDate) === month);
  const prevRevRows = rows.filter((r) => r.category === "revenue" && monthKey(r.eventDate) === prevMonth);
  const actualUnits = revRows.reduce((s, r) => s + num(r.units ?? 0), 0);
  const actualRevenue = revRows.reduce((s, r) => s + num(r.amount), 0);
  const actualPrice = actualUnits > 0 ? actualRevenue / actualUnits : 0;
  const prevUnits = prevRevRows.reduce((s, r) => s + num(r.units ?? 0), 0);
  const prevRevenue = prevRevRows.reduce((s, r) => s + num(r.amount), 0);
  const prevPrice = prevUnits > 0 ? prevRevenue / prevUnits : 0;

  const growth = a["revenue_growth_monthly"]?.base ?? 0;
  const churn = a["gross_churn_monthly"]?.base ?? 0;
  const priceMonthly = (a["price_increase_annual"]?.base ?? 0) / 12;

  const planVolume = prevUnits * (1 + growth - churn);
  const planPrice = prevPrice * (1 + priceMonthly);

  const revenueVariance = decomposeRevenueVariance({ planPrice, actualPrice, planVolume, actualVolume: actualUnits });

  const actualHeadcount = headcountByMonth[month] ?? 0;
  const prevHeadcount = headcountByMonth[prevMonth] ?? 0;
  const salariesRows = rows.filter((r) => r.category === "salaries" && monthKey(r.eventDate) === month);
  const prevSalariesRows = rows.filter((r) => r.category === "salaries" && monthKey(r.eventDate) === prevMonth);
  const actualSalaries = Math.abs(salariesRows.reduce((s, r) => s + num(r.amount), 0));
  const prevSalaries = Math.abs(prevSalariesRows.reduce((s, r) => s + num(r.amount), 0));
  const actualCostPerHead = actualHeadcount > 0 ? actualSalaries / actualHeadcount : 0;
  const prevCostPerHead = prevHeadcount > 0 ? prevSalaries / prevHeadcount : 0;
  const compMonthly = (a["comp_inflation_annual"]?.base ?? 0) / 12;
  const netAdds = a["hiring_plan_net_adds_monthly"]?.base ?? 0;

  const planHeadcount = prevHeadcount + netAdds;
  const planCostPerHead = prevCostPerHead * (1 + compMonthly);

  const costVariance = decomposeCostVariance({
    planHeadcount,
    actualHeadcount,
    planCostPerHead,
    actualCostPerHead,
  });

  return { month, prevMonth, revenueVariance, costVariance };
}

/* ------------------------- Fundraising / covenants ----------------------- */

export async function fundraisingReadiness() {
  const runway = await runwayDistribution(1500, 36, 11);
  const a = await assumptionsAsMap();
  const comfortMonths = a["min_runway_months_board_comfort"]?.base ?? 12;
  const status: "ready" | "plan-now" | "urgent" = runway.value.p50 >= comfortMonths * 1.3 ? "ready" : runway.value.p50 >= comfortMonths ? "plan-now" : "urgent";
  return explain(
    { status, p50RunwayMonths: runway.value.p50, comfortThresholdMonths: comfortMonths },
    {
      confidence: runway.confidence,
      method: "p50 runway vs board-comfort threshold assumption",
      assumptionsUsed: ["min_runway_months_board_comfort", ...runway.assumptionsUsed],
      caveats: runway.caveats,
    },
  );
}

export async function covenantHeadroom() {
  const rows = await db.select().from(covenants).where(eq(covenants.active, true));
  const runway = await runwayDistribution(1000, 36, 13);
  const forecast = await baseForecast(1);
  const latestCash = forecast.anchor.cash;

  return rows.map((c) => {
    const value = c.metric === "cash_runway_months" ? runway.value.p50 : c.metric === "min_cash" ? latestCash : 0;
    const threshold = num(c.threshold);
    const headroom = c.operator === ">=" ? value - threshold : threshold - value;
    const breached = c.operator === ">=" ? value < threshold : value > threshold;
    return explain(
      { name: c.name, metric: c.metric, value, threshold, operator: c.operator, headroom, breached },
      {
        confidence: c.metric === "cash_runway_months" ? runway.confidence : 0.95,
        method: `covenant check: ${c.metric} ${c.operator} ${threshold}`,
        assumptionsUsed: c.metric === "cash_runway_months" ? runway.assumptionsUsed : [],
        evidence: c.metric === "min_cash" ? [{ table: "financial_events", id: forecast.anchor.month }] : [],
      },
    );
  });
}
