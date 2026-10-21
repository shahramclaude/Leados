// Part 09-E: skills ontology as a lightweight graph (skills, roles, people;
// edges: has, needs, adjacent-to) powering skill-gap analysis per team and
// internal-mobility suggestions. Skills are only ever recorded with
// provenance (declared by the person, or observed from logged work events
// such as a completed growth-plan milestone) — never inferred from free text.

import { db } from "@/db";
import { skills, personSkills, roleSkills, people, actors } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { type Actor, canReadTeamAggregate, assertAccess } from "./accessControl";

export interface SkillNode {
  id: string;
  name: string;
  category: string;
}

export interface GraphEdge {
  type: "has" | "needs" | "adjacent_to";
  from: string;
  to: string;
  weight: number; // level for 'has'/'needs'; similarity for 'adjacent_to'
}

/** Builds the full graph (small dataset; fine to materialize for this demo scale). */
export async function buildSkillsGraph(): Promise<{ nodes: SkillNode[]; edges: GraphEdge[] }> {
  const allSkills = await db.select().from(skills);
  const hasEdges = await db.select().from(personSkills);
  const needsEdges = await db.select().from(roleSkills);

  const edges: GraphEdge[] = [
    ...hasEdges.map((h) => ({ type: "has" as const, from: h.personId, to: h.skillId, weight: h.level })),
    ...needsEdges.map((n) => ({ type: "needs" as const, from: n.role, to: n.skillId, weight: n.requiredLevel })),
  ];

  // adjacent-to: two skills are "adjacent" if >=2 people who hold one also
  // hold the other at level >=2 — a simple, auditable co-occurrence measure.
  const bySkill = new Map<string, Set<string>>();
  for (const h of hasEdges) {
    if (h.level < 2) continue;
    if (!bySkill.has(h.skillId)) bySkill.set(h.skillId, new Set());
    bySkill.get(h.skillId)!.add(h.personId);
  }
  const skillIds = [...bySkill.keys()];
  for (let i = 0; i < skillIds.length; i++) {
    for (let j = i + 1; j < skillIds.length; j++) {
      const a = bySkill.get(skillIds[i])!;
      const b = bySkill.get(skillIds[j])!;
      const overlap = [...a].filter((p) => b.has(p)).length;
      if (overlap >= 2) {
        edges.push({ type: "adjacent_to", from: skillIds[i], to: skillIds[j], weight: overlap });
      }
    }
  }

  return {
    nodes: allSkills.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    edges,
  };
}

export interface TeamSkillGap {
  skillId: string;
  skillName: string;
  role: string;
  requiredLevel: number;
  teamAverageLevel: number;
  gap: number;
  peopleBelowRequirement: number;
}

export async function teamSkillGapAnalysis(actor: Actor, teamId: string): Promise<TeamSkillGap[]> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} may not read team skill-gap analysis`);

  const members = await db.select().from(people).where(eq(people.teamId, teamId));
  if (members.length === 0) return [];
  const roles = [...new Set(members.map((m) => m.role))];
  const requirements = await db.select().from(roleSkills).where(inArray(roleSkills.role, roles));
  if (requirements.length === 0) return [];

  const memberIds = members.map((m) => m.id);
  const memberSkills = await db.select().from(personSkills).where(inArray(personSkills.personId, memberIds));
  const skillNames = await db.select().from(skills);
  const nameById = new Map(skillNames.map((s) => [s.id, s.name]));

  const results: TeamSkillGap[] = [];
  for (const req of requirements) {
    const roleMembers = members.filter((m) => m.role === req.role);
    const levels = roleMembers.map(
      (m) => memberSkills.find((s) => s.personId === m.id && s.skillId === req.skillId)?.level ?? 0,
    );
    const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    const below = levels.filter((l) => l < req.requiredLevel).length;
    results.push({
      skillId: req.skillId,
      skillName: nameById.get(req.skillId) ?? req.skillId,
      role: req.role,
      requiredLevel: req.requiredLevel,
      teamAverageLevel: Number(avg.toFixed(2)),
      gap: Number(Math.max(0, req.requiredLevel - avg).toFixed(2)),
      peopleBelowRequirement: below,
    });
  }
  return results.sort((a, b) => b.gap - a.gap);
}

export interface MobilitySuggestion {
  personId: string;
  name: string;
  targetRole: string;
  coverage: number;
  missingSkills: string[];
}

/** Suggests roles a person could grow into, based on skill coverage only. */
export async function internalMobilitySuggestions(actor: Actor, personId: string): Promise<MobilitySuggestion[]> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) throw new Error("Person not found");
  assertAccess(
    actor.id === personId || actor.globalRole === "manager" || actor.globalRole === "hr",
    `actor ${actor.id} may not read mobility suggestions for ${personId}`,
  );

  const [actorRow] = await db.select().from(actors).where(eq(actors.id, personId)).limit(1);
  const mySkills = await db.select().from(personSkills).where(eq(personSkills.personId, personId));
  const myLevelBySkill = new Map(mySkills.map((s) => [s.skillId, s.level]));

  const allRoleSkills = await db.select().from(roleSkills);
  const skillNames = await db.select().from(skills);
  const nameById = new Map(skillNames.map((s) => [s.id, s.name]));

  const roles = [...new Set(allRoleSkills.map((r) => r.role))].filter((r) => r !== person.role);
  const suggestions: MobilitySuggestion[] = [];
  for (const role of roles) {
    const reqs = allRoleSkills.filter((r) => r.role === role);
    const total = reqs.reduce((s, r) => s + r.requiredLevel, 0) || 1;
    const met = reqs.reduce((s, r) => s + Math.min(myLevelBySkill.get(r.skillId) ?? 0, r.requiredLevel), 0);
    const coverage = met / total;
    if (coverage >= 0.6) {
      suggestions.push({
        personId,
        name: actorRow?.name ?? personId,
        targetRole: role,
        coverage: Number(coverage.toFixed(2)),
        missingSkills: reqs
          .filter((r) => (myLevelBySkill.get(r.skillId) ?? 0) < r.requiredLevel)
          .map((r) => nameById.get(r.skillId) ?? r.skillId),
      });
    }
  }
  return suggestions.sort((a, b) => b.coverage - a.coverage);
}
