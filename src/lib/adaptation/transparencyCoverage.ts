// src/lib/adaptation/transparencyCoverage.ts
//
// Builds the "coverage table" for the Adaptation Transparency Panel: for
// every adaptation class (presentation/emphasis/sequence), state whether it
// was applied in the current view and why — even when it wasn't used, so the
// panel always explains all three classes (Phase 4 gate #3).

import type { AdaptationClass } from "@/lib/adaptation/manipulationGuard";
import type { AppliedAction, PresentationResult } from "@/lib/adaptation/presentationAdapter";

export interface CoverageEntry {
  class: AdaptationClass;
  applied: boolean;
  blocked: boolean;
  examples: AppliedAction[];
  explanation: string;
}

const CLASS_EXPLANATIONS: Record<AdaptationClass, string> = {
  presentation:
    "Changes density and layout (guided/standard/dense, narrative/hybrid/table) based on your expertise and style. Never changes which facts are shown.",
  emphasis:
    "Would highlight or de-emphasize specific facts. Requires rationale + counterfactual and is guard-checked; none used on this view unless listed above.",
  sequence:
    "Reorders facts based on your recent usage. Critical/high-severity facts can never be moved below the neutral default rank.",
};

const ALL_CLASSES: AdaptationClass[] = ["presentation", "emphasis", "sequence"];

export function computeCoverage(result: Pick<PresentationResult, "actions">): CoverageEntry[] {
  return ALL_CLASSES.map((cls) => {
    const examples = result.actions.filter((a) => a.class === cls);
    return {
      class: cls,
      applied: examples.length > 0 && examples.some((a) => !a.verdict.blocked),
      blocked: examples.some((a) => a.verdict.blocked),
      examples,
      explanation: CLASS_EXPLANATIONS[cls],
    };
  });
}
