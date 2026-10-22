// src/lib/twin/agents.ts
//
// Per-agent weekly dynamics: fatigue, motivation, capacity, attrition.
// Constants below are ILLUSTRATIVE, not calibrated — see
// MODEL_CARD_KNOWN_FICTIONS in modelVersion.ts.

import type { AgentState } from "./types";
import type { Rng } from "./prng";

export const FATIGUE_ACCUMULATION_RATE = 0.12; // per unit of overload, per week
export const FATIGUE_RECOVERY_RATE = 0.08; // per week when under capacity
export const MOTIVATION_FATIGUE_DRAG = 0.1; // high fatigue drags motivation down
export const MOTIVATION_MEAN_REVERSION = 0.04; // slow drift back to baseline
export const BASE_WEEKLY_ATTRITION_PROB = 0.0012; // ~6%/year baseline voluntary attrition

export interface AgentStepContext {
  utilizationFraction: number; // 0..1+ (this agent's assigned load / capacity)
  moraleShockFraction: number; // flat subtraction applied this week (e.g. quality incident)
}

export function stepAgent(agent: AgentState, ctx: AgentStepContext, rng: Rng): AgentState {
  if (!agent.active) return agent;

  const overload = Math.max(0, ctx.utilizationFraction - 1);
  const slack = Math.max(0, 1 - ctx.utilizationFraction);

  let fatigue = agent.fatigue + overload * FATIGUE_ACCUMULATION_RATE - slack * FATIGUE_RECOVERY_RATE;
  fatigue = Math.min(1, Math.max(0, fatigue + rng.normal(0, 0.01)));

  const baseline = 0.65;
  let motivation =
    agent.motivation -
    fatigue * MOTIVATION_FATIGUE_DRAG * 0.1 -
    ctx.moraleShockFraction +
    (baseline - agent.motivation) * MOTIVATION_MEAN_REVERSION;
  motivation = Math.min(1, Math.max(0, motivation + rng.normal(0, 0.01)));

  return {
    ...agent,
    fatigue,
    motivation,
    tenureYears: agent.tenureYears + 1 / 52,
  };
}

/**
 * Weekly voluntary-attrition pass. Attrition probability rises with fatigue
 * and falls with motivation; this is a mechanistic illustration, not a
 * calibrated HR model.
 */
export function applyWeeklyAttrition(agents: AgentState[], rng: Rng): AgentState[] {
  return agents.map((a) => {
    if (!a.active) return a;
    const riskMultiplier = 1 + a.fatigue * 1.8 - a.motivation * 0.9;
    const prob = Math.max(0, BASE_WEEKLY_ATTRITION_PROB * riskMultiplier);
    if (rng.bernoulli(prob)) {
      return { ...a, active: false };
    }
    return a;
  });
}

export function hireAgents(
  existing: AgentState[],
  count: number,
  teamIds: string[],
  rng: Rng,
): AgentState[] {
  const newHires: AgentState[] = [];
  const startIdx = existing.length;
  for (let i = 0; i < count; i++) {
    newHires.push({
      personId: `p${(startIdx + i).toString().padStart(4, "0")}-h`,
      skills: {
        delivery: 0.5,
        strategy: 0.4,
        coaching: 0.4,
        dataAnalysis: 0.45,
        stakeholderMgmt: 0.4,
        technical: 0.45,
      },
      capacityHrs: Math.max(2, rng.normal(7.5, 1.2)),
      focusLoad: 0.1,
      fatigue: 0.15,
      motivation: 0.7,
      tenureYears: 0,
      teamId: rng.pick(teamIds),
      active: true,
      influenceScore: Math.min(1, Math.max(0, rng.logNormal(-1.3, 0.5))),
    });
  }
  return [...existing, ...newHires];
}
