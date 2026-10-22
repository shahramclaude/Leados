// src/lib/twin/orgDynamics.ts
//
// Combines agents + workSystem + network + shocks + financeBridge into a
// single weekly transition. This is the "orgDynamics" layer referenced by
// the standing order's read-before-write list: one step of the world.

import type { OrgTwinState, ScenarioInput, ShockType, WeeklyMetrics } from "./types";
import type { Rng } from "./prng";
import { applyWeeklyAttrition, hireAgents, stepAgent } from "./agents";
import { sampleArrivals, progressBacklog } from "./workSystem";
import { stepIndependentCascade } from "./network";
import { applyShockIfScheduled, decayArrivalMultiplier } from "./shocks";
import { computeExpectedValue, computeHeadcountCost, computeInitiativeCost } from "./financeBridge";

export interface StepRngs {
  arrivals: Rng;
  agents: Rng;
  network: Rng;
  shocks: Rng;
  finance: Rng;
  attrition: Rng;
}

export function deriveStepRngs(baseSeed: number, week: number, createChild: (label: string) => Rng): StepRngs {
  return {
    arrivals: createChild(`arrivals:${week}`),
    agents: createChild(`agents:${week}`),
    network: createChild(`network:${week}`),
    shocks: createChild(`shocks:${week}`),
    finance: createChild(`finance:${week}`),
    attrition: createChild(`attrition:${week}`),
  };
}

export function stepWeek(
  stateIn: OrgTwinState,
  scenario: ScenarioInput,
  week: number,
  rngs: StepRngs,
): { state: OrgTwinState; metrics: WeeklyMetrics } {
  let state = decayArrivalMultiplier(stateIn, week);

  // 1. Shocks scheduled for this week.
  let shockApplied: ShockType | null = null;
  const due = scenario.shocks.filter((s) => s.weekApplied === week);
  if (due.length > 0) shockApplied = due[0].type;
  const shockResult = applyShockIfScheduled(state, scenario.shocks, week, rngs.shocks);
  state = shockResult.state;

  // 2. Headcount change event (hiring / reduction), scenario-level not a "shock".
  if (week === scenario.headcountChangeWeek && scenario.headcountDeltaFraction !== 0) {
    const activeCount = state.agents.filter((a) => a.active).length;
    if (scenario.headcountDeltaFraction > 0) {
      const hireCount = Math.round(activeCount * scenario.headcountDeltaFraction);
      const teamIds = Array.from(new Set(state.agents.map((a) => a.teamId)));
      state = { ...state, agents: hireAgents(state.agents, hireCount, teamIds, rngs.agents) };
    } else {
      const cutCount = Math.round(activeCount * -scenario.headcountDeltaFraction);
      const activeIds = state.agents.filter((a) => a.active).map((a) => a.personId);
      const toCut = new Set<string>();
      const pool = [...activeIds];
      for (let i = 0; i < cutCount && pool.length > 0; i++) {
        const idx = Math.floor(rngs.agents.next() * pool.length);
        toCut.add(pool.splice(idx, 1)[0]);
      }
      state = {
        ...state,
        agents: state.agents.map((a) => (toCut.has(a.personId) ? { ...a, active: false } : a)),
      };
    }
  }

  // 3. Weekly voluntary attrition.
  const agentsAfterAttrition = applyWeeklyAttrition(state.agents, rngs.attrition);
  state = { ...state, agents: agentsAfterAttrition };

  // 4. Arrivals.
  const effectiveLambda =
    scenario.arrivalRateLambda * scenario.demandMultiplier * state.arrivalMultiplierOverride;
  const nextSeqRef = { value: state.nextItemSeq };
  const arrivals = sampleArrivals(
    week,
    effectiveLambda,
    scenario.effortMeanHrs,
    scenario.effortSpread,
    nextSeqRef,
    rngs.arrivals,
  );
  const backlogWithArrivals = [...state.backlog, ...arrivals];

  // 5. Capacity + progress.
  const activeAgents = state.agents.filter((a) => a.active);
  const capacityMultiplier = state.capacityMultiplierOverride;
  const availableHours = activeAgents.reduce((sum, a) => {
    const fatiguePenalty = 1 - a.fatigue * 0.3;
    const effective = a.capacityHrs * (1 - a.focusLoad) * Math.max(0.2, fatiguePenalty) * capacityMultiplier;
    return sum + Math.max(0, effective);
  }, 0);
  const wipLimit = state.wipLimitOverride ?? scenario.wipLimit;
  const progress = progressBacklog(backlogWithArrivals, week, availableHours, wipLimit, scenario.queueDiscipline);

  const utilizationFraction = availableHours > 0 ? progress.hoursSpent / availableHours : 0;
  const stepAgentsOut = activeAgents.map((a) =>
    stepAgent(a, { utilizationFraction, moraleShockFraction: shockResult.moraleShockFraction }, rngs.agents),
  );
  const inactiveAgents = state.agents.filter((a) => !a.active);
  const updatedAgents = [...stepAgentsOut, ...inactiveAgents];

  // 6. Influence diffusion: spontaneous activation from highly-motivated
  // agents seeds the frontier, then the previous frontier gets one cascade
  // round per the independent-cascade model.
  const spontaneous = new Set<string>();
  for (const a of stepAgentsOut) {
    if (!state.activeInfluenced.has(a.personId) && rngs.network.bernoulli(Math.max(0, (a.motivation - 0.8) * 0.15))) {
      spontaneous.add(a.personId);
    }
  }
  const cascadeNew = stepIndependentCascade(state.activeInfluenced, state.cascadeFrontier, state.network, rngs.network);
  const newlyActive = new Set<string>([...spontaneous, ...cascadeNew]);
  const activeInfluenced = new Set(state.activeInfluenced);
  for (const id of newlyActive) activeInfluenced.add(id);

  // 7. Finance bridge.
  const headcountCostThisWeek = computeHeadcountCost(updatedAgents, scenario.costPerHeadWeek);
  const initiativeCostThisWeek = computeInitiativeCost(progress.completedThisWeek, scenario.costPerEffortHr);
  const expectedValueThisWeek = computeExpectedValue(
    progress.completedThisWeek,
    scenario.valuePerEffortHr,
    rngs.finance,
  );
  const netValueThisWeek = expectedValueThisWeek - headcountCostThisWeek - initiativeCostThisWeek;

  const sojourns = progress.completedThisWeek.map((i) => (i.completeWeek! - i.arrivalWeek + 1));
  const avgSojournWeeksCompleted =
    sojourns.length > 0 ? sojourns.reduce((s, v) => s + v, 0) / sojourns.length : null;

  const avgFatigue =
    updatedAgents.filter((a) => a.active).reduce((s, a) => s + a.fatigue, 0) /
    Math.max(1, updatedAgents.filter((a) => a.active).length);
  const avgMotivation =
    updatedAgents.filter((a) => a.active).reduce((s, a) => s + a.motivation, 0) /
    Math.max(1, updatedAgents.filter((a) => a.active).length);

  const newState: OrgTwinState = {
    ...state,
    week,
    agents: updatedAgents,
    backlog: progress.backlog,
    activeInfluenced,
    cascadeFrontier: newlyActive,
    nextItemSeq: nextSeqRef.value,
  };

  const metrics: WeeklyMetrics = {
    week,
    arrivalsThisWeek: arrivals.length,
    completedThisWeek: progress.completedThisWeek.length,
    backlogLength: progress.inSystemCount,
    avgSojournWeeksCompleted,
    avgFatigue,
    avgMotivation,
    activeHeadcount: updatedAgents.filter((a) => a.active).length,
    cascadeActivatedFraction: activeInfluenced.size / Math.max(1, updatedAgents.length),
    headcountCostThisWeek,
    initiativeCostThisWeek,
    expectedValueThisWeek,
    netValueThisWeek,
    cumulativeNetValue: 0, // filled in by orgSimulation.ts (needs running total)
    shockApplied,
  };

  return { state: newState, metrics };
}
