// Language policy (Part 05), enforced on every piece of LLM / agent
// generated text (Part 11) before it reaches a human surface. The rule:
// absolute/certain language is not allowed unless confidence is high; if the
// model (or a human-authored template) uses it anyway, we flag it and
// soften the sentence rather than silently shipping an overconfident claim.
export interface LanguagePolicyResult {
  text: string;
  violations: string[];
  rewritten: boolean;
}

const ABSOLUTE_PATTERNS: { re: RegExp; hedge: string }[] = [
  { re: /\bwill definitely\b/gi, hedge: "is likely to" },
  { re: /\bguaranteed to\b/gi, hedge: "likely to" },
  { re: /\bguarantee(s|d)?\b/gi, hedge: "strong likelihood" },
  { re: /\bcertainly\b/gi, hedge: "probably" },
  { re: /\bwithout (a )?doubt\b/gi, hedge: "with reasonable confidence" },
  { re: /\balways converts?\b/gi, hedge: "has converted in most observed cases" },
  { re: /\bnever fails?\b/gi, hedge: "rarely fails in observed cases" },
  { re: /\b100% (sure|certain)\b/gi, hedge: "highly confident" },
  { re: /\bwill close\b/gi, hedge: "is projected to close" },
];

const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Scans `text` for absolute-certainty language. If `confidence` does not
 * meet the high-confidence bar, every matched phrase is rewritten to a
 * hedged equivalent and recorded as a violation (caller should attach the
 * violation list to the Explain<T>.policyViolations field).
 */
export function enforceLanguagePolicy(text: string, confidence: number): LanguagePolicyResult {
  const violations: string[] = [];
  let rewritten = false;
  let output = text;

  for (const { re, hedge } of ABSOLUTE_PATTERNS) {
    if (re.test(output)) {
      // reset lastIndex since these regexes are reused with /g
      re.lastIndex = 0;
      if (confidence < HIGH_CONFIDENCE_THRESHOLD) {
        violations.push(`absolute language rewritten: "${re.source}" -> "${hedge}"`);
        output = output.replace(re, hedge);
        rewritten = true;
      } else {
        violations.push(`absolute language allowed at high confidence: "${re.source}"`);
      }
    }
  }

  return { text: output, violations, rewritten };
}

export const LANGUAGE_POLICY_HIGH_CONFIDENCE_THRESHOLD = HIGH_CONFIDENCE_THRESHOLD;
