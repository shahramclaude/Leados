// src/lib/twin/digitalTwin.ts
//
// Builds the initial OrgTwinState from a scenario + seed. Stands in for
// "Part 01's org world" generator (not present in this sandbox — see
// AI-SESSION-LOG.md Phase 0). Everything here is procedurally generated and
// MUST be treated as a synthetic organisation, never real company data.

import { ALL_SKILLS, type AgentState, type OrgTwinState, type ScenarioInput, type Skill } from "./types";
import { createRng, type Rng } from "./prng";
import { generateInfluenceNetwork } from "./network";

const TEAM_NAMES = [
  "Platform",
  "Growth",
  "Ops",
  "People",
  "Finance",
  "Product",
  "Data",
  "Field",
  "Support",
  "Strategy",
];

function randomSkills(rng: Rng): Record<Skill, number> {
  const out = {} as Record<Skill, number>;
  for (const s of ALL_SKILLS) {
    out[s] = Math.min(1, Math.max(0, rng.normal(0.55, 0.18)));
  }
  return out;
}

export function createInitialAgents(scenario: ScenarioInput, rng: Rng): AgentState[] {
  const agents: AgentState[] = [];
  const teamCount = Math.max(1, Math.min(scenario.teamCount, TEAM_NAMES.length));
  for (let i = 0; i < scenario.orgSize; i++) {
    const teamId = TEAM_NAMES[i % teamCount];
    const tenureYears = Math.max(0, rng.logNormal(0.6, 0.7));
    agents.push({
      personId: `p${i.toString().padStart(4, "0")}`,
      skills: randomSkills(rng),
      capacityHrs: Math.max(2, rng.normal(8, 1.5)), // focus hours/week for initiative work
      focusLoad: Math.min(0.6, Math.max(0, rng.normal(0.15, 0.08))),
      fatigue: Math.min(1, Math.max(0, rng.normal(0.25, 0.1))),
      motivation: Math.min(1, Math.max(0, rng.normal(0.65, 0.12))),
      tenureYears,
      teamId,
      active: true,
      influenceScore: Math.min(1, Math.max(0, rng.logNormal(-1.1, 0.6))),
    });
  }
  return agents;
}

export function createInitialOrgState(scenario: ScenarioInput, seedBase: number): OrgTwinState {
  const worldRng = createRng(seedBase, false).child("orgWorld");
  const agents = createInitialAgents(scenario, worldRng.child("agents"));
  const network = generateInfluenceNetwork(agents, worldRng.child("network"));
  return {
    week: 0,
    agents,
    network,
    backlog: [],
    activeInfluenced: new Set<string>(),
    cascadeFrontier: new Set<string>(),
    nextItemSeq: 0,
    wipLimitOverride: null,
    capacityMultiplierOverride: 1,
    arrivalMultiplierOverride: 1,
    arrivalMultiplierExpiresWeek: null,
  };
}

export function cloneOrgState(state: OrgTwinState): OrgTwinState {
  return {
    ...state,
    agents: state.agents.map((a) => ({ ...a, skills: { ...a.skills } })),
    network: state.network.map((e) => ({ ...e })),
    backlog: state.backlog.map((w) => ({ ...w })),
    activeInfluenced: new Set(state.activeInfluenced),
    cascadeFrontier: new Set(state.cascadeFrontier),
  };
}
