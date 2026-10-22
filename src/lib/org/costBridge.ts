// Part 06 stand-in — organizational cost bridge.
//
// Part 08 is specified to depend on "Part 06's cost bridge" and an org
// headcount twin so driver-tree nodes like headcount/productivity/
// utilization/win-rate/cycle-time can be "linked to Part 06's twin where the
// driver is organizational". That module is not present in this repository
// snapshot (fresh starter template), so this file is a minimal, clearly
// labeled stand-in: seeded, deterministic headcount-by-department history
// plus the per-head cost-category mapping the financial model needs. Replace
// with the real Part 06 org twin by swapping this module's exports — the
// financial model only imports `ORG_DEPARTMENTS`, `historyHeadcount`, and
// `COST_PER_HEAD_MONTHLY`.

import { HISTORY_MONTHS } from "@/lib/finance/timeline";
import { mulberry32 } from "@/lib/finance/montecarlo";

export type Department = "sales" | "customerSuccess" | "rnd" | "ga";

export const ORG_DEPARTMENTS: Department[] = ["sales", "customerSuccess", "rnd", "ga"];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  sales: "Sales",
  customerSuccess: "Customer Success",
  rnd: "R&D / Engineering",
  ga: "G&A",
};

/** Fully loaded monthly cost per head (salary + benefits + tools), by dept. */
export const COST_PER_HEAD_MONTHLY: Record<Department, number> = {
  sales: 11500,
  customerSuccess: 8500,
  rnd: 13500,
  ga: 10000,
};

/** Which P&L cost category each department's spend rolls up to. Sales
 * headcount cost sits in S&M; CS sits in COGS (cost to serve); R&D sits in
 * R&D; G&A sits in G&A. This is the "bridge" from org structure to the
 * income statement cost lines. */
export const DEPARTMENT_PNL_LINE: Record<Department, "cogs" | "sm" | "rnd" | "ga"> = {
  sales: "sm",
  customerSuccess: "cogs",
  rnd: "rnd",
  ga: "ga",
};

interface HeadcountPlan {
  start: number;
  end: number; // target at end of history (month index HISTORY_MONTHS-1)
  noiseSeed: number;
}

const HEADCOUNT_PLAN: Record<Department, HeadcountPlan> = {
  sales: { start: 4, end: 18, noiseSeed: 101 },
  customerSuccess: { start: 2, end: 10, noiseSeed: 102 },
  rnd: { start: 6, end: 16, noiseSeed: 103 },
  ga: { start: 3, end: 7, noiseSeed: 104 },
};

/** Deterministic seeded headcount history for one department, months 0..HISTORY_MONTHS-1. */
function headcountSeriesForDept(dept: Department): number[] {
  const plan = HEADCOUNT_PLAN[dept];
  const rng = mulberry32(plan.noiseSeed);
  const out: number[] = [];
  let current = plan.start;
  for (let i = 0; i < HISTORY_MONTHS; i++) {
    const target = plan.start + ((plan.end - plan.start) * i) / (HISTORY_MONTHS - 1);
    // Hiring is lumpy: nudge toward target, occasionally skip a month.
    const step = (target - current) * 0.55 + (rng() - 0.45) * 0.6;
    current = Math.max(plan.start, current + step);
    out.push(Math.round(current));
  }
  // Force exact endpoints so the seed data is stable and intuitive.
  out[0] = plan.start;
  out[HISTORY_MONTHS - 1] = plan.end;
  return out;
}

const HEADCOUNT_CACHE = new Map<Department, number[]>();

export function historyHeadcount(dept: Department): number[] {
  if (!HEADCOUNT_CACHE.has(dept)) {
    HEADCOUNT_CACHE.set(dept, headcountSeriesForDept(dept));
  }
  return HEADCOUNT_CACHE.get(dept)!;
}

/** Damping factor applied to the hiring-plan continuation so headcount
 * growth decelerates over a long forecast horizon instead of compounding
 * linearly forever (same rationale as `driverForecasts.ts`'s DAMPING_PHI —
 * a maturing org's hiring rate slows, it doesn't stay constant for 24
 * months straight). */
const HIRING_DAMPING_PHI = 0.92;

/** Hiring-plan continuation used as the forecast baseline for headcount
 * (org twin's plan of record), independent of the generic EWMA/seasonality
 * forecaster used for behavioural drivers like win rate. Growth decays
 * geometrically from the most recently observed hiring pace. */
export function plannedHeadcountContinuation(dept: Department, monthsAhead: number): number[] {
  const hist = historyHeadcount(dept);
  const last = hist[hist.length - 1];
  const priorGrowth = last - hist[hist.length - 4 >= 0 ? hist.length - 4 : 0];
  const monthlyAdd = Math.max(0.4, priorGrowth / 3);
  const out: number[] = [];
  let cumulative = 0;
  for (let i = 1; i <= monthsAhead; i++) {
    cumulative += monthlyAdd * Math.pow(HIRING_DAMPING_PHI, i - 1);
    out.push(Math.round(last + cumulative));
  }
  return out;
}
