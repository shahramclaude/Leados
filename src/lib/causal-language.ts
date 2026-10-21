// Causal language rules (Part 05 lineage), enforced on every LLM-generated
// proposal (Part 08 lineage) before it is ever persisted or shown to a user.
//
// Rule: a generated text may only use causal verbs ("causes", "leads to",
// "results in", "drives", "forces") when the finding's causal confidence is
// "experimental" (i.e. backed by a controlled experiment / randomised test).
// Otherwise every causal verb is rewritten to an associational equivalent and
// the rewrite is counted, so downstream consumers (and tests) can prove the
// rule actually fired instead of trusting that the model behaved.

import type { causalConfidenceEnum } from "@/db/schema";

export type CausalConfidence = (typeof causalConfidenceEnum.enumValues)[number];

const CAUSAL_REWRITES: Array<[RegExp, string]> = [
  [/\bcauses?\b/gi, "is associated with"],
  [/\bcausing\b/gi, "co-occurring with"],
  [/\bleads? to\b/gi, "is followed by"],
  [/\bresults? in\b/gi, "is correlated with"],
  [/\bdrives?\b/gi, "tracks with"],
  [/\bforces?\b/gi, "coincides with"],
  [/\bguarantees?\b/gi, "is consistent with"],
];

export type SanitizeResult = {
  sanitized: string;
  rewriteCount: number;
};

export function sanitizeCausalLanguage(
  text: string,
  causalConfidence: CausalConfidence,
): SanitizeResult {
  if (causalConfidence === "experimental") {
    // Experimentally-backed findings are allowed to keep causal language.
    return { sanitized: text, rewriteCount: 0 };
  }

  let rewriteCount = 0;
  let sanitized = text;
  for (const [pattern, replacement] of CAUSAL_REWRITES) {
    sanitized = sanitized.replace(pattern, () => {
      rewriteCount += 1;
      return replacement;
    });
  }
  return { sanitized, rewriteCount };
}
