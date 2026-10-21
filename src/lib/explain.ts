// The Explain<T> contract (Part 05/08 lineage).
//
// Every finding, in every domain (intelligence, people, finance), carries an
// `explanation` payload that satisfies this shape. This is the single
// explanation contract for the whole product — there is exactly one
// `Explain<T>` type, not one per domain, so the UI can render any finding
// with the same component (see src/components/ExplainPanel.tsx).

export type EvidenceRef = {
  label: string;
  // Freeform pointer to the underlying evidence (a document id, a query, a
  // dataset range). LEADOS does not yet have a unified evidence store
  // (tracked in docs/RED-TEAM-2026.md), so this is a human-readable string.
  ref: string;
};

export type Explain<T> = {
  /** The one-line "what" — must match the finding's own summary in spirit. */
  headline: string;
  /** The "why" — a short ordered list of reasons, each traceable to evidence. */
  reasons: string[];
  /** Supporting evidence pointers, rendered as citations in the UI. */
  evidence: EvidenceRef[];
  /** 0..1 confidence that the headline is correct, independent of causal claims. */
  confidence: number;
  /** Domain-specific structured payload (e.g. financial deltas, org-chart ids). */
  detail: T;
};

export function isExplain(value: unknown): value is Explain<unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.headline === "string" &&
    Array.isArray(v.reasons) &&
    Array.isArray(v.evidence) &&
    typeof v.confidence === "number" &&
    "detail" in v
  );
}

export type IntelligenceDetail = {
  signalCount: number;
  timeWindowDays: number;
};

export type PeopleDetail = {
  roleTitle: string;
  teamSize: number;
};

export type FinanceDetail = {
  metric: string;
  deltaPct: number;
};
