/**
 * Inclusive-access helpers (Section F). Kept dependency-free and pure so
 * they're trivially unit-testable and usable in both server and client
 * code.
 */

export const MAX_PLAIN_SENTENCE_WORDS = 15;

/**
 * Controlled vocabulary for plain-language mode. Keys are lowercase source
 * terms; values are the plain-language replacement in the same locale. This
 * is intentionally a small, auditable list rather than an LLM call, so its
 * output is deterministic and testable.
 */
const PLAIN_VOCABULARY: Record<"en-US" | "da-DK", Record<string, string>> = {
  "en-US": {
    attrition: "people leaving",
    engagement: "how involved people feel",
    rebalance: "move work around",
    utilization: "how busy someone is",
    stakeholder: "person involved",
    initiative: "project",
    leverage: "use",
    synerg: "work together", // matches "synergy"/"synergies" as a prefix
  },
  "da-DK": {
    tiltrædelse: "folk der stopper",
    engagement: "hvor involverede folk føler sig",
    interessent: "person der er involveret",
    initiativ: "projekt",
    udnytte: "bruge",
  },
};

/** Splits on sentence-final punctuation while keeping it attached to the sentence. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function capSentenceLength(sentence: string, maxWords: number): string[] {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return [sentence];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(" ");
    chunks.push(/[.!?]$/.test(chunk) ? chunk : `${chunk}.`);
  }
  return chunks;
}

function substituteVocabulary(sentence: string, locale: "en-US" | "da-DK"): string {
  let result = sentence;
  for (const [term, replacement] of Object.entries(PLAIN_VOCABULARY[locale])) {
    const re = new RegExp(term, "gi");
    result = result.replace(re, replacement);
  }
  return result;
}

/**
 * Converts executive-summary prose into plain language: controlled
 * vocabulary substitution + a hard sentence-length cap. Deterministic and
 * measurable via `scorePlainLanguage` below (used by
 * `tests/a11y-plain-language.test.ts`... kept inline-testable here too).
 */
export function toPlainLanguage(text: string, locale: "en-US" | "da-DK" = "en-US"): string {
  const sentences = splitSentences(text);
  const withVocabulary = sentences.map((s) => substituteVocabulary(s, locale));
  const capped = withVocabulary.flatMap((s) => capSentenceLength(s, MAX_PLAIN_SENTENCE_WORDS));
  return capped.join(" ");
}

export type PlainLanguageScore = {
  maxSentenceWords: number;
  averageSentenceWords: number;
  withinCap: boolean;
};

export function scorePlainLanguage(text: string): PlainLanguageScore {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const max = Math.max(0, ...lengths);
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  return { maxSentenceWords: max, averageSentenceWords: avg, withinCap: max <= MAX_PLAIN_SENTENCE_WORDS };
}

/** Colorblind-safe severity encoding: never color alone — always paired with shape/icon + text label. */
export const SEVERITY_ENCODING: Record<"info" | "watch" | "urgent", { color: string; icon: string; pattern: string }> = {
  info: { color: "#2563eb", icon: "ℹ️", pattern: "solid" },
  watch: { color: "#b45309", icon: "▲", pattern: "diagonal-stripes" },
  urgent: { color: "#b91c1c", icon: "■", pattern: "cross-hatch" },
};

/** Minimal focus trap for modal/dialog surfaces (conflict resolution, wizard). */
export function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export const SKIP_LINK_TARGET_ID = "main-content";
