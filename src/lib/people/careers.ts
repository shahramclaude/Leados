// src/lib/people/careers.ts
//
// Succession readiness: ready-now / 1-year / 2-year, ALWAYS paired with named
// gaps and evidence — never an opaque score. A numeric fit is computed
// internally (for sorting candidate lists within a role, which HR/manager
// surfaces are allowed to do) but every surface that renders a readiness
// state is contractually required to render `namedGaps` alongside it.

import { fit, namedGaps } from "./roleSkillMap";
import type { EffectiveSkillLevel, NamedGap, Role } from "./types";

export type ReadinessState = "ready-now" | "1-year" | "2-year";

export interface SuccessionReadiness {
  personId: string;
  roleId: string;
  state: ReadinessState;
  fitScore: number; // supplementary only — UIs must not show this without `gaps`
  gaps: NamedGap[];
  evidenceSummary: string;
}

export function computeReadiness(personId: string, effectiveLevels: Record<string, EffectiveSkillLevel>, role: Role): SuccessionReadiness {
  const gaps = namedGaps(effectiveLevels, role);
  const fitScore = fit(effectiveLevels, role);

  let state: ReadinessState;
  if (gaps.length === 0 && fitScore >= 0.9) {
    state = "ready-now";
  } else {
    const maxMonths = Math.max(0, ...gaps.map((g) => g.closableWithinMonths));
    state = maxMonths <= 12 ? "1-year" : "2-year";
  }

  const evidenceSummary =
    gaps.length === 0
      ? `Meets every core-skill bar for ${role.name} with current evidence.`
      : `Meets ${Object.keys(role.coreSkills).length - gaps.length}/${Object.keys(role.coreSkills).length} core-skill bars for ${role.name}. Remaining gaps listed below with the evidence that would close them.`;

  return { personId, roleId: role.id, state, fitScore, gaps, evidenceSummary };
}

export function successionBoard(personId: string, effectiveLevels: Record<string, EffectiveSkillLevel>, roles: Role[]): SuccessionReadiness[] {
  return roles.map((r) => computeReadiness(personId, effectiveLevels, r)).sort((a, b) => b.fitScore - a.fitScore);
}
