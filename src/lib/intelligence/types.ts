/**
 * types.ts — the Explain<T> envelope and the confidence taxonomy.
 *
 * MANDATORY: every estimate, score, or forecast surfaced to a user must be
 * wrapped in Explain<T>. The UI layer (ConfidenceBar / InsightCard) refuses
 * to render a bare number for anything except confidenceClass === "observed".
 */

/**
 * - observed:  a raw count/measurement, no modeling involved (e.g. "there are
 *              14 open findings right now"). May render without an
 *              uncertainty affordance.
 * - estimated: a statistical summary of directly observed data (posterior
 *              mean/interval from a belief fit on real observations).
 * - inferred:  derived from a model that combines multiple estimated signals
 *              (e.g. a forecast built from several belief outputs).
 * - assumed:   no usable evidence; value is a documented default/prior used
 *              only as a stand-in, with "no data yet" messaging required.
 */
export type ConfidenceClass = "observed" | "estimated" | "inferred" | "assumed";

export interface EvidenceRef {
  ref: string;
  weight: number;
  direction: "supports" | "opposes" | "neutral";
}

export interface SensitivityFactor {
  factor: string;
  /** Signed effect on the headline value if this factor moved by one unit/step. */
  delta: number;
}

export interface Explain<T> {
  value: T;
  /** [lo, hi] — required even when degenerate ([value, value]) for "observed". */
  interval: [number, number];
  confidenceClass: ConfidenceClass;
  /** Short machine- and human-readable description of how value was produced. */
  method: string;
  /** Explicit list of assumptions baked into the estimate. */
  assumptions: string[];
  evidence: EvidenceRef[];
  sensitivity: SensitivityFactor[];
  /** Links this estimate to its model card for full documentation. */
  modelCardId?: string;
  /** Set when confidenceClass === "assumed": what would remove the assumption. */
  nextDataNeeded?: string;
  generatedAt: string;
}

export function isRenderableWithoutUncertainty(c: ConfidenceClass): boolean {
  return c === "observed";
}

/** Convenience builder enforcing the envelope shape. */
export function makeExplain<T>(input: Omit<Explain<T>, "generatedAt"> & { generatedAt?: string }): Explain<T> {
  return {
    generatedAt: new Date().toISOString(),
    ...input,
  };
}

/** The canonical "we have no data yet" envelope — never invent a number instead of this. */
export function noDataExplain<T>(placeholder: T, nextDataNeeded: string, method: string): Explain<T> {
  return makeExplain({
    value: placeholder,
    interval: [NaN, NaN],
    confidenceClass: "assumed",
    method,
    assumptions: ["No observations recorded yet; value is an uninformed placeholder, not a forecast."],
    evidence: [],
    sensitivity: [],
    nextDataNeeded,
  });
}
