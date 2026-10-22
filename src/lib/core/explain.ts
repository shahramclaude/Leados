/**
 * Explain<T> — carries not just a value, but why we believe it, how
 * confident we are, and when it was authored. Used throughout the
 * scenario/foresight stack so no assumption is a bare, unaccountable number.
 *
 * Confidence classes are deliberately coarse. LEADOS does not pretend to
 * know the difference between 61% and 64% confident about a macro
 * assumption — that would be false precision.
 */
export type ConfidenceClass = "high" | "moderate" | "low" | "speculative";

export interface Explain<T> {
  value: T;
  rationale: string;
  confidence: ConfidenceClass;
  /** Ids of horizon signals, hypotheses, or pre-mortem findings this leans on. */
  sourceRefs?: string[];
  /** ISO timestamp of when this explanation was authored. Never backdated. */
  authoredAt: string;
  /** Who/what authored it: a person, or an AI role constrained to a knowledge scope. */
  authoredBy: string;
}

export function explain<T>(
  value: T,
  rationale: string,
  confidence: ConfidenceClass,
  authoredBy: string,
  sourceRefs?: string[],
  authoredAt: string = new Date().toISOString()
): Explain<T> {
  return { value, rationale, confidence, sourceRefs, authoredAt, authoredBy };
}

export const CONFIDENCE_WEIGHT: Record<ConfidenceClass, number> = {
  high: 0.9,
  moderate: 0.65,
  low: 0.4,
  speculative: 0.2,
};

/** Standing disclaimer text reused on every scenario/foresight surface. */
export const POSSIBILITY_DISCLAIMER =
  "This is a modeled possibility, not a prediction. Scenarios describe plausible futures " +
  "worth preparing for; they are not forecasts of what will happen.";
