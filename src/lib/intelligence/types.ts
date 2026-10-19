// src/lib/intelligence/types.ts
//
// Shared contracts for the Intelligence Core. The central rule enforced by
// these types (and by tests in src/lib/intelligence/__tests__/explain.test.ts)
// is: **no UI-visible score may be a bare number**. Every value must arrive
// wrapped in an `Explanation`.

export type EngineMethod =
  | "bayesian-belief"
  | "bayesian-network"
  | "rule-engine"
  | "causal-inference"
  | "monte-carlo-forecast"
  | "signal-fusion"
  | "scenario-simulation"
  | "predictive-scoring";

/** A credible interval (Bayesian) or confidence interval (frequentist),
 * explicitly tagged so the UI never conflates the two. */
export interface Interval {
  low: number;
  high: number;
  /** probability mass covered, e.g. 0.9 for a 90% interval */
  level: number;
  kind: "credible" | "confidence" | "predictive";
}

/** One signal/feature/rule that moved the value, with a signed contribution
 * so direction (helped vs. hurt) is explicit, not just magnitude. */
export interface Driver {
  name: string;
  /** signed contribution in the same units as `value` where possible */
  contribution: number;
  description?: string;
}

export interface EvidenceRef {
  type: "event" | "metric" | "rule" | "observation" | "belief";
  id: string;
  label: string;
  timestamp: string;
  /** relative weight this item carried in the computation, if applicable */
  weight?: number;
}

/** The explainability contract. Every number rendered in the UI must be an
 * `Explanation`, produced by `explainFinding()` in explain.ts. */
export interface Explanation {
  id: string;
  label: string;
  value: number;
  interval: Interval;
  drivers: Driver[];
  evidence: EvidenceRef[];
  method: EngineMethod;
  /** ISO-8601 timestamp of the data this explanation reflects */
  asOf: string;
  /** overall confidence in [0,1], independent of the interval width */
  confidence: number;
  caveats: string[];
}

export function isValidExplanation(x: unknown): x is Explanation {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.label === "string" &&
    typeof e.value === "number" &&
    Number.isFinite(e.value) &&
    !!e.interval &&
    typeof (e.interval as Interval).low === "number" &&
    typeof (e.interval as Interval).high === "number" &&
    typeof (e.interval as Interval).level === "number" &&
    ["credible", "confidence", "predictive"].includes((e.interval as Interval).kind) &&
    Array.isArray(e.drivers) &&
    Array.isArray(e.evidence) &&
    typeof e.method === "string" &&
    typeof e.asOf === "string" &&
    !Number.isNaN(Date.parse(e.asOf)) &&
    typeof e.confidence === "number" &&
    e.confidence >= 0 &&
    e.confidence <= 1 &&
    Array.isArray(e.caveats)
  );
}

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface Finding {
  id: string;
  rootCauseId: string;
  domain: string;
  title: string;
  severity: Severity;
  /** severity actually shown to the user after hysteresis is applied */
  displayedSeverity: Severity;
  status: "active" | "resolved" | "suppressed";
  explanation: Explanation;
  recommendedActions: string[];
  suppressedSignalIds: string[];
  interruptEligible: boolean;
}
