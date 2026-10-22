/**
 * src/content/causalNarratives.ts
 * Fixture consumed by `causal:lint`. Includes:
 *  - the live, generator-produced narratives from the demo claim bundle
 *    (always compliant, because they are produced by
 *    languagePolicy.generateNarrative), AND
 *  - a deliberately SEEDED VIOLATION (a hand-written narrative mislabeled
 *    as a weaker class than its language implies) so the lint gate can be
 *    proven to actually catch violations rather than trivially passing.
 * The seeded violation is never rendered in the app — it exists only so
 * `scripts/causalLint.ts` has a known-bad case to catch, per Phase 4 gate
 * (4): "causal:lint catches seeded violations".
 */
import { getDemoBundle } from "../lib/causal/causalIntegration";
import type { ClaimClass } from "../lib/causal/types";

export interface NarrativeFixtureItem {
  id: string;
  text: string;
  claimClass: ClaimClass;
}

export function getLiveNarrativeFixtures(): NarrativeFixtureItem[] {
  const bundle = getDemoBundle();
  return bundle.claims.map((c) => ({ id: c.id, text: c.narrative, claimClass: c.class }));
}

/** Deliberately seeded violations for self-testing the linter. DO NOT render these. */
export const SEEDED_VIOLATIONS: NarrativeFixtureItem[] = [
  {
    id: "seeded-violation-1",
    text: "The new outreach cadence caused a 24% lift in conversions.",
    claimClass: "associational", // violation: "caused" is a causal-strength phrase on an associational claim
  },
  {
    id: "seeded-violation-2",
    text: "Training completion drove higher quota attainment across the team.",
    claimClass: "suggestive", // violation: "drove" is causal-strength on a suggestive claim
  },
];
