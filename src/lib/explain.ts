/**
 * Part 04 contract, reused and depended upon by Part 05 (causal layer),
 * Part 06 (digital twin / simulator) and Part 10 (strategy views).
 *
 * `Explain<T>` is the shared "show your work" envelope: every user-facing
 * answer that LEADOS produces (a metric read, a causal estimate, a
 * counterfactual, a recommendation) is wrapped in this type so the UI can
 * render *why* an answer is what it is, and link every claim to the
 * evidence it came from.
 */

export type EvidenceKind =
  | "event"
  | "metric-snapshot"
  | "survey"
  | "system-log"
  | "document"
  | "synthetic";

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  summary: string;
  occurredAt: string; // ISO-8601
  sourceUrl?: string;
}

export type Confidence = "low" | "medium" | "high";

export interface Explain<T> {
  result: T;
  reasoning: {
    /** One-sentence plain-language summary of the "why". */
    summary: string;
    /** Ordered reasoning steps, each a short, auditable statement. */
    steps: string[];
  };
  /** Every claim must be traceable to at least one evidence event. */
  evidence: EvidenceRef[];
  confidence: Confidence;
  /** Known limitations, non-identifiability notices, staleness, etc. */
  caveats: string[];
}

export function explain<T>(
  result: T,
  opts: {
    summary: string;
    steps: string[];
    evidence: EvidenceRef[];
    confidence: Confidence;
    caveats?: string[];
  }
): Explain<T> {
  return {
    result,
    reasoning: { summary: opts.summary, steps: opts.steps },
    evidence: opts.evidence,
    confidence: opts.confidence,
    caveats: opts.caveats ?? [],
  };
}
