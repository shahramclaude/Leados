// src/lib/genome.ts
//
// NEW MODULE standing in for the "Part 1/2" behavioral genome referenced
// by this brief (no prior file existed — see provenance note in
// src/lib/types.ts). Deterministically derives a small set of stable
// behavioral trait proxies from a person's static record (role, skills,
// tenure) since no survey/assessment data source exists in this schema.
// All derivations are UNVERIFIED (original heuristic authored this
// session) — there is no external psychometric model being cited.

import type { PersonRecord } from "./types";

export interface PersonGenome {
  personId: number;
  adaptability: number; // 0-1
  collaborationAffinity: number; // 0-1
  autonomyPreference: number; // 0-1
  skillBreadth: number; // 0-1, normalized skill count
}

const COLLABORATIVE_ROLE_HINTS = ["manager", "lead", "partner", "coordinator", "success"];
const AUTONOMOUS_ROLE_HINTS = ["engineer", "architect", "researcher", "analyst", "designer"];

/**
 * Caller: src/lib/lifeStage.ts (computeLifeStage, 1 call site),
 * src/lib/talentEngine.ts (potential score tie-break, 1 call site).
 */
export function computeGenome(person: PersonRecord): PersonGenome {
  const roleLower = person.role.toLowerCase();
  const skillBreadth = Math.max(0, Math.min(1, person.skills.length / 10));

  const collaborationAffinity = COLLABORATIVE_ROLE_HINTS.some((h) => roleLower.includes(h))
    ? 0.75
    : 0.5;
  const autonomyPreference = AUTONOMOUS_ROLE_HINTS.some((h) => roleLower.includes(h)) ? 0.7 : 0.5;

  // Adaptability proxy: broader skill sets + less role specialization text
  // imply more adaptability. Clamp to [0,1].
  const adaptability = Math.max(0, Math.min(1, 0.3 + skillBreadth * 0.5 + (person.skills.length > 6 ? 0.2 : 0)));

  return {
    personId: person.id,
    adaptability,
    collaborationAffinity,
    autonomyPreference,
    skillBreadth,
  };
}
