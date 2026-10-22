// src/lib/twin/financeBridge.ts
//
// Shared cost/finance bridge so finance scenarios (headcount + initiative
// cost) and people scenarios (capacity, fatigue, attrition) live in one
// world. Expected value reuses the Part-04-stand-in Monte Carlo core
// (src/lib/forecast/monteCarloCore.ts) so a single seeded belief draw per
// completed item feeds both the twin and any future forecasting surfaces.

import type { AgentState, WorkItem } from "./types";
import type { Rng } from "./prng";
import { sampleExpectedValuePerHour } from "@/lib/forecast/monteCarloCore";

export function computeHeadcountCost(agents: AgentState[], costPerHeadWeek: number): number {
  const activeCount = agents.filter((a) => a.active).length;
  return activeCount * costPerHeadWeek;
}

export function computeInitiativeCost(
  completedItems: WorkItem[],
  costPerEffortHr: number,
): number {
  const hours = completedItems.reduce((s, i) => s + i.effortHrsEstimate, 0);
  return hours * costPerEffortHr;
}

export function computeExpectedValue(
  completedItems: WorkItem[],
  valuePerEffortHr: number,
  rng: Rng,
): number {
  let total = 0;
  for (const item of completedItems) {
    const evPerHr = sampleExpectedValuePerHour(item.requiredSkill, rng, valuePerEffortHr);
    total += evPerHr * item.effortHrsEstimate;
  }
  return total;
}
