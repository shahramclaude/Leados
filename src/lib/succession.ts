// Part 09-C: succession & bench strength.
//
// HONESTY RULE: every output here is DECISION SUPPORT, NOT A DECISION. The
// UI (TalentView.tsx) must render that sentence next to any readiness
// matrix; scripts/scan-causal-language.ts also checks the literal string is
// present in the succession UI copy.

import { db } from "@/db";
import { people, roleSkills, personSkills, skills, actors } from "@/db/schema";
import { eq, inArray, and as and_ } from "drizzle-orm";
import type { Explain, Driver } from "./explain";
import { type Actor, canReadTeamAggregate, assertAccess } from "./accessControl";

export type Readiness = "ready_now" | "ready_later" | "not_ready";

export interface SkillGap {
  skillId: string;
  skillName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
}

export interface CandidateReadiness {
  personId: string;
  name: string;
  readiness: Explain<Readiness>;
  coverage: number; // 0..1 fraction of required skill-points met
  estimatedMonthsToReady: number | null;
  gaps: SkillGap[];
}

export interface SuccessionMatrix {
  role: string;
  readyNow: CandidateReadiness[];
  readyLater: CandidateReadiness[];
  notReady: CandidateReadiness[];
  benchStrength: {
    readyNowCount: number;
    coverageRisk: "low" | "medium" | "high";
    rationale: string;
  };
  disclaimer: string;
  asOf: string;
}

const DISCLAIMER =
  "Decision support, not a decision. This matrix estimates demonstrated skill coverage against a role's declared skill requirements; it does not account for interview performance, stakeholder fit, legal requirements, or anything outside LEADOS's event log. A human must make and own the actual succession decision.";

async function requiredSkillsFor(role: string) {
  return db
    .select({ skillId: roleSkills.skillId, requiredLevel: roleSkills.requiredLevel, name: skills.name })
    .from(roleSkills)
    .innerJoin(skills, eq(skills.id, roleSkills.skillId))
    .where(eq(roleSkills.role, role));
}

function estimateMonthsToReady(gaps: SkillGap[]): number | null {
  const positiveGaps = gaps.filter((g) => g.gap > 0);
  if (positiveGaps.length === 0) return 0;
  // Heuristic: ~2 months of focused growth-plan work per missing skill level,
  // documented as an illustrative planning estimate, not a guarantee.
  const totalGapPoints = positiveGaps.reduce((s, g) => s + g.gap, 0);
  return Math.round(totalGapPoints * 2);
}

export async function evaluateCandidate(personId: string, role: string): Promise<CandidateReadiness> {
  const required = await requiredSkillsFor(role);
  const [actorRow] = await db.select().from(actors).where(eq(actors.id, personId)).limit(1);

  const required_ids = required.map((r) => r.skillId);
  const held = required_ids.length
    ? await db
        .select()
        .from(personSkills)
        .where(and_(eq(personSkills.personId, personId), inArray(personSkills.skillId, required_ids)))
    : [];

  const heldBySkill = new Map(held.map((h) => [h.skillId, h]));
  const gaps: SkillGap[] = required.map((r) => {
    const current = heldBySkill.get(r.skillId)?.level ?? 0;
    return {
      skillId: r.skillId,
      skillName: r.name,
      currentLevel: current,
      requiredLevel: r.requiredLevel,
      gap: Math.max(0, r.requiredLevel - current),
    };
  });

  const totalRequired = required.reduce((s, r) => s + r.requiredLevel, 0) || 1;
  const totalMet = required.reduce((s, r) => {
    const current = heldBySkill.get(r.skillId)?.level ?? 0;
    return s + Math.min(current, r.requiredLevel);
  }, 0);
  const coverage = totalMet / totalRequired;

  const evidenceCount = held.reduce((s, h) => s + (Array.isArray(h.evidenceEventIds) ? h.evidenceEventIds.length : 0), 0);

  let readinessValue: Readiness = "not_ready";
  if (coverage >= 0.85) readinessValue = "ready_now";
  else if (coverage >= 0.55) readinessValue = "ready_later";

  const drivers: Driver[] = gaps
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .map((g) => ({
      name: `${g.skillName}: ${g.currentLevel}/${g.requiredLevel}`,
      contribution: -g.gap / totalRequired,
      direction: "decreases",
      evidence: `role_skills requires level ${g.requiredLevel}; observed/declared level ${g.currentLevel}`,
      causalStatus: "association",
    }));

  const width = Math.max(0.08, 0.3 - Math.min(0.22, evidenceCount * 0.03));
  const low = Math.max(0, coverage - width / 2);
  const high = Math.min(1, coverage + width / 2);

  const readiness: Explain<Readiness> = {
    value: readinessValue,
    method:
      "Skill-coverage ratio of demonstrated (declared+observed) skill levels against the target role's declared skill requirements.",
    inputs: ["personSkills.level", "roleSkills.requiredLevel"],
    confidence: { low: Number(low.toFixed(3)), high: Number(high.toFixed(3)), level: 0.8 },
    drivers,
    uncertaintyNote:
      "Coverage reflects skills LEADOS has evidence for; it understates readiness for skills exercised but never logged, and says nothing about interview or stakeholder fit.",
    lawfulPurpose: "Workforce planning and equitable, evidence-linked succession/bench review.",
    asOf: new Date().toISOString(),
    limitations: [DISCLAIMER],
  };

  return {
    personId,
    name: actorRow?.name ?? personId,
    readiness,
    coverage: Number(coverage.toFixed(3)),
    estimatedMonthsToReady: readinessValue === "ready_now" ? 0 : estimateMonthsToReady(gaps),
    gaps: gaps.filter((g) => g.gap > 0),
  };
}

export async function buildSuccessionMatrix(
  actor: Actor,
  role: string,
  candidatePersonIds: string[],
): Promise<SuccessionMatrix> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} (${actor.globalRole}) may not read succession matrices`);

  const evaluations = await Promise.all(candidatePersonIds.map((id) => evaluateCandidate(id, role)));
  const readyNow = evaluations.filter((e) => e.readiness.value === "ready_now");
  const readyLater = evaluations.filter((e) => e.readiness.value === "ready_later");
  const notReady = evaluations.filter((e) => e.readiness.value === "not_ready");

  let coverageRisk: "low" | "medium" | "high" = "high";
  if (readyNow.length >= 2) coverageRisk = "low";
  else if (readyNow.length === 1) coverageRisk = "medium";

  return {
    role,
    readyNow,
    readyLater,
    notReady,
    benchStrength: {
      readyNowCount: readyNow.length,
      coverageRisk,
      rationale:
        coverageRisk === "high"
          ? "Zero or one ready-now successor identified from current skill evidence — a departure in this role would likely require an external hire or extended interim coverage."
          : coverageRisk === "medium"
            ? "Exactly one ready-now successor identified — single point of coverage; consider accelerating a ready-later candidate."
            : "Two or more ready-now successors identified from current skill evidence.",
    },
    disclaimer: DISCLAIMER,
    asOf: new Date().toISOString(),
  };
}

export async function peopleInRole(role: string): Promise<string[]> {
  const rows = await db.select({ id: people.id }).from(people).where(eq(people.role, role));
  return rows.map((r) => r.id);
}
