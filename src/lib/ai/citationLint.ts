// =============================================================================
// LEADOS — Part 11: the citation lint ("cite-or-refuse" enforcement)
// =============================================================================
// This is the Part 08 citation contract, reused verbatim by every generation
// surface and by `npm run eval:llm`. The rule is absolute:
//
//   Every numeric token appearing in generated prose MUST fall inside the
//   span of a citation, and that citation MUST resolve to a real evidence
//   item in the GroundingSet whose own numbers are consistent with the claim.
//
// A fluent, confident, UNCITED numeric claim is treated as a defect, not a
// stylistic nit — `lint.ok === false` forces the pipeline to abstain or retry.
// =============================================================================

import { findEvidenceByRef, type Citation, type CitationLintResult, type CitationLintViolation, type GroundingSet } from "./types";

// Matches currency, percentages, multipliers and bare numbers (including
// thousands separators and decimals). Deliberately broad — strictness here is
// the point: cite-or-refuse means we'd rather over-flag than let an uncited
// number slip through as fluent prose.
const NUMERIC_TOKEN = /[+-]?\$?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x|k|m|b|bps)?\b/gi;

export function findNumericTokens(text: string): Array<{ match: string; start: number; end: number }> {
  const out: Array<{ match: string; start: number; end: number }> = [];
  for (const m of text.matchAll(NUMERIC_TOKEN)) {
    const raw = m[0];
    // Skip pure-word matches with no digit (shouldn't happen given regex, but
    // guards against degenerate matches like a lone "x").
    if (!/\d/.test(raw)) continue;
    const start = m.index ?? 0;
    out.push({ match: raw, start, end: start + raw.length });
  }
  return out;
}

/** Parse a numeric token like "$4.2M", "12%", "1,234", "3.5x" into a float value (best-effort). */
export function parseNumericToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  const mult = t.endsWith("k") ? 1_000 : t.endsWith("m") ? 1_000_000 : t.endsWith("b") ? 1_000_000_000 : 1;
  const cleaned = t.replace(/[$,%xkmb]/g, "").replace(/percent|bps/g, "").trim();
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  return n * mult;
}

function numbersFromEvidence(ref: ReturnType<typeof findEvidenceByRef>): number[] {
  if (!ref) return [];
  if (ref.kind === "metric") {
    const nums: number[] = [ref.value];
    if (ref.previousValue !== null) nums.push(ref.previousValue);
    if (ref.deltaAbs !== null) nums.push(ref.deltaAbs);
    if (ref.deltaPct !== null) nums.push(ref.deltaPct);
    return nums;
  }
  if (ref.kind === "document") {
    return findNumericTokens(ref.text)
      .map((t) => parseNumericToken(t.match))
      .filter((n): n is number => n !== null);
  }
  return [];
}

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const tolerance = Math.max(Math.abs(a), Math.abs(b)) * 0.015 + 0.015;
  return Math.abs(a - b) <= tolerance;
}

export function lintCitations(text: string, citations: Citation[], groundingSet: GroundingSet): CitationLintResult {
  const violations: CitationLintViolation[] = [];

  if (!text || text.trim().length === 0) {
    violations.push({ type: "empty_text", detail: "Generated text is empty; pipeline should abstain instead of returning empty prose." });
    return { ok: false, violations, numericTokensChecked: 0, citationsChecked: citations.length };
  }

  // 1. Every citation must resolve to real evidence, and its span must be in bounds.
  for (const c of citations) {
    const [s, e] = c.span;
    if (s < 0 || e > text.length || s >= e) {
      violations.push({ type: "dangling_ref", detail: `Citation span [${s},${e}] is out of bounds for text of length ${text.length}.`, span: c.span });
      continue;
    }
    const ref = findEvidenceByRef(groundingSet, c.ref);
    if (!ref) {
      violations.push({ type: "dangling_ref", detail: `Citation ref "${c.ref}" does not exist in the grounding set.`, span: c.span });
      continue;
    }
    // Number-mismatch check: if the claim text (span) contains numbers, at
    // least one of them must be consistent with the evidence's own numbers.
    const claimText = text.slice(s, e);
    const claimNumbers = findNumericTokens(claimText)
      .map((t) => parseNumericToken(t.match))
      .filter((n): n is number => n !== null);
    if (claimNumbers.length > 0) {
      const evidenceNumbers = numbersFromEvidence(ref);
      const hasMatch = evidenceNumbers.length === 0 ? true : claimNumbers.some((cn) => evidenceNumbers.some((en) => approxEqual(cn, en)));
      if (!hasMatch) {
        violations.push({
          type: "number_mismatch",
          detail: `Claim "${claimText.trim()}" cites ${c.ref} but its numbers do not match the evidence (evidence numbers: ${evidenceNumbers.join(", ")}).`,
          span: c.span,
        });
      }
    }
  }

  // 2. Every numeric token in the text must fall within at least one citation span.
  const numericTokens = findNumericTokens(text);
  for (const tok of numericTokens) {
    const covered = citations.some((c) => c.span[0] <= tok.start && tok.end <= c.span[1]);
    if (!covered) {
      violations.push({
        type: "uncited_number",
        detail: `Numeric token "${tok.match}" at [${tok.start},${tok.end}] is not covered by any citation.`,
        span: [tok.start, tok.end],
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    numericTokensChecked: numericTokens.length,
    citationsChecked: citations.length,
  };
}
