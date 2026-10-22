// src/lib/twin/shocks.ts
//
// Typed scenario shock events, applied at a configured step (week).

import type { AgentState, OrgTwinState, ShockEvent, WorkItem } from "./types";
import type { Rng } from "./prng";

export interface ShockApplication {
  state: OrgTwinState;
  moraleShockFraction: number; // applied to all agents this week (quality incident)
}

export function applyShockIfScheduled(
  state: OrgTwinState,
  shocks: ShockEvent[],
  week: number,
  rng: Rng,
): ShockApplication {
  const due = shocks.filter((s) => s.weekApplied === week);
  if (due.length === 0) {
    return { state, moraleShockFraction: 0 };
  }

  let agents: AgentState[] = state.agents;
  let backlog: WorkItem[] = state.backlog;
  let wipLimitOverride = state.wipLimitOverride;
  let capacityMultiplierOverride = state.capacityMultiplierOverride;
  let arrivalMultiplierOverride = state.arrivalMultiplierOverride;
  let arrivalMultiplierExpiresWeek = state.arrivalMultiplierExpiresWeek;
  let nextItemSeq = state.nextItemSeq;
  let moraleShockFraction = 0;

  for (const shock of due) {
    switch (shock.type) {
      case "attritionSpike": {
        agents = agents.map((a) => {
          if (!a.active) return a;
          if (rng.bernoulli(shock.extraDeparturesFraction)) {
            return { ...a, active: false };
          }
          return a;
        });
        break;
      }
      case "demandSurge": {
        arrivalMultiplierOverride = shock.arrivalMultiplier;
        arrivalMultiplierExpiresWeek = week + shock.durationWeeks;
        break;
      }
      case "keyPersonLoss": {
        const activeAgents = agents.filter((a) => a.active);
        let target: AgentState | undefined;
        if (shock.personId) {
          target = activeAgents.find((a) => a.personId === shock.personId);
        } else {
          target = [...activeAgents].sort((a, b) => b.influenceScore - a.influenceScore)[0];
        }
        if (target) {
          const id = target.personId;
          agents = agents.map((a) => (a.personId === id ? { ...a, active: false } : a));
        }
        break;
      }
      case "budgetCut": {
        const currentWip = wipLimitOverride ?? Number.POSITIVE_INFINITY;
        wipLimitOverride = Math.max(
          1,
          (Number.isFinite(currentWip) ? currentWip : 9999) - shock.wipLimitReduction,
        );
        capacityMultiplierOverride = Math.max(
          0.1,
          capacityMultiplierOverride * (1 - shock.capacityReductionFraction),
        );
        break;
      }
      case "qualityIncident": {
        moraleShockFraction += shock.moraleHitFraction;
        const reworkItems: WorkItem[] = [];
        for (let i = 0; i < shock.reworkItems; i++) {
          reworkItems.push({
            id: `rework-${week}-${nextItemSeq++}`,
            arrivalWeek: week,
            effortHrsEstimate: 24,
            effortHrsRemaining: 24,
            requiredSkill: "technical",
            priority: 1,
            status: "queued",
            startWeek: null,
            completeWeek: null,
          });
        }
        backlog = [...backlog, ...reworkItems];
        break;
      }
    }
  }

  return {
    state: {
      ...state,
      agents,
      backlog,
      wipLimitOverride,
      capacityMultiplierOverride,
      arrivalMultiplierOverride,
      arrivalMultiplierExpiresWeek,
      nextItemSeq,
    },
    moraleShockFraction,
  };
}

export function decayArrivalMultiplier(state: OrgTwinState, week: number): OrgTwinState {
  if (state.arrivalMultiplierExpiresWeek !== null && week >= state.arrivalMultiplierExpiresWeek) {
    return { ...state, arrivalMultiplierOverride: 1, arrivalMultiplierExpiresWeek: null };
  }
  return state;
}
