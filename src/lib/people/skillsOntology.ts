// src/lib/people/skillsOntology.ts
//
// The skill graph: prerequisites (`requires`), refinements (`specializes`),
// equivalence (`equivalent`), and behavioral anchors for levels 1-5.
//
// Design note: anchors are WRITTEN, observable behaviors, not adjectives.
// "4" always means something a person could point to and say "yes/no I did
// that", because level numbers with no anchor are exactly the kind of opaque
// score this part is forbidden from shipping.

import type { Skill, SkillLevel } from "./types";

export function buildAnchors(skillName: string, overrides?: Partial<Record<SkillLevel, string>>): Record<SkillLevel, string> {
  const base: Record<SkillLevel, string> = {
    1: `Aware of ${skillName}: can describe what it is and when it matters, with guidance needed to apply it.`,
    2: `Assisted in ${skillName}: has applied it on a real task with review/pairing, needed help on edge cases.`,
    3: `Independent in ${skillName}: completes typical tasks unaided, knows the common failure modes, asks for help on the unusual ones.`,
    4: `Deep in ${skillName}: handles ambiguous/non-standard cases, is a go-to reviewer for others' work in this area, improves the team's approach to it.`,
    5: `Sets direction in ${skillName}: shapes how the org does this, mentors other level-4s, has a track record others point to as the reference example.`,
  };
  return { ...base, ...(overrides ?? {}) };
}

/**
 * Seeded skill ontology. Intentionally small and concrete (software/product
 * org) rather than an exhaustive taxonomy — the graph shape (requires /
 * specializes / equivalent) is what this part needs to demonstrate and test.
 */
export const SEED_SKILLS: Skill[] = [
  {
    id: "programming-fundamentals",
    name: "Programming Fundamentals",
    category: "Engineering",
    requires: [],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("programming fundamentals"),
  },
  {
    id: "backend-services",
    name: "Backend Services",
    category: "Engineering",
    requires: ["programming-fundamentals"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("building backend services", {
      4: "Designs service boundaries and data ownership others build against; diagnoses production incidents in services they didn't write.",
    }),
  },
  {
    id: "distributed-systems",
    name: "Distributed Systems",
    category: "Engineering",
    requires: ["backend-services"],
    specializes: ["backend-services"],
    equivalent: [],
    levelAnchors: buildAnchors("distributed systems design"),
  },
  {
    id: "frontend-engineering",
    name: "Frontend Engineering",
    category: "Engineering",
    requires: ["programming-fundamentals"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("frontend engineering"),
  },
  {
    id: "data-engineering",
    name: "Data Engineering",
    category: "Data",
    requires: ["programming-fundamentals"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("data engineering"),
  },
  {
    id: "data-analysis",
    name: "Data Analysis",
    category: "Data",
    requires: [],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("data analysis"),
  },
  {
    id: "ml-modeling",
    name: "ML Modeling",
    category: "Data",
    requires: ["data-analysis", "programming-fundamentals"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("machine learning modeling"),
  },
  {
    id: "product-discovery",
    name: "Product Discovery",
    category: "Product",
    requires: [],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("product discovery"),
  },
  {
    id: "product-execution",
    name: "Product Execution",
    category: "Product",
    requires: ["product-discovery"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("product execution"),
  },
  {
    id: "interaction-design",
    name: "Interaction Design",
    category: "Design",
    requires: [],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("interaction design"),
  },
  {
    id: "visual-design",
    name: "Visual Design",
    category: "Design",
    requires: [],
    specializes: [],
    equivalent: ["interaction-design"],
    levelAnchors: buildAnchors("visual design"),
  },
  {
    id: "people-leadership",
    name: "People Leadership",
    category: "Leadership",
    requires: [],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("people leadership", {
      4: "Grows other leads; owns a team's health and delivery simultaneously without burning the team down.",
    }),
  },
  {
    id: "technical-leadership",
    name: "Technical Leadership",
    category: "Leadership",
    requires: ["backend-services"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("technical leadership"),
  },
  {
    id: "incident-response",
    name: "Incident Response",
    category: "Engineering",
    requires: ["backend-services"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("incident response"),
  },
  {
    id: "security-engineering",
    name: "Security Engineering",
    category: "Engineering",
    requires: ["backend-services"],
    specializes: [],
    equivalent: [],
    levelAnchors: buildAnchors("security engineering"),
  },
];

export const SKILLS_BY_ID: Record<string, Skill> = Object.fromEntries(SEED_SKILLS.map((s) => [s.id, s]));

export function getSkill(skillId: string): Skill | undefined {
  return SKILLS_BY_ID[skillId];
}

/** Evidence source -> starting confidence before any time decay. */
export const SOURCE_BASE_CONFIDENCE: Record<string, number> = {
  claimed: 0.4,
  endorsed: 0.65,
  "demonstrated-by-work-evidence": 0.9,
};

/** Half-life, in days, of each evidence source's confidence. Demonstrated work evidence decays slowest. */
export const SOURCE_DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  claimed: 90,
  endorsed: 180,
  "demonstrated-by-work-evidence": 365,
};

export const MIN_CONFIDENCE_FLOOR = 0.05;

/** Returns every ancestor skill id reachable via `requires` edges (transitively). */
export function requiredAncestors(skillId: string, skills: Skill[] = SEED_SKILLS): string[] {
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const stack = [...(byId[skillId]?.requires ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(byId[next]?.requires ?? []));
  }
  return [...seen];
}

/** Returns the base skills a given skill specializes (direct, not transitive — specialization chains are kept shallow by design). */
export function specializationBases(skillId: string, skills: Skill[] = SEED_SKILLS): string[] {
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  return byId[skillId]?.specializes ?? [];
}

/** Returns the equivalence class (including the skill itself) for fit-scoring substitution. */
export function equivalenceClass(skillId: string, skills: Skill[] = SEED_SKILLS): string[] {
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  const set = new Set<string>([skillId, ...(byId[skillId]?.equivalent ?? [])]);
  // equivalence is declared symmetric in the seed data; also scan reverse direction defensively
  for (const s of skills) {
    if (s.equivalent.includes(skillId)) set.add(s.id);
  }
  return [...set];
}
