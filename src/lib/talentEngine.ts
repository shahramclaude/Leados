// src/lib/talentEngine.ts
//
// BOOTSTRAP NOTE: no prior talentEngine.ts existed. Implements the task's
// explicit coupling requirement: "flightRisk scoring gets beliefs.flightRisk.p
// as a prior multiplier (multiply existing score by (0.5 + beliefs.p))".

import type { LeadosPerson, NodeMarginal } from "./types";
import { clamp01 } from "./temporal";
import { energyBudget } from "./physics";

export interface PersonFlightRiskScore {
  personId: string;
  baseScore: number;
  beliefAdjustedScore: number;
}

export interface TalentIntelligence {
  benchDepthScore: number;
  successionGaps: number;
  flightRiskScores: PersonFlightRiskScore[];
}

/** Baseline per-person flight-risk heuristic BEFORE belief coupling
 * (original derivation, DESIGN PARAMETERS): high calendar load + no
 * successor identified => higher baseline flight risk.
 */
function baseFlightRiskScore(person: LeadosPerson): number {
  const loadComponent = (person.calendarLoadPct ?? 50) / 100;
  const successorComponent = person.hasSuccessor ? 0 : 0.3;
  return clamp01(loadComponent * 0.6 + successorComponent);
}

export function analyzeTalent(
  people: LeadosPerson[],
  flightRiskBelief: NodeMarginal,
): TalentIntelligence {
  const seniorLevels = new Set(["L5", "L6", "L7"]);
  const seniorCount = people.filter((p) => p.level && seniorLevels.has(p.level)).length;
  const successionGaps = people.filter((p) => p.level && seniorLevels.has(p.level) && !p.hasSuccessor).length;
  const benchDepthScore = seniorCount > 0 ? clamp01(1 - successionGaps / seniorCount) : 1;

  // Task-mandated coupling: multiply base score by (0.5 + beliefs.p).
  const flightRiskScores: PersonFlightRiskScore[] = people.map((person) => {
    const baseScore = baseFlightRiskScore(person);
    const beliefAdjustedScore = clamp01(baseScore * (0.5 + flightRiskBelief.p));
    return { personId: person.id, baseScore, beliefAdjustedScore };
  });

  return { benchDepthScore, successionGaps, flightRiskScores };
}
