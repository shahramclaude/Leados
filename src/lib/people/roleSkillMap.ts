// src/lib/people/roleSkillMap.ts
//
// Role = { coreSkills: Map<Skill, minLevel>, complementarySkills, adjacencyRoles[] }
// fit(person, role) = weighted coverage over core skills.
//
// fit() is a PURE function of (effective skill levels, role definition) only.
// It never reads anything about the person except their skill evidence. It is
// always surfaced alongside namedGaps() — never as a bare number — per the
// "never opaque scores" rule.

import { getSkill, SEED_SKILLS } from "./skillsOntology";
import type { EffectiveSkillLevel, NamedGap, Role, SkillLevel } from "./types";

export const SEED_ROLES: Role[] = [
  {
    id: "backend-engineer-ii",
    name: "Backend Engineer II",
    coreSkills: { "programming-fundamentals": 3, "backend-services": 3 },
    complementarySkills: { "incident-response": 0.5, "distributed-systems": 0.4 },
    adjacencyRoles: ["backend-engineer-iii", "data-engineer-ii"],
  },
  {
    id: "backend-engineer-iii",
    name: "Backend Engineer III",
    coreSkills: { "programming-fundamentals": 4, "backend-services": 4, "distributed-systems": 3 },
    complementarySkills: { "incident-response": 0.6, "technical-leadership": 0.3 },
    adjacencyRoles: ["staff-engineer", "tech-lead"],
  },
  {
    id: "tech-lead",
    name: "Tech Lead",
    coreSkills: { "backend-services": 4, "technical-leadership": 4 },
    complementarySkills: { "people-leadership": 0.4, "incident-response": 0.5 },
    adjacencyRoles: ["engineering-manager", "staff-engineer"],
  },
  {
    id: "engineering-manager",
    name: "Engineering Manager",
    coreSkills: { "people-leadership": 4, "backend-services": 2 },
    complementarySkills: { "technical-leadership": 0.5 },
    adjacencyRoles: ["senior-engineering-manager"],
  },
  {
    id: "data-engineer-ii",
    name: "Data Engineer II",
    coreSkills: { "programming-fundamentals": 3, "data-engineering": 3 },
    complementarySkills: { "data-analysis": 0.5, "ml-modeling": 0.3 },
    adjacencyRoles: ["backend-engineer-ii", "ml-engineer"],
  },
  {
    id: "ml-engineer",
    name: "ML Engineer",
    coreSkills: { "ml-modeling": 3, "data-engineering": 2 },
    complementarySkills: { "data-analysis": 0.5 },
    adjacencyRoles: ["data-engineer-ii"],
  },
  {
    id: "product-manager-ii",
    name: "Product Manager II",
    coreSkills: { "product-discovery": 3, "product-execution": 3 },
    complementarySkills: { "data-analysis": 0.4, "interaction-design": 0.3 },
    adjacencyRoles: ["product-manager-iii"],
  },
  {
    id: "product-designer-ii",
    name: "Product Designer II",
    coreSkills: { "interaction-design": 3, "visual-design": 3 },
    complementarySkills: { "product-discovery": 0.4 },
    adjacencyRoles: ["product-designer-iii"],
  },
];

export const ROLES_BY_ID: Record<string, Role> = Object.fromEntries(SEED_ROLES.map((r) => [r.id, r]));

/**
 * fit(person, role) = sum(w_s * min(level_s - minLevel_s, 1)) / sum(w_s)
 * over the role's core skills, where w_s defaults to 1 for every core skill.
 *
 * Implementation choice (documented, not hidden): coverage per skill is
 * clamped to [0, 1] rather than allowed to go negative. The spec's
 * `min(level_s - minLevel_s, 1)` caps credit at full coverage once you clear
 * the bar; we additionally floor at 0 so that being far below the bar on one
 * skill cannot make the *overall* fit score negative or let a very strong
 * skill elsewhere cancel out a named gap. The gap is still reported in full
 * via `namedGaps()` regardless of how fit nets out.
 */
export function fit(effectiveLevels: Record<string, EffectiveSkillLevel>, role: Role, weights?: Record<string, number>): number {
  const entries = Object.entries(role.coreSkills);
  if (entries.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const [skillId, minLevel] of entries) {
    const w = weights?.[skillId] ?? 1;
    const level = effectiveLevels[skillId]?.level ?? 0;
    const coverage = Math.max(0, Math.min(level - minLevel, 1));
    num += w * coverage;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

/** Complementary-skill breadth score, used for team composer scoring, not for fit/ranking. */
export function complementaryCoverage(effectiveLevels: Record<string, EffectiveSkillLevel>, role: Role): number {
  const entries = Object.entries(role.complementarySkills);
  if (entries.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const [skillId, weight] of entries) {
    const level = effectiveLevels[skillId]?.level ?? 0;
    num += weight * Math.min(level / 3, 1);
    den += weight;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Always-visible, always-contestable: the concrete list of skill gaps
 * between a person's current evidenced level and a role's requirement. This
 * — not the fit number — is the primary surface for succession/growth views.
 */
export function namedGaps(effectiveLevels: Record<string, EffectiveSkillLevel>, role: Role): NamedGap[] {
  const gaps: NamedGap[] = [];
  for (const [skillId, minLevel] of Object.entries(role.coreSkills) as [string, SkillLevel][]) {
    const current = effectiveLevels[skillId]?.level ?? 0;
    if (current < minLevel) {
      const delta = minLevel - current;
      gaps.push({
        skillId,
        skillName: getSkill(skillId)?.name ?? skillId,
        requiredLevel: minLevel,
        currentLevel: Math.round(current * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        // heuristic: ~4 months of sustained, evidenced growth per whole level of delta
        closableWithinMonths: Math.max(1, Math.round(delta * 4)),
      });
    }
  }
  return gaps.sort((a, b) => b.delta - a.delta);
}

export function allSkillIds(): string[] {
  return SEED_SKILLS.map((s) => s.id);
}
