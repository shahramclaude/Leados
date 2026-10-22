// Part 08 — the board-approved plan/budget, independent of both "actual"
// (seedData.ts / costBridge.ts) and "forecast" (driverForecasts.ts output).
// A real company sets this once per fiscal year; here it is a deterministic
// linear/step trajectory spanning the full model timeline so variance
// decomposition (actual vs plan) and forward budget tracking (forecast vs
// plan) both have something real to compare against.

import { TOTAL_MONTHS } from "./timeline";
import type { Department } from "@/lib/org/costBridge";
import { ORG_DEPARTMENTS, COST_PER_HEAD_MONTHLY } from "@/lib/org/costBridge";
import { clampLag } from "./financialModel";
import { STARTING_CUSTOMERS } from "./seedData";

function linear(start: number, end: number, n: number = TOTAL_MONTHS): number[] {
  return Array.from({ length: n }, (_, i) => start + ((end - start) * i) / (n - 1));
}

export const PLAN_HEADCOUNT: Record<Department, number[]> = {
  sales: linear(4, 30),
  customerSuccess: linear(2, 16),
  rnd: linear(6, 23),
  ga: linear(3, 10),
};

export function planHeadcountRounded(dept: Department): number[] {
  return PLAN_HEADCOUNT[dept].map((v) => Math.round(v));
}

export const PLAN_PRODUCTIVITY_PER_REP = linear(1.1, 1.75);
export const PLAN_WIN_RATE = linear(0.2, 0.3);
export const PLAN_CYCLE_TIME_DAYS = linear(50, 34);
export const PLAN_CHURN_RATE_MONTHLY = linear(0.022, 0.009);

export const PLAN_PRICE_CORE = (() => {
  const base = linear(640, 640);
  return base.map((v, i) => {
    if (i >= 18) return v * 1.12;
    if (i >= 9) return v * 1.06;
    return v;
  });
})();

export const PLAN_PRICE_SERVICES = linear(17000, 21000);
export const PLAN_SERVICES_PROJECTS = linear(3.5, 9);
export const PLAN_SM_PROGRAM_SPEND = linear(10000, 42000);
export const PLAN_HOSTING_COST_PER_CUSTOMER = linear(44, 24);
export const PLAN_SERVICES_COST_RATE = linear(0.55, 0.44);
export const PLAN_OTHER_GA_SPEND = linear(7200, 17500);
export const PLAN_CAPEX_MONTHLY = linear(2200, 7800);

export function planFor(series: number[], monthIndex: number): number {
  return series[Math.max(0, Math.min(series.length - 1, monthIndex))];
}

/** Board-plan cost per head: assumed ~5% below the fully-loaded actual rate
 * (plan was set before a round of wage inflation), which is what produces a
 * non-zero "rate effect" in the opex variance decomposition. */
export const PLAN_COST_PER_HEAD: Record<Department, number> = {
  sales: COST_PER_HEAD_MONTHLY.sales * 0.95,
  customerSuccess: COST_PER_HEAD_MONTHLY.customerSuccess * 0.95,
  rnd: COST_PER_HEAD_MONTHLY.rnd * 0.95,
  ga: COST_PER_HEAD_MONTHLY.ga * 0.95,
};

/** Plan trajectory for core-segment ending customers, built with the same
 * roll-forward formula `financialModel.ts` uses for actuals (new bookings
 * lagged by cycle time, minus churn), but driven entirely by plan inputs.
 * This is what makes actual-vs-plan sales variance decomposition
 * apples-to-apples (same formula, different driver inputs). */
export function planExistingCustomersCore(): number[] {
  const sales = PLAN_HEADCOUNT.sales;
  const prod = PLAN_PRODUCTIVITY_PER_REP;
  const win = PLAN_WIN_RATE;
  const cycle = PLAN_CYCLE_TIME_DAYS;
  const churn = PLAN_CHURN_RATE_MONTHLY;
  const out: number[] = [];
  let existing = STARTING_CUSTOMERS;
  for (let i = 0; i < TOTAL_MONTHS; i++) {
    const lag = clampLag(cycle[i]);
    const srcIdx = i - lag;
    const newCustomers = srcIdx >= 0 ? sales[srcIdx] * prod[srcIdx] * win[srcIdx] : 0;
    const churned = existing * churn[i];
    existing = Math.max(0, existing + newCustomers - churned);
    out.push(existing);
  }
  return out;
}

export { ORG_DEPARTMENTS };
