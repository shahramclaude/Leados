// Part 08 — Financial Intelligence: shared types.
//
// `Explain<T>` is the "number-citation + confidence envelope" every finance
// surface must return instead of a bare number. It is a lightweight stand-in
// for Part 04's evidence envelope (not present in this repo snapshot) — see
// `montecarlo.ts` header for the same note. The shape is intentionally
// narrow (value, optional P10/P50/P90 interval, confidence class, numeric
// fact refs, formula string) so Part 04's real envelope can replace it with
// a type-compatible shim later.

export type ConfidenceClass = "actual" | "evidence" | "forecast" | "asserted";

/** Lower rank = more trustworthy. Used to propagate the "worst" confidence
 * through formula nodes in the DAG (if any input is asserted/forecast, the
 * output must say so too). */
export const CONFIDENCE_RANK: Record<ConfidenceClass, number> = {
  actual: 0,
  evidence: 0,
  forecast: 1,
  asserted: 2,
};

export const CONFIDENCE_LABEL: Record<ConfidenceClass, string> = {
  actual: "Actual (observed)",
  evidence: "Evidence-derived",
  forecast: "Forecast (modeled, EWMA + seasonality)",
  asserted: "Asserted (hand-typed override — unverified)",
};

export interface Interval {
  p10: number;
  p50: number;
  p90: number;
}

export interface Explain<T> {
  value: T;
  interval?: Interval;
  confidence: ConfidenceClass;
  /** Fact-ledger ids this number is built from. Resolvable via FactLedger.get(id). */
  refs: number[];
  formula: string;
  explanation: string;
}

export function worstConfidence(values: ConfidenceClass[]): ConfidenceClass {
  let worst: ConfidenceClass = "actual";
  let worstRank = 0;
  for (const c of values) {
    const r = CONFIDENCE_RANK[c];
    if (r > worstRank) {
      worstRank = r;
      worst = c;
    }
  }
  return worst;
}
