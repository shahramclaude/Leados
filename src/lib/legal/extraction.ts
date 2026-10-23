// Grounded clause extraction engine (Part 53, reusing Part 11's grounded-extraction contract:
// every extraction must cite an exact span of the source document — never a paraphrase).
//
// IMPLEMENTATION NOTE (read this before assuming it's an LLM call): this is a deterministic,
// lexicon/pattern-based extractor, not a hosted-model call. We chose determinism deliberately so
// that span-citations are byte-exact and reproducible, and so `eval:legal` produces a stable,
// auditable precision/recall scorecard rather than a number that drifts between runs. The seam to
// swap in an LLM-backed extractor (still required to emit span offsets, never prose paraphrase) is
// `ClauseMatcher` below — a model-backed matcher can implement the same interface.
//
// HONESTY: this baseline is intentionally narrow. It recognizes clauses that use conventional legal
// drafting phrasing for each of the 8 supported types. Unusual phrasing, heavily negotiated custom
// language, or non-English contracts will under-extract (see Part 53 Phase 5 attack notes in
// AI-SESSION-LOG.md). Every extraction is a draft that a human must confirm before it feeds the
// obligation board — this is the control that keeps the extractor's limits from becoming silent risk.

import { CLAUSE_TYPES, type ClauseType } from "./clauseTypes";

export interface ExtractedClauseCandidate {
  clauseType: ClauseType;
  spanStart: number;
  spanEnd: number;
  excerptText: string;
  confidence: number;
  extractionMethod: string;
}

interface ClauseMatcher {
  clauseType: ClauseType;
  /** Must match on the normalized (lowercased) paragraph text. */
  test: (normalizedParagraph: string) => boolean;
  /** Confidence to report when `test` matches — reflects pattern specificity, not calibration. */
  confidence: number;
}

export const EXTRACTION_METHOD_ID = "lexicon-grounded-v1";

// Each matcher requires a *strong*, multi-token phrase rather than a single keyword, specifically
// so that passing mentions of a legal term of art (e.g. "indemnity" in a heading) do not trigger a
// false positive. This is what keeps precision high; it is also exactly why recall is imperfect on
// paraphrased clauses (see corpus.ts "paraphrase" variants used for the recall-degradation fixture).
const MATCHERS: ClauseMatcher[] = [
  {
    clauseType: "term",
    test: (p) => p.includes("initial term of this agreement") && p.includes("commence"),
    confidence: 0.93,
  },
  {
    clauseType: "renewal",
    test: (p) => p.includes("automatically renew for successive"),
    confidence: 0.92,
  },
  {
    clauseType: "termination",
    test: (p) => p.includes("terminate this agreement for convenience"),
    confidence: 0.9,
  },
  {
    clauseType: "sla",
    test: (p) => /service level of [\d.]+%\s*monthly uptime/.test(p),
    confidence: 0.91,
  },
  {
    clauseType: "indemnity",
    test: (p) => p.includes("indemnify, defend, and hold harmless"),
    confidence: 0.95,
  },
  {
    clauseType: "liability_cap",
    test: (p) => p.includes("total liability under this agreement") && p.includes("exceed"),
    confidence: 0.92,
  },
  {
    clauseType: "change_of_control",
    test: (p) => p.includes("change of control") && p.includes("terminate"),
    confidence: 0.85,
  },
  {
    clauseType: "data_protection",
    test: (p) => p.includes("technical and organizational measures") && p.includes("personal data"),
    confidence: 0.9,
  },
];

export const PARAGRAPH_SEPARATOR = "\n\n";

/** Splits raw text into paragraphs while preserving exact character offsets into the original string. */
export function segmentParagraphs(rawText: string): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  const parts = rawText.split(PARAGRAPH_SEPARATOR);
  for (const part of parts) {
    const start = cursor;
    const end = cursor + part.length;
    const trimmedStart = start + (part.length - part.trimStart().length);
    const trimmedEnd = end - (part.length - part.trimEnd().length);
    if (trimmedEnd > trimmedStart) {
      segments.push({ start: trimmedStart, end: trimmedEnd, text: rawText.slice(trimmedStart, trimmedEnd) });
    }
    cursor = end + PARAGRAPH_SEPARATOR.length;
  }
  return segments;
}

/**
 * Extracts clause candidates from raw document text. Every candidate's `excerptText` is produced by
 * slicing `rawText` at `[spanStart, spanEnd)` — never generated independently — which is what makes
 * span-citation integrity mechanically guaranteed rather than merely asserted. See
 * tests/extraction.spanIntegrity.test.ts.
 */
export function extractClauses(rawText: string): ExtractedClauseCandidate[] {
  const candidates: ExtractedClauseCandidate[] = [];
  for (const segment of segmentParagraphs(rawText)) {
    const normalized = segment.text.toLowerCase();
    for (const matcher of MATCHERS) {
      if (matcher.test(normalized)) {
        candidates.push({
          clauseType: matcher.clauseType,
          spanStart: segment.start,
          spanEnd: segment.end,
          excerptText: rawText.slice(segment.start, segment.end),
          confidence: matcher.confidence,
          extractionMethod: EXTRACTION_METHOD_ID,
        });
        // One clause type per paragraph in this baseline — matches corpus construction and avoids
        // double counting when a near-miss distractor happens to also satisfy a second matcher.
        break;
      }
    }
  }
  return candidates;
}

export function assertKnownClauseType(value: string): asserts value is ClauseType {
  if (!(CLAUSE_TYPES as readonly string[]).includes(value)) {
    throw new Error(`Unknown clause type: ${value}`);
  }
}
