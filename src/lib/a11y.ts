// Accessibility helpers shared by server and client components.

export const TEXT_SCALE_STEPS = [100, 125, 150, 200] as const;
export type TextScale = (typeof TEXT_SCALE_STEPS)[number];

export const MIN_TAP_TARGET_PX = 44;

// Plain-language mode gate: executive-summary copy must average no more than
// this many words per sentence. Used both by the UI (to pick the `.plain`
// template variant) and by `scripts/verify.ts` (to measure real rendered
// output, not just trust the author).
export const PLAIN_LANGUAGE_MAX_WORDS_PER_SENTENCE = 16;

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function averageWordsPerSentence(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).filter(Boolean).length, 0);
  return totalWords / sentences.length;
}

export function isPlainLanguageCompliant(text: string): boolean {
  return averageWordsPerSentence(text) <= PLAIN_LANGUAGE_MAX_WORDS_PER_SENTENCE;
}

// Colorblind-safe trend encoding: never rely on color alone. Every trend uses
// an icon + text label; this maps the three trend states to redundant,
// non-color cues (shape + symbol) usable anywhere in the UI.
export const TREND_GLYPHS: Record<"up" | "down" | "flat", string> = {
  up: "▲",
  down: "▼",
  flat: "■",
};

// Simple deuteranopia/protanopia-safe palette (Okabe-Ito) for status chips,
// used instead of plain red/green so a simulated colorblind pass still
// distinguishes states by hue *and* the glyphs above carry the real meaning.
export const STATUS_COLORS = {
  good: "#0072B2",
  warn: "#E69F00",
  bad: "#D55E00",
  neutral: "#56B4E9",
} as const;
