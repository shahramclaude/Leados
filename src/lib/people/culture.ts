// src/lib/people/culture.ts
//
// Team-composition "complementarity" needs more than skill levels to be
// useful — this module adds a SELF-DECLARED, OPT-IN working-style signal
// (not inferred, not behavioral-surveillance-derived) that the team composer
// can use to avoid stacking a team with five people who all want to work the
// same way. This is explicitly NOT a proxy for any protected characteristic:
// it is a single free choice the person makes and can change at any time,
// scoped the same way skill evidence is.

export type WorkingStyle = "deep-focus-blocks" | "high-collaboration" | "structured-process" | "flexible-adaptive";

export interface WorkingStyleDeclaration {
  personId: string;
  style: WorkingStyle;
  declaredAt: string;
}

/** Diversity of self-declared working styles across a roster, 0 (identical) .. 1 (maximally varied). */
export function cultureComplementarityScore(declarations: WorkingStyleDeclaration[]): number {
  if (declarations.length <= 1) return 0;
  const counts = new Map<WorkingStyle, number>();
  for (const d of declarations) counts.set(d.style, (counts.get(d.style) ?? 0) + 1);
  const distinctStyles = counts.size;
  const maxPossible = Math.min(4, declarations.length);
  return distinctStyles / maxPossible;
}

export function describeTeamStyleMix(declarations: WorkingStyleDeclaration[]): string {
  const counts = new Map<WorkingStyle, number>();
  for (const d of declarations) counts.set(d.style, (counts.get(d.style) ?? 0) + 1);
  const parts = [...counts.entries()].map(([style, n]) => `${n} ${style.replace(/-/g, " ")}`);
  return parts.length ? `Team style mix: ${parts.join(", ")}.` : "No working-style declarations on file yet.";
}
