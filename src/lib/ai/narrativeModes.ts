// =============================================================================
// LEADOS — Part 11: narrative modes (executive vs analyst)
// =============================================================================
// Two controlled registers:
//   - "executive": plain language, no jargon/abbreviations, short sentences.
//   - "analyst": technical vocabulary allowed, more detail per sentence, but
//     still capped so output stays scannable.
// Both caps are MEASURABLE (see measureNarrativeCompliance) and are checked
// by `npm run eval:llm` across the eval set, not just spot-checked.
// =============================================================================

import type { NarrativeMode } from "./types";

export const SENTENCE_WORD_CAP: Record<NarrativeMode, number> = {
  executive: 20,
  analyst: 35,
};

// Jargon -> plain-language controlled vocabulary for executive mode. Analyst
// mode is allowed to use the jargon term directly.
export const CONTROLLED_VOCABULARY: Record<string, string> = {
  arr: "annual recurring revenue",
  mrr: "monthly recurring revenue",
  nps: "customer satisfaction score",
  churn_rate: "customer loss rate",
  yoy: "year over year",
  cac: "cost to acquire a customer",
  ltv: "customer lifetime value",
  headcount: "employee count",
  opex: "operating expenses",
};

export function plainLanguageLabel(metricName: string, mode: NarrativeMode): string {
  const key = metricName.toLowerCase().replace(/\s+/g, "_");
  if (mode === "executive" && CONTROLLED_VOCABULARY[key]) return CONTROLLED_VOCABULARY[key];
  return metricName.replace(/_/g, " ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

export interface NarrativeComplianceReport {
  mode: NarrativeMode;
  sentenceCount: number;
  averageWords: number;
  maxWords: number;
  overCapCount: number;
  vocabViolations: string[];
  compliant: boolean;
}

/** Measures (never mutates) a generated text's adherence to the mode's contract. */
export function measureNarrativeCompliance(text: string, mode: NarrativeMode): NarrativeComplianceReport {
  const sentences = splitSentences(text);
  const cap = SENTENCE_WORD_CAP[mode];
  const counts = sentences.map(wordCount);
  const overCapCount = counts.filter((c) => c > cap).length;
  const averageWords = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const maxWords = counts.length ? Math.max(...counts) : 0;

  const vocabViolations: string[] = [];
  if (mode === "executive") {
    for (const jargon of Object.keys(CONTROLLED_VOCABULARY)) {
      const re = new RegExp(`\\b${jargon.toUpperCase()}\\b`);
      if (re.test(text.toUpperCase()) && !text.toLowerCase().includes(CONTROLLED_VOCABULARY[jargon])) {
        vocabViolations.push(jargon);
      }
    }
  }

  return {
    mode,
    sentenceCount: sentences.length,
    averageWords: Number(averageWords.toFixed(1)),
    maxWords,
    overCapCount,
    vocabViolations,
    compliant: overCapCount === 0 && vocabViolations.length === 0,
  };
}
