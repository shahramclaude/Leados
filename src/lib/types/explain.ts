// Part 04 seam: Explain<T>. Not present in the repo snapshot handed to this
// part, so we define the contract here in the shape Part 04 is specified to
// own. Any future Part 04 delivery should treat this as the canonical
// contract to reconcile against (same shape, same field names) rather than
// introduce a second, incompatible Explain<T>.
//
// Every structured answer the language-intelligence layer produces for a
// human is wrapped in Explain<T>: the typed value, a confidence score, the
// evidence that backs it, and (optionally) the reasoning/caveats a reviewer
// needs to trust or challenge it.

export type EvidenceRef = {
  /** What kind of record this evidence points at. */
  kind: "entity" | "event" | "metric" | "doc" | "memory_note" | "capture_proposal" | "finding";
  /** Primary key of the record in LEADOS. */
  id: string;
  /** ISO timestamp the evidence pertains to, if applicable. */
  timestamp?: string;
  /** Human-readable label for rendering ("Acme Co. — status change, Mar 3"). */
  label?: string;
  /** Short verbatim excerpt used to support the claim (for faithfulness checks). */
  excerpt?: string;
};

export type Claim = {
  claim: string;
  evidenceRefs: EvidenceRef[];
};

export type Explain<T> = {
  value: T;
  /** 0..1 confidence that `value` is correct given the retrieved evidence. */
  confidence: number;
  evidenceRefs: EvidenceRef[];
  /** Optional per-sentence claims backing a prose explanation. */
  claims?: Claim[];
  reasoning?: string;
  caveats?: string[];
  /** Set when the faithfulness checker dropped unsupported content. */
  droppedClaims?: { claim: string; reason: string }[];
};

export function explainOf<T>(
  value: T,
  evidenceRefs: EvidenceRef[],
  opts: Partial<Omit<Explain<T>, "value" | "evidenceRefs">> = {},
): Explain<T> {
  return {
    value,
    confidence: opts.confidence ?? (evidenceRefs.length > 0 ? 0.75 : 0.2),
    evidenceRefs,
    claims: opts.claims,
    reasoning: opts.reasoning,
    caveats: opts.caveats,
    droppedClaims: opts.droppedClaims,
  };
}
