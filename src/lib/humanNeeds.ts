// src/lib/humanNeeds.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. This is a minimal
// stand-in for the real `humanNeeds.ts` from earlier parts, exposing just
// the taxonomy Part 52 uses to frame language so coaching never curdles
// into pressure (Phase 5 question #2).

export type HumanNeed = "autonomy" | "rest" | "connection" | "mastery" | "meaning";

export const HUMAN_NEEDS: HumanNeed[] = ["autonomy", "rest", "connection", "mastery", "meaning"];

/**
 * Copy-linting helper: phrases that tend to convert a needs-respecting
 * suggestion into a productivity-pressure demand. Used by the
 * uncertainty/coaching-tone checks in leaderState surfaces and tests.
 */
export const PRESSURE_LANGUAGE_PATTERNS: RegExp[] = [
  /you (should|must|need to) (work|decide|push)/i,
  /underperform/i,
  /falling behind/i,
  /not productive enough/i,
  /optimi[sz]e your(self)?\b.*output/i,
  /maximi[sz]e (every|all) (hour|minute)/i,
];

export function violatesNeedsRespectingTone(text: string): string[] {
  return PRESSURE_LANGUAGE_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}
