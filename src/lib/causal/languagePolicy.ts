/**
 * src/lib/causal/languagePolicy.ts
 * Enforces the language policy from the standing order:
 *   class: "causal"        -> may use "caused" / "led to"
 *   class: "suggestive"    -> "likely contributed to"
 *   class: "associational" -> "moved together with"
 * Any generated narrative that uses a stronger verb than its claim class
 * allows fails `causal:lint`. This module is the single source of truth for
 * both (a) generating compliant narratives and (b) linting arbitrary text.
 */
import type { ClaimClass, CausalClaim } from "./types";

export const ALLOWED_PHRASES: Record<ClaimClass, string[]> = {
  causal: ["caused", "cause", "led to", "leads to", "drove", "driven by", "resulted in"],
  suggestive: ["likely contributed to", "probably contributed to", "appears to have contributed to"],
  associational: ["moved together with", "is associated with", "correlates with", "co-occurred with"],
};

/** Phrases that are categorically too strong for a given class (checked in order from strongest to weakest). */
const STRONG_CAUSAL_PHRASES = [
  "caused",
  "cause of",
  "led to",
  "leads to",
  "drove",
  "driven by",
  "resulted in",
  "because of",
  "due to",
  "the reason",
  "improved because",
  "impact of",
];

const SUGGESTIVE_PHRASES = ["likely contributed to", "probably contributed to", "appears to have contributed to"];

const ASSOCIATIONAL_PHRASES = ["moved together with", "is associated with", "correlates with", "co-occurred with"];

export interface LintViolation {
  text: string;
  matchedPhrase: string;
  claimClass: ClaimClass;
  reason: string;
}

/**
 * Rank: associational(0) < suggestive(1) < causal(2). A narrative is a
 * violation if it uses a phrase ranked STRICTLY higher than its claim's class.
 */
function phraseRank(phrase: string): number {
  const p = phrase.toLowerCase();
  if (STRONG_CAUSAL_PHRASES.some((s) => p.includes(s))) return 2;
  if (SUGGESTIVE_PHRASES.some((s) => p.includes(s))) return 1;
  if (ASSOCIATIONAL_PHRASES.some((s) => p.includes(s))) return 0;
  return -1; // no recognized causal-language phrase at all
}

function classRank(c: ClaimClass): number {
  return c === "causal" ? 2 : c === "suggestive" ? 1 : 0;
}

/** Lint a single piece of narrative text against the claim class it is attached to. */
export function lintNarrative(text: string, claimClass: ClaimClass): LintViolation[] {
  const violations: LintViolation[] = [];
  const lower = text.toLowerCase();
  const allPhrases = [...STRONG_CAUSAL_PHRASES, ...SUGGESTIVE_PHRASES, ...ASSOCIATIONAL_PHRASES];
  for (const phrase of allPhrases) {
    if (lower.includes(phrase)) {
      const rank = phraseRank(phrase);
      if (rank > classRank(claimClass)) {
        violations.push({
          text,
          matchedPhrase: phrase,
          claimClass,
          reason: `Phrase "${phrase}" implies a stronger claim (rank ${rank}) than the claim's class "${claimClass}" (rank ${classRank(
            claimClass,
          )}) allows.`,
        });
      }
    }
  }
  return violations;
}

/** Lint every narrative in a list of {text, claimClass} pairs (used by scripts/causalLint.ts). */
export function lintNarratives(items: { id: string; text: string; claimClass: ClaimClass }[]): { id: string; violations: LintViolation[] }[] {
  return items.map((item) => ({ id: item.id, violations: lintNarrative(item.text, item.claimClass) })).filter((r) => r.violations.length > 0);
}

/**
 * Generate a compliant narrative for a resolved CausalClaim. This is the
 * ONLY place narrative strings should be constructed for causal surfaces —
 * never hand-write "X drove Y" copy elsewhere in the app.
 */
export function generateNarrative(claim: Pick<CausalClaim, "treatment" | "outcome" | "class" | "estimate" | "unit">): string {
  const { treatment, outcome, class: claimClass, estimate, unit } = claim;
  const magnitude = `${estimate.value >= 0 ? "+" : ""}${estimate.value.toFixed(2)} ${unit} (${estimate.coverage * 100}% interval: ${estimate.low.toFixed(
    2,
  )} to ${estimate.high.toFixed(2)})`;
  if (claimClass === "causal") {
    return `${treatment} caused a change in ${outcome} of ${magnitude}, under the stated identification strategy and assumptions.`;
  }
  if (claimClass === "suggestive") {
    return `${treatment} likely contributed to a change in ${outcome} of ${magnitude}, though identification is incomplete or diagnostics were mixed.`;
  }
  return `${treatment} moved together with ${outcome} (${magnitude}) in the observed data; this has not been identified as causal.`;
}

/**
 * Determine (and if necessary downgrade) a claim's class from its
 * diagnostics, per the honesty rule: a causal claim without a sound
 * identifiability argument is a delivery failure, so we refuse to label
 * anything "causal" unless the backdoor/parallel-trends/weak-instrument/etc.
 * checks actually pass.
 */
export function resolveClaimClass(input: {
  identificationValid: boolean;
  placeboPassed: boolean | null;
  diagnosticFlags: { label: string; ok: boolean }[];
}): { claimClass: ClaimClass; downgradeReasons: string[] } {
  const downgradeReasons: string[] = [];
  const failedDiagnostics = input.diagnosticFlags.filter((d) => !d.ok);

  if (!input.identificationValid) {
    downgradeReasons.push("Identification strategy failed its validity check (e.g. backdoor criterion not satisfied, or invalid adjustment set).");
    return { claimClass: "associational", downgradeReasons };
  }
  if (input.placeboPassed === false) {
    downgradeReasons.push("Placebo test found a significant 'effect' where none should exist, indicating the design may be picking up confounding or trend artifacts rather than a true effect.");
  }
  if (failedDiagnostics.length > 0) {
    downgradeReasons.push(`Diagnostic checks failed: ${failedDiagnostics.map((d) => d.label).join(", ")}.`);
  }

  if (input.placeboPassed === false || failedDiagnostics.length > 0) {
    return { claimClass: "suggestive", downgradeReasons };
  }
  return { claimClass: "causal", downgradeReasons };
}
