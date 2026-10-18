// ════════════════════════════════════════════════════════════════════
// Multi-agent organizational simulation. Pure. No DB calls.
// Behavioral coefficients are heuristic — labeled as directional only.
// ════════════════════════════════════════════════════════════════════

import { Person, PulseView } from "./engine";

export interface AgentState {
  id: string;
  name: string;
  mood: number;
  load: number;
  engagement: number;
  flightRisk: number;
  hasGrowthPlan: boolean;
  cadenceRatio: number;
  history: Array<{ week: number; mood: number; engagement: number; flightRisk: number }>;
}

export interface SimulationScenario {
  name: string;
  attritionProbability: number;
  finalMeanEngagement: number;
  finalMeanFlightRisk: number;
  engagementP10: number;
  engagementP90: number;
  seedCount: number;
}

export interface SimulationResult {
  scenarios: Record<string, SimulationScenario>;
  bestIntervention: string | null;
  label: string;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initAgents(people: Person[], pulses: PulseView[], planPersonIds: Set<string>): AgentState[] {
  const pulseMap = Object.fromEntries(pulses.map((p) => [p.personId, p]));
  return people.map((person) => {
    const pulse = pulseMap[person.id];
    return {
      id: person.id,
      name: person.name,
      mood: pulse?.meanMood ?? 6,
      load: pulse?.meanLoad ?? 6,
      engagement: pulse ? pulse.meanMood * 0.7 + (10 - pulse.meanLoad) * 0.3 : 6,
      flightRisk: 0,
      hasGrowthPlan: planPersonIds.has(person.id),
      cadenceRatio: 1.0,
      history: [],
    };
  });
}

function stepAgent(agent: AgentState, week: number, intervention: string | null, rand: () => number): AgentState {
  const next: AgentState = { ...agent, history: [...agent.history] };

  if (agent.load > 7.5) next.mood = Math.max(1, agent.mood - rand() * 0.4);
  else if (agent.load < 5) next.mood = Math.min(10, agent.mood + rand() * 0.2);

  if (agent.cadenceRatio > 1.5) {
    next.engagement = Math.max(1, agent.engagement - 0.3);
    next.cadenceRatio += 0.2;
  } else {
    next.engagement = Math.min(10, agent.engagement + 0.1);
  }

  if (!agent.hasGrowthPlan) next.engagement = Math.max(1, agent.engagement - 0.15);

  if (intervention === "IMPROVE_CADENCE") {
    next.cadenceRatio = 1.0;
    next.engagement = Math.min(10, agent.engagement + 0.8);
  }
  if (intervention === "ADD_GROWTH_PLAN") {
    next.hasGrowthPlan = true;
    next.engagement = Math.min(10, agent.engagement + 0.6);
  }
  if (intervention === "REDUCE_LOAD") {
    next.load = Math.max(1, agent.load - 2);
    next.mood = Math.min(10, agent.mood + 0.5);
  }

  next.flightRisk = Math.min(
    1,
    (1 - next.engagement / 10) * 0.35 +
      (1 - next.mood / 10) * 0.35 +
      Math.min(1, next.cadenceRatio / 3) * 0.2 +
      (next.hasGrowthPlan ? 0 : 0.1)
  );

  next.history.push({
    week,
    mood: Math.round(next.mood * 10) / 10,
    engagement: Math.round(next.engagement * 10) / 10,
    flightRisk: Math.round(next.flightRisk * 100) / 100,
  });

  return next;
}

function runScenario(
  people: Person[],
  pulses: PulseView[],
  planPersonIds: Set<string>,
  intervention: string | null,
  weeks = 12,
  seeds = 50
): SimulationScenario {
  const allResults: Array<{ engagement: number; flightRisk: number; attrition: boolean }> = [];

  for (let seed = 0; seed < seeds; seed++) {
    const rand = mulberry32(seed * 1000 + 42);
    let agents = initAgents(people, pulses, planPersonIds);

    for (let week = 1; week <= weeks; week++) {
      agents = agents.map((a) => stepAgent(a, week, intervention, rand));
    }

    const meanEngagement = agents.length ? agents.reduce((s, a) => s + a.engagement, 0) / agents.length : 6;
    const meanFlightRisk = agents.length ? agents.reduce((s, a) => s + a.flightRisk, 0) / agents.length : 0;
    const attrition = agents.some((a) => a.flightRisk > 0.7);
    allResults.push({ engagement: meanEngagement, flightRisk: meanFlightRisk, attrition });
  }

  const sorted = allResults.map((r) => r.engagement).sort((a, b) => a - b);
  return {
    name: intervention ?? "STATUS_QUO",
    attritionProbability: Math.round((allResults.filter((r) => r.attrition).length / seeds) * 100) / 100,
    finalMeanEngagement: Math.round((allResults.reduce((s, r) => s + r.engagement, 0) / seeds) * 10) / 10,
    finalMeanFlightRisk: Math.round((allResults.reduce((s, r) => s + r.flightRisk, 0) / seeds) * 100) / 100,
    engagementP10: Math.round((sorted[Math.floor(seeds * 0.1)] ?? sorted[0] ?? 0) * 10) / 10,
    engagementP90: Math.round((sorted[Math.floor(seeds * 0.9)] ?? sorted[sorted.length - 1] ?? 0) * 10) / 10,
    seedCount: seeds,
  };
}

export function runSimulation(
  people: Person[],
  pulses: PulseView[],
  planPersonIds: Set<string>,
  weeks = 12,
  seeds = 50
): SimulationResult {
  const interventions: Array<string | null> = [null, "IMPROVE_CADENCE", "ADD_GROWTH_PLAN", "REDUCE_LOAD"];

  const scenarios: Record<string, SimulationScenario> = {};
  for (const intv of interventions) {
    const key = intv ?? "STATUS_QUO";
    scenarios[key] = runScenario(people, pulses, planPersonIds, intv, weeks, seeds);
  }

  const ranked = Object.entries(scenarios)
    .filter(([k]) => k !== "STATUS_QUO")
    .sort(([, a], [, b]) => a.attritionProbability - b.attritionProbability);

  return {
    scenarios,
    bestIntervention: ranked[0]?.[0] ?? null,
    label:
      `Multi-agent simulation: ${weeks} weeks × ${seeds} Monte Carlo seeds. ` +
      `Agent behavioral coefficients are heuristic — not empirically validated. ` +
      `Use as directional guidance only.`,
  };
}
