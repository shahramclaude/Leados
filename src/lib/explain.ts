// Shared `Explain<T>` rationale wrapper used across LEADOS wherever a
// recommendation, nudge, or system judgement is surfaced to a human. Nothing
// in LEADOS should hand back a bare recommendation without a citable reason.
export type Explain<T> = {
  result: T;
  rationale: string;
  /** Ids of the concrete evidence rows that justify this result. Must be
   * non-empty for anything that claims to address a development gap. */
  citedEvidenceIds: string[];
  /** Free-form structured facts backing the rationale, e.g. the gap that was
   * detected, for audit/debugging and for the property tests in Phase 3. */
  basis: Record<string, unknown>;
};

export function explain<T>(
  result: T,
  rationale: string,
  citedEvidenceIds: string[],
  basis: Record<string, unknown> = {},
): Explain<T> {
  return { result, rationale, citedEvidenceIds, basis };
}
