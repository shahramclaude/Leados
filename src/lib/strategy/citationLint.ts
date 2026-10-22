// Number-citation lint — interim stand-in for Part 08's shared lint engine.
//
// Rule: every numeric token that looks like a metric/claim (percentages,
// decimals, day counts, dollar amounts, or "Nx" multipliers) appearing in a
// generated narrative must be traceable to at least one citation in the
// accompanying citation list for that paragraph/claim. This is intentionally
// conservative (over-flagging is safer than silently fabricating numbers).
//
// INTERIM NOTICE: Part 08 is expected to provide a shared, project-wide
// citation lint with richer NLU (e.g. understanding "roughly 3 days" vs
// "3.0 days"). Until that lands, this module only guarantees the minimum bar
// required by Phase 4 Gate 4: a generated strategy brief must not contain a
// number that has zero corresponding citation anywhere in the brief.

export interface Citation {
  id: string;
  label: string; // human-readable description of what the number refers to
  sourceType: "evidence_ref" | "initiative" | "milestone" | "wsjf_rank" | "finding" | "metric";
  sourceId: string;
  value: number;
}

export interface CitationLintResult {
  ok: boolean;
  numbersFound: string[];
  uncitedNumbers: string[];
}

// Negative lookbehind excludes digits glued to a preceding letter, e.g. "P50"
// (a percentile label, not a standalone claim) or "Q1" (a quarter label).
const NUMBER_PATTERN = /(?<![A-Za-z])-?\d+(?:\.\d+)?%?/g;
// Calendar dates (YYYY-MM-DD, optionally with a time component) are
// structural/presentational, not numeric claims about the business — they
// are stripped before scanning so "2026-01-08" doesn't need its own
// citation the way "42%" or "5 days" would.
const DATE_TOKEN_PATTERN = /\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g;

function normalizeNumber(token: string): number {
  return parseFloat(token.replace("%", ""));
}

/**
 * Lints a narrative string against a list of citations. A number in the text
 * is considered "cited" if some citation's value, when rounded to the same
 * number of decimal places as the text token, matches it. Day counts,
 * percentages, ranks, and dollar figures are all treated as plain numbers
 * for comparison purposes (sign and scale must match).
 */
/** Extracts the numeric tokens (excluding calendar dates) from a string, for use when auto-citing a source record's own text. */
export function extractNumberTokens(text: string): number[] {
  const withoutDates = text.replace(DATE_TOKEN_PATTERN, "");
  const matches = withoutDates.match(NUMBER_PATTERN) ?? [];
  return matches.map(normalizeNumber).filter((n) => !Number.isNaN(n) && Math.abs(n) > 0);
}

export function lintCitations(text: string, citations: Citation[]): CitationLintResult {
  const textWithoutDates = text.replace(DATE_TOKEN_PATTERN, "");
  const matches = textWithoutDates.match(NUMBER_PATTERN) ?? [];
  const citationValues = citations.map((c) => c.value);

  const uncited: string[] = [];
  for (const raw of matches) {
    const n = normalizeNumber(raw);
    if (Number.isNaN(n)) continue;
    // Ignore tiny ordinal-like numbers that are structurally part of prose
    // (e.g. "week 1"), which are not claims requiring evidence.
    if (Math.abs(n) <= 0) continue;
    const isCited = citationValues.some((cv) => Math.abs(cv - n) < 0.051);
    if (!isCited) uncited.push(raw);
  }

  return {
    ok: uncited.length === 0,
    numbersFound: matches,
    uncitedNumbers: uncited,
  };
}
