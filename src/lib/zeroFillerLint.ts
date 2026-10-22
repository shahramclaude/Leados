// LEADOS Part 14 — zero-filler lint for generated text.
// Stand-in for Part 13's lint utility (not present in this repo snapshot).
// Flags generic filler phrasing and content with no concrete numbers/nouns,
// so digests read as "3 new leads, 1 approval overdue by 2 days" rather than
// "there have been various updates you may want to review".
const BANNED_PHRASES = [
  "various updates",
  "a number of",
  "as an ai",
  "in today's fast-paced",
  "it's worth noting",
  "leverage synergy",
  "touch base",
  "circle back",
  "moving forward",
  "at the end of the day",
  "a lot of",
  "stuff like that",
  "etc.",
  "you may want to review",
  "please be advised",
];

export interface LintViolation {
  phrase: string;
  index: number;
}

export interface LintResult {
  clean: boolean;
  violations: LintViolation[];
  hasConcreteNumber: boolean;
}

export function lintForFiller(text: string): LintResult {
  const lower = text.toLowerCase();
  const violations: LintViolation[] = [];
  for (const phrase of BANNED_PHRASES) {
    const index = lower.indexOf(phrase);
    if (index !== -1) violations.push({ phrase, index });
  }
  const hasConcreteNumber = /\d/.test(text);
  return {
    clean: violations.length === 0 && hasConcreteNumber,
    violations,
    hasConcreteNumber,
  };
}

export function assertNoFiller(text: string, context: string): void {
  const result = lintForFiller(text);
  if (!result.clean) {
    const reasons: string[] = [];
    if (result.violations.length > 0) {
      reasons.push(`banned phrases: ${result.violations.map((v) => `"${v.phrase}"`).join(", ")}`);
    }
    if (!result.hasConcreteNumber) {
      reasons.push("no concrete number/count present");
    }
    throw new Error(`zero-filler lint failed for ${context}: ${reasons.join("; ")} — text was: "${text}"`);
  }
}
