// src/lib/lifeStage.ts
//
// NEW MODULE standing in for the "Part 1/2" life-stage model referenced by
// this brief (no prior file existed — see provenance note in
// src/lib/types.ts). Maps tenure + genome traits to a coarse career-stage
// label used for contextualizing growth/performance expectations.
// UNVERIFIED (original heuristic authored this session) — tenure bands are
// a reasonable but invented convention, not drawn from any cited model.

import type { LifeStage, PersonRecord } from "./types";
import type { PersonGenome } from "./genome";

/**
 * Caller: src/lib/talentEngine.ts (buildPersonProfile, 1 call site).
 */
export function computeLifeStage(
  person: PersonRecord,
  tenureMonths: number,
  genome: PersonGenome
): LifeStage {
  if (tenureMonths < 6) return "early_career";
  if (tenureMonths < 18) return "establishing";
  if (tenureMonths < 36) return "growth";
  if (tenureMonths < 60) {
    return genome.adaptability > 0.6 ? "growth" : "senior_steady";
  }
  return genome.skillBreadth > 0.6 ? "senior_steady" : "plateau";
}

/** Rough helper to compute tenure in whole months from an ISO start date. */
export function tenureInMonths(startDateIso: string, asOf: Date = new Date()): number {
  const start = new Date(startDateIso);
  if (Number.isNaN(start.getTime())) return 0;
  const months =
    (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  return Math.max(0, months);
}
