// =============================================================================
// Part 32 — zero-filler + speech-ready lint.
// =============================================================================
// Extends the repo's zero-filler discipline (`src/lib/sensing/briefing.ts`,
// `scripts/lint-briefs.ts`) with the speech-readiness checks this part's
// voice/ambient seam requires: short sentences (a TTS engine reads run-on
// sentences badly) and no inline tables in prose (tables have no linear
// reading order, so they cannot be spoken — they must move to the evidence
// appendix as structured data instead).
export const FILLER_PHRASES = [
  "fast-paced", "moving forward", "circle back", "synergy", "going forward",
  "today's environment", "it is important to note", "stay tuned",
  "exciting times", "game changer", "think outside the box", "at the end of the day",
  "low-hanging fruit", "deep dive", "touch base", "paradigm shift",
];

export const MAX_SPEECH_SENTENCE_WORDS = 28;

export interface LintResult {
  passed: boolean;
  errors: string[];
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function containsTableMarkup(text: string): boolean {
  // A pipe-delimited row, or 3+ consecutive tab/multi-space-separated
  // columns, reads as tabular rather than linear prose.
  return /\|.*\|/.test(text) || /\t.*\t/.test(text);
}

/** Zero-filler lint: every content line must carry a real number and no
 * banned filler phrase. Ported from `src/lib/sensing/briefing.ts`. */
export function lintZeroFiller(lines: string[]): LintResult {
  const errors: string[] = [];
  const lower = lines.join("\n").toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    if (lower.includes(phrase)) errors.push(`Filler phrase detected: "${phrase}"`);
  }
  for (const line of lines) {
    if (line.trim().length > 0 && !/\d/.test(line)) {
      errors.push(`Line has no referenced number: "${line}"`);
    }
  }
  return { passed: errors.length === 0, errors };
}

/** Speech-ready lint: short sentences, no tables in prose. This is the gate
 * for DailyBrief (Phase 4, gate 5). */
export function lintSpeechReady(prose: string): LintResult {
  const errors: string[] = [];
  if (containsTableMarkup(prose)) {
    errors.push("Prose contains table markup (pipe/tab-delimited row) — move to evidence appendix as structured data.");
  }
  for (const sentence of splitSentences(prose)) {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_SPEECH_SENTENCE_WORDS) {
      errors.push(`Sentence exceeds ${MAX_SPEECH_SENTENCE_WORDS} words (${wordCount}): "${sentence}"`);
    }
  }
  return { passed: errors.length === 0, errors };
}
