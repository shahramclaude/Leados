// Part 08 — the driver DAG for the full 3-statement model.
//
// Revenue = Sum_segments (price x volume), decomposed down to organizational
// drivers (headcount, productivity, utilization/win-rate, cycle time) via
// the Part 06 org-twin stand-in (`src/lib/org/costBridge.ts`), plus
// behavioural drivers (churn, pricing, program spend) from the seeded
// history. Two recursive-node patterns are used to avoid false DAG cycles:
//   1. `existingCustomersCore` builds its own new/churn/ending loop
//      internally; `newCustomersCore`/`churnedCustomersCore` are read-only
//      "derived readouts" that recompute the same formula from the finished
//      series (no cycle, some intentional duplication — documented here).
//   2. `ppeBalance` does the same for capex/depreciation; `depreciation` is
//      the derived readout.
//
// Every driver has two source regimes: HISTORY (actual, seeded) and
// FORECAST (EWMA + seasonality via `driverForecasts.ts`), except headcount
// which is seeded (actual) history + the org twin's hiring-plan continuation
// for forecast (headcount is a discrete plan, not a smooth behavioural
// series).

import { DagNodeDef, EvalContext } from "./dag";
import { ConfidenceClass } from "./types";
import { HISTORY_MONTHS, FORECAST_MONTHS, TOTAL_MONTHS, MONTHS } from "./timeline";
import { forecastDriver } from "./driverForecasts";
import * as seed from "./seedData";
import {
  ORG_DEPARTMENTS,
  Department,
  historyHeadcount,
  plannedHeadcountContinuation,
  COST_PER_HEAD_MONTHLY,
} from "@/lib/org/costBridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function historyPlusForecastSeries(
  history: number[],
  opts: { min?: number; max?: number } = {},
): { series: number[]; confidence: ConfidenceClass[] } {
  const forecast = forecastDriver(history, FORECAST_MONTHS, 0, opts);
  const series = [...history, ...forecast.values];
  const confidence: ConfidenceClass[] = [
    ...history.map(() => "actual" as ConfidenceClass),
    ...forecast.values.map(() => "forecast" as ConfidenceClass),
  ];
  return { series, confidence };
}

function headcountSeries(dept: Department): { series: number[]; confidence: ConfidenceClass[] } {
  const hist = historyHeadcount(dept);
  const plan = plannedHeadcountContinuation(dept, FORECAST_MONTHS);
  return {
    series: [...hist, ...plan],
    confidence: [...hist.map(() => "actual" as ConfidenceClass), ...plan.map(() => "forecast" as ConfidenceClass)],
  };
}

function constantSeries(value: number): number[] {
  return Array.from({ length: TOTAL_MONTHS }, () => value);
}

function driverNode(
  id: string,
  label: string,
  group: string,
  unit: DagNodeDef["unit"],
  data: { series: number[]; confidence: ConfidenceClass[] },
  description: string,
  relUncertainty = 0.08,
): DagNodeDef {
  return {
    id,
    label,
    type: "driver",
    group,
    unit,
    deps: [],
    description,
    relUncertainty,
    compute: () => data.series,
    confidence: () => data.confidence,
  };
}

function constantNode(
  id: string,
  label: string,
  unit: DagNodeDef["unit"],
  value: number,
  description: string,
): DagNodeDef {
  return {
    id,
    label,
    type: "constant",
    group: "assumption",
    unit,
    deps: [],
    description,
    compute: () => constantSeries(value),
  };
}

export function clampLag(cycleTimeDays: number): number {
  return Math.min(2, Math.max(0, Math.round(cycleTimeDays / 30)));
}

// ---------------------------------------------------------------------------
// Assumption constants (group "assumption")
// ---------------------------------------------------------------------------

const ASSUMPTIONS: DagNodeDef[] = [
  constantNode("taxRate", "Effective tax rate", "pct", 0.21, "Flat effective rate applied to positive pretax income only (no NOL carryforward tracking)."),
  constantNode("dsoDays", "Days sales outstanding", "days", 45, "Assumed collections cycle used to size the AR balance."),
  constantNode("dpoDays", "Days payable outstanding", "days", 30, "Assumed payment cycle used to size the AP balance."),
  constantNode("depreciationRateMonthly", "Monthly depreciation rate", "pct", 1 / 48, "Straight-line over a 48-month useful life."),
  constantNode("waccAnnual", "WACC (annual)", "pct", 0.18, "Discount rate used in the DCF bridge."),
  constantNode("terminalGrowthAnnual", "Terminal growth (annual)", "pct", 0.04, "Gordon-growth terminal value assumption."),
  constantNode("costPerHeadSales", "Fully loaded cost per Sales head / month", "usd", COST_PER_HEAD_MONTHLY.sales, "From the org cost bridge."),
  constantNode("costPerHeadCS", "Fully loaded cost per CS head / month", "usd", COST_PER_HEAD_MONTHLY.customerSuccess, "From the org cost bridge."),
  constantNode("costPerHeadRnd", "Fully loaded cost per R&D head / month", "usd", COST_PER_HEAD_MONTHLY.rnd, "From the org cost bridge."),
  constantNode("costPerHeadGa", "Fully loaded cost per G&A head / month", "usd", COST_PER_HEAD_MONTHLY.ga, "From the org cost bridge."),
  constantNode("startingCash", "Opening cash balance", "usd", seed.STARTING_CASH, "Balances the opening balance sheet exactly."),
  constantNode("startingAR", "Opening AR balance", "usd", seed.STARTING_AR, "Seed opening balance."),
  constantNode("startingAP", "Opening AP balance", "usd", seed.STARTING_AP, "Seed opening balance."),
  constantNode("startingPPE", "Opening PP&E balance", "usd", seed.STARTING_PPE, "Seed opening balance."),
  constantNode("startingPaidInCapital", "Opening paid-in capital", "usd", seed.STARTING_PAID_IN_CAPITAL, "Seed opening balance."),
  constantNode("startingRetainedEarnings", "Opening retained earnings", "usd", seed.STARTING_RETAINED_EARNINGS, "Seed opening balance (accumulated losses pre-model)."),
  constantNode("startingCustomers", "Opening core customer count", "count", seed.STARTING_CUSTOMERS, "Seed opening customer base."),
];

// ---------------------------------------------------------------------------
// Drivers (headcount from the org twin; behavioural drivers EWMA-forecast)
// ---------------------------------------------------------------------------

const DRIVERS: DagNodeDef[] = [
  ...ORG_DEPARTMENTS.map((dept) =>
    driverNode(
      `headcount_${dept}`,
      `${dept} headcount`,
      "headcount",
      "count",
      headcountSeries(dept),
      "Actual headcount history from the org cost bridge (Part 06 stand-in); forecast continues the hiring plan.",
      0.05,
    ),
  ),
  driverNode("productivityPerRep", "Productivity (deals/rep/month)", "headcount", "ratio", historyPlusForecastSeries(seed.PRODUCTIVITY_PER_REP, { min: 0.3 }), "EWMA + seasonality forecast from 24 months of actuals."),
  driverNode("winRate", "Win rate", "headcount", "pct", historyPlusForecastSeries(seed.WIN_RATE, { min: 0.05, max: 0.5 }), "EWMA + seasonality forecast from 24 months of actuals."),
  driverNode("cycleTimeDays", "Sales cycle time", "headcount", "days", historyPlusForecastSeries(seed.CYCLE_TIME_DAYS, { min: 15 }), "EWMA + seasonality forecast; used to lag bookings into closed customers."),
  driverNode("churnRateMonthly", "Monthly churn rate", "revenue", "pct", historyPlusForecastSeries(seed.CHURN_RATE_MONTHLY, { min: 0.003, max: 0.08 }), "EWMA + seasonality forecast from 24 months of actuals."),
  driverNode("priceCore", "Core platform price ($/customer/mo)", "revenue", "usd", historyPlusForecastSeries(seed.PRICE_CORE, { min: 100 }), "EWMA + seasonality forecast; captures the two historical step increases via trend/level."),
  driverNode("priceServices", "Services avg project fee", "revenue", "usd", historyPlusForecastSeries(seed.PRICE_SERVICES, { min: 1000 }), "EWMA + seasonality forecast."),
  driverNode("servicesProjects", "Services projects delivered / month", "revenue", "count", historyPlusForecastSeries(seed.SERVICES_PROJECTS, { min: 0 }), "EWMA + seasonality forecast."),
  driverNode("smProgramSpend", "S&M program spend", "cost", "usd", historyPlusForecastSeries(seed.SM_PROGRAM_SPEND, { min: 0 }), "EWMA + seasonality forecast."),
  driverNode("hostingCostPerCustomer", "Hosting cost / customer / month", "cost", "usd", historyPlusForecastSeries(seed.HOSTING_COST_PER_CUSTOMER, { min: 5 }), "EWMA + seasonality forecast."),
  driverNode("servicesCostRate", "Services delivery cost rate", "cost", "pct", historyPlusForecastSeries(seed.SERVICES_COST_RATE, { min: 0.2, max: 0.9 }), "EWMA + seasonality forecast."),
  driverNode("otherGaSpend", "Other G&A spend", "cost", "usd", historyPlusForecastSeries(seed.OTHER_GA_SPEND, { min: 0 }), "EWMA + seasonality forecast."),
  driverNode("capexMonthly", "Capex", "cost", "usd", historyPlusForecastSeries(seed.CAPEX_MONTHLY, { min: 0 }), "EWMA + seasonality forecast."),
  {
    id: "financingEvents",
    label: "Financing events (equity raised)",
    type: "driver",
    group: "cash",
    unit: "usd",
    deps: [],
    description:
      "No financing events occurred historically (bootstrapped). One future Series A is ASSERTED by leadership " +
      "for forecast month 6 ($5,000,000) — visibly marked 'asserted' until a term sheet is signed.",
    compute: () => {
      const arr = constantSeries(0);
      arr[HISTORY_MONTHS + 5] = 5_000_000;
      return arr;
    },
    confidence: () =>
      Array.from({ length: TOTAL_MONTHS }, (_, i) => (i === HISTORY_MONTHS + 5 ? "asserted" : "actual")) as ConfidenceClass[],
  },
];

// ---------------------------------------------------------------------------
// Formula nodes
// ---------------------------------------------------------------------------

function formula(
  id: string,
  label: string,
  group: string,
  unit: DagNodeDef["unit"],
  deps: string[],
  compute: (ctx: EvalContext) => number[],
  description: string,
): DagNodeDef {
  return { id, label, type: "formula", group, unit, deps, compute, description };
}

const FORMULAS: DagNodeDef[] = [
  // --- Core subscription customer roll-forward (self-contained recursion) ---
  formula(
    "existingCustomersCore",
    "Core customers (ending)",
    "revenue",
    "count",
    ["headcount_sales", "productivityPerRep", "winRate", "cycleTimeDays", "churnRateMonthly", "startingCustomers"],
    (ctx) => {
      const sales = ctx.get("headcount_sales");
      const prod = ctx.get("productivityPerRep");
      const win = ctx.get("winRate");
      const cycle = ctx.get("cycleTimeDays");
      const churn = ctx.get("churnRateMonthly");
      const starting = ctx.get("startingCustomers")[0];
      const out: number[] = [];
      let existing = starting;
      for (let i = 0; i < ctx.months.length; i++) {
        const lag = clampLag(cycle[i]);
        const srcIdx = i - lag;
        const newCustomers = srcIdx >= 0 ? sales[srcIdx] * prod[srcIdx] * win[srcIdx] : 0;
        const churned = existing * churn[i];
        existing = Math.max(0, existing + newCustomers - churned);
        out.push(existing);
      }
      return out;
    },
    "Ending core customers = prior ending + new bookings (headcount x productivity x win rate, lagged by sales cycle time) - churn (prior ending x monthly churn rate).",
  ),
  formula(
    "newCustomersCore",
    "New customers won (derived readout)",
    "revenue",
    "count",
    ["headcount_sales", "productivityPerRep", "winRate", "cycleTimeDays"],
    (ctx) => {
      const sales = ctx.get("headcount_sales");
      const prod = ctx.get("productivityPerRep");
      const win = ctx.get("winRate");
      const cycle = ctx.get("cycleTimeDays");
      return ctx.months.map((_, i) => {
        const lag = clampLag(cycle[i]);
        const srcIdx = i - lag;
        return srcIdx >= 0 ? sales[srcIdx] * prod[srcIdx] * win[srcIdx] : 0;
      });
    },
    "Read-only recomputation of the bookings formula used inside existingCustomersCore, for display/attribution.",
  ),
  formula(
    "churnedCustomersCore",
    "Customers churned (derived readout)",
    "revenue",
    "count",
    ["existingCustomersCore", "churnRateMonthly", "startingCustomers"],
    (ctx) => {
      const existing = ctx.get("existingCustomersCore");
      const churn = ctx.get("churnRateMonthly");
      const starting = ctx.get("startingCustomers")[0];
      return ctx.months.map((_, i) => {
        const prior = i === 0 ? starting : existing[i - 1];
        return prior * churn[i];
      });
    },
    "Churn = prior-month ending customers x monthly churn rate.",
  ),
  formula("revenueCore", "Core platform revenue", "revenue", "usd", ["existingCustomersCore", "priceCore"], (ctx) => {
    const c = ctx.get("existingCustomersCore");
    const p = ctx.get("priceCore");
    return c.map((v, i) => v * p[i]);
  }, "revenue = ending customers x price per customer per month (units x price)."),
  formula("revenueServices", "Services revenue", "revenue", "usd", ["servicesProjects", "priceServices"], (ctx) => {
    const v = ctx.get("servicesProjects");
    const p = ctx.get("priceServices");
    return v.map((x, i) => x * p[i]);
  }, "revenue = projects delivered x average fee per project (units x price)."),
  formula("totalRevenue", "Total revenue", "revenue", "usd", ["revenueCore", "revenueServices"], (ctx) => {
    const a = ctx.get("revenueCore");
    const b = ctx.get("revenueServices");
    return a.map((v, i) => v + b[i]);
  }, "Sum of all segment revenues: Sum_units(price x volume)."),

  // --- COGS ---
  formula("cogsHostingAmount", "Hosting COGS", "cogs", "usd", ["existingCustomersCore", "hostingCostPerCustomer"], (ctx) => {
    const c = ctx.get("existingCustomersCore");
    const r = ctx.get("hostingCostPerCustomer");
    return c.map((v, i) => v * r[i]);
  }, "Variable with customer count."),
  formula("cogsServicesDeliveryAmount", "Services delivery COGS", "cogs", "usd", ["revenueServices", "servicesCostRate"], (ctx) => {
    const r = ctx.get("revenueServices");
    const rate = ctx.get("servicesCostRate");
    return r.map((v, i) => v * rate[i]);
  }, "Variable with services revenue."),
  formula("cogsCustomerSuccessAmount", "Customer Success COGS", "cogs", "usd", ["headcount_customerSuccess", "costPerHeadCS"], (ctx) => {
    const h = ctx.get("headcount_customerSuccess");
    const c = ctx.get("costPerHeadCS");
    return h.map((v, i) => v * c[i]);
  }, "Semi-variable: headcount cost-to-serve."),
  formula("totalCogs", "Total COGS", "cogs", "usd", ["cogsHostingAmount", "cogsServicesDeliveryAmount", "cogsCustomerSuccessAmount"], (ctx) => {
    const a = ctx.get("cogsHostingAmount");
    const b = ctx.get("cogsServicesDeliveryAmount");
    const c = ctx.get("cogsCustomerSuccessAmount");
    return a.map((v, i) => v + b[i] + c[i]);
  }, "Sum of all COGS categories."),
  formula("grossProfit", "Gross profit", "statement", "usd", ["totalRevenue", "totalCogs"], (ctx) => {
    const r = ctx.get("totalRevenue");
    const c = ctx.get("totalCogs");
    return r.map((v, i) => v - c[i]);
  }, "revenue - COGS."),
  formula("grossMargin", "Gross margin %", "statement", "pct", ["grossProfit", "totalRevenue"], (ctx) => {
    const g = ctx.get("grossProfit");
    const r = ctx.get("totalRevenue");
    return g.map((v, i) => (r[i] !== 0 ? v / r[i] : 0));
  }, "grossProfit / revenue."),

  // --- Opex ---
  formula("smHeadcountAmount", "S&M headcount cost", "sm", "usd", ["headcount_sales", "costPerHeadSales"], (ctx) => {
    const h = ctx.get("headcount_sales");
    const c = ctx.get("costPerHeadSales");
    return h.map((v, i) => v * c[i]);
  }, "Sales headcount x fully loaded cost per head."),
  formula("smProgramsAmount", "S&M program spend", "sm", "usd", ["smProgramSpend"], (ctx) => ctx.get("smProgramSpend"), "Direct budget driver."),
  formula("totalSm", "Total S&M", "sm", "usd", ["smHeadcountAmount", "smProgramsAmount"], (ctx) => {
    const a = ctx.get("smHeadcountAmount");
    const b = ctx.get("smProgramsAmount");
    return a.map((v, i) => v + b[i]);
  }, "Headcount + program spend."),
  formula("rndHeadcountAmount", "Total R&D", "rnd", "usd", ["headcount_rnd", "costPerHeadRnd"], (ctx) => {
    const h = ctx.get("headcount_rnd");
    const c = ctx.get("costPerHeadRnd");
    return h.map((v, i) => v * c[i]);
  }, "R&D headcount x fully loaded cost per head."),
  formula("gaHeadcountAmount", "G&A headcount cost", "ga", "usd", ["headcount_ga", "costPerHeadGa"], (ctx) => {
    const h = ctx.get("headcount_ga");
    const c = ctx.get("costPerHeadGa");
    return h.map((v, i) => v * c[i]);
  }, "G&A headcount x fully loaded cost per head."),
  formula("gaOtherAmount", "Other G&A", "ga", "usd", ["otherGaSpend"], (ctx) => ctx.get("otherGaSpend"), "Direct budget driver."),
  formula("totalGa", "Total G&A", "ga", "usd", ["gaHeadcountAmount", "gaOtherAmount"], (ctx) => {
    const a = ctx.get("gaHeadcountAmount");
    const b = ctx.get("gaOtherAmount");
    return a.map((v, i) => v + b[i]);
  }, "Headcount + other spend."),
  formula("totalOpex", "Total opex", "statement", "usd", ["totalSm", "rndHeadcountAmount", "totalGa"], (ctx) => {
    const a = ctx.get("totalSm");
    const b = ctx.get("rndHeadcountAmount");
    const c = ctx.get("totalGa");
    return a.map((v, i) => v + b[i] + c[i]);
  }, "S&M + R&D + G&A."),
  formula("ebitda", "EBITDA", "statement", "usd", ["grossProfit", "totalOpex"], (ctx) => {
    const g = ctx.get("grossProfit");
    const o = ctx.get("totalOpex");
    return g.map((v, i) => v - o[i]);
  }, "Gross profit - total opex."),
  formula("ebitdaMargin", "EBITDA margin %", "statement", "pct", ["ebitda", "totalRevenue"], (ctx) => {
    const e = ctx.get("ebitda");
    const r = ctx.get("totalRevenue");
    return e.map((v, i) => (r[i] !== 0 ? v / r[i] : 0));
  }, "EBITDA / revenue."),

  // --- PP&E / Depreciation (self-contained recursion + derived readout) ---
  formula("ppeBalance", "PP&E (net, ending)", "statement", "usd", ["capexMonthly", "depreciationRateMonthly", "startingPPE"], (ctx) => {
    const capex = ctx.get("capexMonthly");
    const rate = ctx.get("depreciationRateMonthly");
    const starting = ctx.get("startingPPE")[0];
    const out: number[] = [];
    let ppe = starting;
    for (let i = 0; i < ctx.months.length; i++) {
      const dep = ppe * rate[i];
      ppe = Math.max(0, ppe + capex[i] - dep);
      out.push(ppe);
    }
    return out;
  }, "Ending PP&E = prior PP&E + capex - depreciation (straight-line on prior balance)."),
  formula("depreciation", "Depreciation (derived readout)", "statement", "usd", ["ppeBalance", "depreciationRateMonthly", "startingPPE"], (ctx) => {
    const ppe = ctx.get("ppeBalance");
    const rate = ctx.get("depreciationRateMonthly");
    const starting = ctx.get("startingPPE")[0];
    return ctx.months.map((_, i) => (i === 0 ? starting : ppe[i - 1]) * rate[i]);
  }, "Prior-period PP&E x monthly depreciation rate."),
  formula("ebit", "EBIT", "statement", "usd", ["ebitda", "depreciation"], (ctx) => {
    const e = ctx.get("ebitda");
    const d = ctx.get("depreciation");
    return e.map((v, i) => v - d[i]);
  }, "EBITDA - depreciation (no debt, so EBIT = pretax operating income)."),
  formula("pretaxIncome", "Pretax income", "statement", "usd", ["ebit"], (ctx) => ctx.get("ebit"), "No interest expense modeled (unlevered balance sheet)."),
  formula("taxExpense", "Tax expense", "statement", "usd", ["pretaxIncome", "taxRate"], (ctx) => {
    const p = ctx.get("pretaxIncome");
    const t = ctx.get("taxRate");
    return p.map((v, i) => (v > 0 ? v * t[i] : 0));
  }, "Flat rate on positive pretax income only; losses are not tax-effected (no NOL asset tracked)."),
  formula("netIncome", "Net income", "statement", "usd", ["pretaxIncome", "taxExpense"], (ctx) => {
    const p = ctx.get("pretaxIncome");
    const t = ctx.get("taxExpense");
    return p.map((v, i) => v - t[i]);
  }, "Pretax income - tax expense."),

  // --- Working capital & cash ---
  formula("arBalance", "Accounts receivable", "statement", "usd", ["totalRevenue", "dsoDays"], (ctx) => {
    const r = ctx.get("totalRevenue");
    const dso = ctx.get("dsoDays");
    return r.map((v, i) => (v * dso[i]) / 30);
  }, "Steady-state AR = monthly revenue x (DSO/30)."),
  formula("apBalance", "Accounts payable", "statement", "usd", ["totalCogs", "totalOpex", "dpoDays"], (ctx) => {
    const c = ctx.get("totalCogs");
    const o = ctx.get("totalOpex");
    const dpo = ctx.get("dpoDays");
    return c.map((v, i) => ((v + o[i]) * dpo[i]) / 30);
  }, "Steady-state AP = monthly (COGS + opex) x (DPO/30)."),
  formula("cfo", "Cash flow from operations", "statement", "usd", ["netIncome", "depreciation", "arBalance", "apBalance", "startingAR", "startingAP"], (ctx) => {
    const ni = ctx.get("netIncome");
    const dep = ctx.get("depreciation");
    const ar = ctx.get("arBalance");
    const ap = ctx.get("apBalance");
    const startAr = ctx.get("startingAR")[0];
    const startAp = ctx.get("startingAP")[0];
    return ctx.months.map((_, i) => {
      const priorAr = i === 0 ? startAr : ar[i - 1];
      const priorAp = i === 0 ? startAp : ap[i - 1];
      const deltaAr = ar[i] - priorAr;
      const deltaAp = ap[i] - priorAp;
      return ni[i] + dep[i] - deltaAr + deltaAp;
    });
  }, "Indirect method: net income + D&A - deltaAR + deltaAP."),
  formula("cfi", "Cash flow from investing", "statement", "usd", ["capexMonthly"], (ctx) => ctx.get("capexMonthly").map((v) => -v), "-capex."),
  formula("cff", "Cash flow from financing", "statement", "usd", ["financingEvents"], (ctx) => ctx.get("financingEvents"), "Equity raised in the period."),
  formula("cashBalance", "Cash balance (ending)", "statement", "usd", ["cfo", "cfi", "cff", "startingCash"], (ctx) => {
    const cfo = ctx.get("cfo");
    const cfi = ctx.get("cfi");
    const cff = ctx.get("cff");
    const starting = ctx.get("startingCash")[0];
    const out: number[] = [];
    let cash = starting;
    for (let i = 0; i < ctx.months.length; i++) {
      cash = cash + cfo[i] + cfi[i] + cff[i];
      out.push(cash);
    }
    return out;
  }, "Ending cash = prior cash + CFO + CFI + CFF (cash-flow identity)."),
  formula("paidInCapital", "Paid-in capital (ending)", "statement", "usd", ["cff", "startingPaidInCapital"], (ctx) => {
    const cff = ctx.get("cff");
    const starting = ctx.get("startingPaidInCapital")[0];
    const out: number[] = [];
    let v = starting;
    for (let i = 0; i < ctx.months.length; i++) {
      v += cff[i];
      out.push(v);
    }
    return out;
  }, "All financing cash flow treated as equity raised (no debt in this model)."),
  formula("retainedEarnings", "Retained earnings (ending)", "statement", "usd", ["netIncome", "startingRetainedEarnings"], (ctx) => {
    const ni = ctx.get("netIncome");
    const starting = ctx.get("startingRetainedEarnings")[0];
    const out: number[] = [];
    let v = starting;
    for (let i = 0; i < ctx.months.length; i++) {
      v += ni[i];
      out.push(v);
    }
    return out;
  }, "Accumulates net income."),
  formula("totalAssets", "Total assets", "statement", "usd", ["cashBalance", "arBalance", "ppeBalance"], (ctx) => {
    const c = ctx.get("cashBalance");
    const ar = ctx.get("arBalance");
    const ppe = ctx.get("ppeBalance");
    return c.map((v, i) => v + ar[i] + ppe[i]);
  }, "cash + AR + PP&E."),
  formula("totalLiabilities", "Total liabilities", "statement", "usd", ["apBalance"], (ctx) => ctx.get("apBalance"), "AP only (no debt)."),
  formula("totalEquity", "Total equity", "statement", "usd", ["paidInCapital", "retainedEarnings"], (ctx) => {
    const p = ctx.get("paidInCapital");
    const r = ctx.get("retainedEarnings");
    return p.map((v, i) => v + r[i]);
  }, "Paid-in capital + retained earnings."),
  formula("balanceCheck", "Balance-sheet identity check (assets - liab - equity)", "statement", "usd", ["totalAssets", "totalLiabilities", "totalEquity"], (ctx) => {
    const a = ctx.get("totalAssets");
    const l = ctx.get("totalLiabilities");
    const e = ctx.get("totalEquity");
    return a.map((v, i) => v - l[i] - e[i]);
  }, "Must be ~0 every month; reconciliation tests fail above 1 cent."),

  // --- SaaS / unit economics ---
  formula("arr", "ARR (annualized core revenue)", "unit-economics", "usd", ["revenueCore"], (ctx) => ctx.get("revenueCore").map((v) => v * 12), "Monthly core revenue x 12."),
  formula("netNewArr", "Net new ARR", "unit-economics", "usd", ["arr", "startingCustomers", "priceCore"], (ctx) => {
    const arr = ctx.get("arr");
    return ctx.months.map((_, i) => (i === 0 ? 0 : arr[i] - arr[i - 1]));
  }, "Month-over-month change in ARR."),
  formula("arpuCore", "ARPU (core, $/customer/mo)", "unit-economics", "usd", ["revenueCore", "existingCustomersCore"], (ctx) => {
    const r = ctx.get("revenueCore");
    const c = ctx.get("existingCustomersCore");
    return r.map((v, i) => (c[i] !== 0 ? v / c[i] : 0));
  }, "Core revenue / ending customers."),
  formula("cac", "CAC ($/new customer)", "unit-economics", "usd", ["smHeadcountAmount", "smProgramsAmount", "newCustomersCore"], (ctx) => {
    const h = ctx.get("smHeadcountAmount");
    const p = ctx.get("smProgramsAmount");
    const n = ctx.get("newCustomersCore");
    return ctx.months.map((_, i) => (n[i] > 0.5 ? (h[i] + p[i]) / n[i] : 0));
  }, "Total S&M spend / new customers won that month."),
  formula("ltvNode", "LTV ($, gross-profit basis)", "unit-economics", "usd", ["arpuCore", "grossMargin", "churnRateMonthly"], (ctx) => {
    const arpu = ctx.get("arpuCore");
    const gm = ctx.get("grossMargin");
    const churn = ctx.get("churnRateMonthly");
    return arpu.map((v, i) => (churn[i] > 0 ? (v * gm[i]) / churn[i] : 0));
  }, "LTV = ARPU x grossMargin / monthlyChurnRate."),
  formula("paybackMonthsNode", "CAC payback (months)", "unit-economics", "months", ["cac", "arpuCore", "grossMargin"], (ctx) => {
    const cac = ctx.get("cac");
    const arpu = ctx.get("arpuCore");
    const gm = ctx.get("grossMargin");
    return cac.map((v, i) => {
      const monthlyGp = arpu[i] * gm[i];
      return monthlyGp > 0 ? v / monthlyGp : 0;
    });
  }, "paybackMonths = CAC / (ARPU x grossMargin)."),
  formula("ltvCacRatioNode", "LTV:CAC ratio", "unit-economics", "ratio", ["ltvNode", "cac"], (ctx) => {
    const ltv = ctx.get("ltvNode");
    const cac = ctx.get("cac");
    return ltv.map((v, i) => (cac[i] > 0 ? v / cac[i] : 0));
  }, "LTV / CAC."),
  formula("magicNumberNode", "SaaS Magic Number", "unit-economics", "ratio", ["arr", "totalSm"], (ctx) => {
    const arr = ctx.get("arr");
    const sm = ctx.get("totalSm");
    return ctx.months.map((_, i) => {
      if (i < 3) return 0;
      const priorQuarterSm = sm[i - 3] + sm[i - 2] + sm[i - 1];
      if (priorQuarterSm <= 0) return 0;
      return ((arr[i] - arr[i - 3]) * 4) / priorQuarterSm;
    });
  }, "Magic Number = (ARR_now - ARR_3moAgo) x 4 / S&M spend in the prior 3 months."),

  // --- DuPont (trailing-twelve-month) ---
  formula("ttmNetIncome", "TTM net income", "dupont", "usd", ["netIncome"], (ctx) => {
    const ni = ctx.get("netIncome");
    return ctx.months.map((_, i) => ni.slice(Math.max(0, i - 11), i + 1).reduce((a, b) => a + b, 0));
  }, "Trailing 12-month sum of net income."),
  formula("ttmRevenue", "TTM revenue", "dupont", "usd", ["totalRevenue"], (ctx) => {
    const r = ctx.get("totalRevenue");
    return ctx.months.map((_, i) => r.slice(Math.max(0, i - 11), i + 1).reduce((a, b) => a + b, 0));
  }, "Trailing 12-month sum of revenue."),
  formula("netMarginTtm", "Net margin (TTM)", "dupont", "pct", ["ttmNetIncome", "ttmRevenue"], (ctx) => {
    const ni = ctx.get("ttmNetIncome");
    const r = ctx.get("ttmRevenue");
    return ni.map((v, i) => (r[i] !== 0 ? v / r[i] : 0));
  }, "TTM net income / TTM revenue."),
  formula("assetTurnoverTtm", "Asset turnover (TTM)", "dupont", "ratio", ["ttmRevenue", "totalAssets"], (ctx) => {
    const r = ctx.get("ttmRevenue");
    const a = ctx.get("totalAssets");
    return r.map((v, i) => (a[i] !== 0 ? v / a[i] : 0));
  }, "TTM revenue / total assets."),
  formula("leverageRatio", "Leverage (assets/equity)", "dupont", "ratio", ["totalAssets", "totalEquity"], (ctx) => {
    const a = ctx.get("totalAssets");
    const e = ctx.get("totalEquity");
    return a.map((v, i) => (e[i] !== 0 ? v / e[i] : 0));
  }, "Total assets / total equity."),
  formula("roeTtm", "ROE (TTM, DuPont)", "dupont", "pct", ["netMarginTtm", "assetTurnoverTtm", "leverageRatio"], (ctx) => {
    const nm = ctx.get("netMarginTtm");
    const at = ctx.get("assetTurnoverTtm");
    const lev = ctx.get("leverageRatio");
    return nm.map((v, i) => v * at[i] * lev[i]);
  }, "ROE = netMargin x assetTurnover x leverage (DuPont identity)."),

  // --- Runway / burn ---
  formula("netBurn", "Net cash burn", "cash", "usd", ["cfo", "cfi"], (ctx) => {
    const cfo = ctx.get("cfo");
    const cfi = ctx.get("cfi");
    return cfo.map((v, i) => -(v + cfi[i]));
  }, "-(CFO + CFI): cash consumed by the operating + investing business, excluding financing."),
  formula("runwayMonths", "Runway (months, 3-mo trailing burn)", "cash", "months", ["cashBalance", "netBurn"], (ctx) => {
    const cash = ctx.get("cashBalance");
    const burn = ctx.get("netBurn");
    return cash.map((c, i) => {
      const window = burn.slice(Math.max(0, i - 2), i + 1);
      const smoothed = window.reduce((a, b) => a + b, 0) / window.length;
      return smoothed > 0 ? c / smoothed : 999;
    });
  }, "cash / trailing-3-month-average net burn. Assumption: steady-state DSO collections and smoothed burn (see AI-SESSION-LOG attack notes)."),
  formula("burnMultiple", "Burn multiple", "cash", "ratio", ["netBurn", "netNewArr"], (ctx) => {
    const burn = ctx.get("netBurn");
    const nn = ctx.get("netNewArr");
    return burn.map((v, i) => (nn[i] > 0 ? v / nn[i] : 0));
  }, "netBurn / netNewARR."),
  formula("ruleOf40", "Rule of 40", "statement", "pct", ["totalRevenue", "ebitdaMargin"], (ctx) => {
    const r = ctx.get("totalRevenue");
    const margin = ctx.get("ebitdaMargin");
    return r.map((v, i) => {
      const yoy = i >= 12 && r[i - 12] > 0 ? (v - r[i - 12]) / r[i - 12] : 0;
      return yoy + margin[i];
    });
  }, "revenueGrowthYoY + EBITDAmargin."),
];

export function buildFinancialModelNodes(): DagNodeDef[] {
  return [...ASSUMPTIONS, ...DRIVERS, ...FORMULAS];
}

export { MONTHS, HISTORY_MONTHS, FORECAST_MONTHS, TOTAL_MONTHS };
