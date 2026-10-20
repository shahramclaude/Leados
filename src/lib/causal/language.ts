/**
 * Language enforcement layer (Part 05, section D).
 *
 * Structural rule: every rendered sentence about a relationship between two
 * variables MUST be produced by `renderClaimSentence` (or one of the
 * templates below), which reads `estimate.identifiable` to pick verbs. There
 * is no code path in this module that lets a caller pass in "causes" as a
 * free-text string and have it survive un-checked -- `scanForBannedLanguage`
 * is also run as a test-time guard against ad-hoc copy elsewhere in the app.
 */

import type { CausalEstimate } from "./types";

export const BANNED_CAUSAL_VERBS = [
  "causes",
  "caused by",
  "causing",
  "drives",
  "driven by",
  "driving",
  "leads to",
  "led to",
  "results in",
  "resulted in",
  "because of",
  "due to",
  "is responsible for",
  "boosts",
  "increases retention", // flagship-claim-shaped phrasing guard
  "improves",
] as const;

const ASSOCIATION_VERBS = ["is associated with", "moves with", "correlates with"];
const CAUSAL_VERBS = ["drives", "causes", "has a causal effect on"];

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtCi(ci: [number, number]): string {
  return `[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]`;
}

/**
 * The ONLY function allowed to describe a relationship between a treatment
 * and an outcome in prose. Picks verbs purely from `estimate.identifiable`.
 */
export function renderClaimSentence(subjectLabel: string, outcomeLabel: string, estimate: CausalEstimate): string {
  if (estimate.identifiable && estimate.estimate) {
    const verb = CAUSAL_VERBS[0];
    return (
      `${subjectLabel} ${verb} ${outcomeLabel}: estimated effect ${estimate.estimate.ate.toFixed(3)} ` +
      `${fmtCi(estimate.estimate.ci)} (${estimate.estimate.method}, n=${estimate.sampleSize}). ` +
      `Identified via adjustment set [${estimate.adjustmentSet.join(", ") || "none needed"}].`
    );
  }

  const assoc = estimate.associationOnly;
  const r = assoc ? assoc.r.toFixed(2) : "unknown";
  const ciText = assoc ? fmtCi(assoc.ci) : "[n/a]";
  return (
    `${subjectLabel} ${ASSOCIATION_VERBS[0]} ${outcomeLabel} (association only, not causal): r=${r} ${ciText}. ` +
    `${estimate.confoundersSuspected.length > 0 ? `Suspected confounders: ${estimate.confoundersSuspected.join(", ")}.` : "Not identifiable from the current DAG."}`
  );
}

/** "What would move this?" ranking line — also phrasing-layer governed. */
export function renderInterventionSentence(
  interventionLabel: string,
  estimate: CausalEstimate,
  costPerUnit: number
): string {
  if (!estimate.identifiable || !estimate.estimate) {
    return `${interventionLabel}: effect not identifiable from current data — cannot be ranked as an intervention lever yet (association only).`;
  }
  const perCost = estimate.estimate.ate / Math.max(costPerUnit, 1e-6);
  return `${interventionLabel}: expected effect ${estimate.estimate.ate.toFixed(3)} per unit, ${perCost.toFixed(4)} per unit cost (${estimate.estimate.method}).`;
}

export interface LanguageViolation {
  phrase: string;
  index: number;
}

/**
 * Scans arbitrary rendered text for banned causal verbs. Intended use: pass
 * in any string the product plans to show alongside a NON-identifiable
 * `CausalEstimate`; the test suite fails the build if any banned phrase
 * appears outside of the "association only" disclaimer itself.
 */
export function scanForBannedLanguage(text: string): LanguageViolation[] {
  const lower = text.toLowerCase();
  const violations: LanguageViolation[] = [];
  for (const phrase of BANNED_CAUSAL_VERBS) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      violations.push({ phrase, index: idx });
      idx = lower.indexOf(phrase, idx + 1);
    }
  }
  return violations;
}

/**
 * Asserts a template rendered for a given estimate contains no banned
 * causal language when the estimate is not identifiable. Throws with the
 * offending phrase so a failing test points directly at the bug.
 */
export function assertLanguageMatchesIdentifiability(text: string, estimate: CausalEstimate): void {
  if (estimate.identifiable) return;
  const violations = scanForBannedLanguage(text);
  if (violations.length > 0) {
    throw new Error(
      `Non-identifiable estimate rendered with causal language: ${JSON.stringify(violations)} in "${text}"`
    );
  }
}
