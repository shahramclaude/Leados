// Portfolio prioritization: WSJF scoring, cost-of-delay curves, and a
// budget-constrained greedy knapsack solver with explicit, deterministic
// tie-break rules (see strategyModels.WSJF_TIE_BREAK_RULES).
import type { InitiativeNode } from "./strategyModels";
import { WSJF_TIE_BREAK_RULES } from "./strategyModels";

export { WSJF_TIE_BREAK_RULES };

export interface WsjfResult {
  initiativeId: string;
  wsjf: number;
  timeCriticality: number;
  riskReduction: number;
  userValue: number;
  jobSize: number;
}

export function computeWSJF(initiative: InitiativeNode): WsjfResult {
  const jobSize = initiative.jobSize > 0 ? initiative.jobSize : 1; // guard divide-by-zero
  const wsjf =
    (initiative.timeCriticality + initiative.riskReduction + initiative.userValue) / jobSize;
  return {
    initiativeId: initiative.id,
    wsjf,
    timeCriticality: initiative.timeCriticality,
    riskReduction: initiative.riskReduction,
    userValue: initiative.userValue,
    jobSize: initiative.jobSize,
  };
}

/**
 * Cost of delay: linear approximation (documented assumption). Weekly cost
 * accrual = timeCriticality + riskReduction + userValue (the WSJF numerator),
 * i.e. the "value per week of delay". Cumulative cost of delay over `weeks`
 * is therefore a straight line, not a convex curve — a genuinely convex CoD
 * curve (e.g. fixed-date cliffs) requires per-initiative curve shape data
 * that does not exist yet; that is a documented gap, not a hidden one.
 */
export function costOfDelayPerWeek(initiative: InitiativeNode): number {
  return initiative.timeCriticality + initiative.riskReduction + initiative.userValue;
}

export function costOfDelayCurve(initiative: InitiativeNode, weeks: number): number[] {
  const perWeek = costOfDelayPerWeek(initiative);
  const curve: number[] = [];
  for (let w = 1; w <= weeks; w++) {
    curve.push(perWeek * w);
  }
  return curve;
}

/** Deterministic WSJF-ranked order using the documented tie-break chain. */
export function rankInitiatives(initiatives: InitiativeNode[]): (WsjfResult & { initiative: InitiativeNode })[] {
  const scored = initiatives.map((i) => ({ ...computeWSJF(i), initiative: i }));
  scored.sort((a, b) => {
    if (b.wsjf !== a.wsjf) return b.wsjf - a.wsjf;
    if (a.jobSize !== b.jobSize) return a.jobSize - b.jobSize;
    if (b.timeCriticality !== a.timeCriticality) return b.timeCriticality - a.timeCriticality;
    return a.initiativeId < b.initiativeId ? -1 : a.initiativeId > b.initiativeId ? 1 : 0;
  });
  return scored;
}

export interface PortfolioSelection {
  selected: InitiativeNode[];
  deferred: InitiativeNode[];
  totalBudgetUsed: number;
  budget: number;
  utilization: number; // 0..1
  rankOrder: string[]; // initiative ids, in the order the solver considered them
}

/**
 * Greedy knapsack: consider initiatives in WSJF-ranked order (tie-break chain
 * documented above), take each one whose budgetAllocated still fits in the
 * remaining budget, skip (defer) ones that don't fit, keep scanning the rest
 * of the ranked list (classic greedy approximation — NOT the optimal 0/1
 * knapsack solution, which is exponential; documented trade-off for
 * explainability over optimality).
 */
export function selectPortfolio(initiatives: InitiativeNode[], budget: number): PortfolioSelection {
  const ranked = rankInitiatives(initiatives);
  let remaining = budget;
  const selected: InitiativeNode[] = [];
  const deferred: InitiativeNode[] = [];

  for (const r of ranked) {
    if (r.initiative.budgetAllocated <= remaining) {
      selected.push(r.initiative);
      remaining -= r.initiative.budgetAllocated;
    } else {
      deferred.push(r.initiative);
    }
  }

  const totalBudgetUsed = budget - remaining;
  return {
    selected,
    deferred,
    totalBudgetUsed,
    budget,
    utilization: budget > 0 ? totalBudgetUsed / budget : 0,
    rankOrder: ranked.map((r) => r.initiativeId),
  };
}
