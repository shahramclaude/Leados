// Part 05 stand-in: causal-language rules shared across the product.
//
// Rule: any copy describing an association between a people-analytics signal
// and an outcome must use association language ("is associated with",
// "correlates with", "is linked to") unless the underlying estimate has
// `causalStatus === 'causal_identified'` (e.g. from a randomized design),
// in which case stronger language ("causes", "leads to", "results in") is
// permitted. UI copy is scanned by `scripts/scan-causal-language.ts`.

import type { CausalStatus } from "./explain";

export const BANNED_CAUSAL_PHRASES = [
  "causes",
  "caused by",
  "leads to",
  "led to",
  "results in",
  "resulted in",
  "because of",
  "due to",
  "will quit",
  "will leave",
  "guarantees",
  "proves",
];

/** Phrases that are always acceptable because they only claim association. */
export const ASSOCIATION_PHRASES = [
  "is associated with",
  "associated with",
  "correlates with",
  "is linked to",
  "tends to co-occur with",
  "co-occurs with",
];

export interface CausalViolation {
  phrase: string;
  index: number;
  context: string;
}

/**
 * Scans free text for banned causal phrasing. Returns violations; callers
 * should treat any non-empty result as a hard failure unless the text is
 * explicitly tagged as describing a `causal_identified` finding.
 */
export function scanForCausalClaims(text: string): CausalViolation[] {
  const lower = text.toLowerCase();
  const violations: CausalViolation[] = [];
  for (const phrase of BANNED_CAUSAL_PHRASES) {
    let fromIndex = 0;
    for (;;) {
      const idx = lower.indexOf(phrase, fromIndex);
      if (idx === -1) break;
      violations.push({
        phrase,
        index: idx,
        context: text.slice(Math.max(0, idx - 30), idx + phrase.length + 30),
      });
      fromIndex = idx + phrase.length;
    }
  }
  return violations;
}

/** Renders a driver/counterfactual's language-safe label given its causal status. */
export function associationLabel(causalStatus: CausalStatus): string {
  switch (causalStatus) {
    case "causal_identified":
      return "causes";
    case "causal_candidate":
      return "may contribute to (not yet identified as causal)";
    case "association":
    default:
      return "is associated with";
  }
}

/** Wraps a plain factor + outcome into guaranteed-safe copy. */
export function phraseAssociation(factor: string, outcome: string, causalStatus: CausalStatus): string {
  return `${factor} ${associationLabel(causalStatus)} ${outcome}`;
}
