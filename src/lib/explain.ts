// Part 04 stand-in: the shared `Explain<T>` contract. Every score, risk
// estimate or recommendation surfaced anywhere in people intelligence MUST be
// wrapped in this type. `scripts/test-contracts.ts` asserts this at runtime
// for every engine output.

/** Causal status of a claim. See docs/FAIRNESS.md and Part 05's rules. */
export type CausalStatus = "association" | "causal_candidate" | "causal_identified";

export interface Driver {
  /** Human-readable feature name, e.g. "No growth conversation in 90 days". */
  name: string;
  /** Signed contribution to the score, same units as the score itself. */
  contribution: number;
  direction: "increases" | "decreases";
  /** Where this came from — event ids, field names, or derivations. */
  evidence: string;
  /** Never claim more than the method supports. Default must be "association". */
  causalStatus: CausalStatus;
}

export interface Counterfactual {
  /** Plain-language description of the hypothetical change. */
  change: string;
  /** Estimated delta in the score if the change were true, signed. */
  estimatedDelta: number;
  /** Always "association" unless a causal design (e.g. RCT) backs it. */
  causalStatus: CausalStatus;
  note: string;
}

export interface ConfidenceInterval {
  low: number;
  high: number;
  /** e.g. 0.8 for an 80% credible interval. */
  level: number;
}

export interface Explain<T> {
  value: T;
  /** Estimation/modeling method in plain language, for auditability. */
  method: string;
  /** Names of inputs/features actually used (never protected attributes). */
  inputs: string[];
  confidence?: ConfidenceInterval;
  drivers?: Driver[];
  counterfactuals?: Counterfactual[];
  /** Plain-language statement of what this estimate cannot tell you. */
  uncertaintyNote: string;
  /** Why LEADOS is allowed to compute this at all (job-relevant purpose). */
  lawfulPurpose: string;
  /** ISO timestamp this estimate reflects (belief-state date). */
  asOf: string;
  /** Explicit human-readable caveats, e.g. "decision support, not decision". */
  limitations?: string[];
}

/** Runtime structural check used by contract tests. Throws with a clear reason. */
export function assertIsExplain(x: unknown, label: string): asserts x is Explain<unknown> {
  if (typeof x !== "object" || x === null) {
    throw new Error(`${label}: Explain<T> must be an object`);
  }
  const o = x as Record<string, unknown>;
  const required: Array<[string, string]> = [
    ["value", "undefined"],
    ["method", "string"],
    ["inputs", "object"],
    ["uncertaintyNote", "string"],
    ["lawfulPurpose", "string"],
    ["asOf", "string"],
  ];
  for (const [key, notType] of required) {
    if (key === "value") {
      if (!("value" in o)) throw new Error(`${label}: Explain<T>.value is missing`);
      continue;
    }
    if (typeof o[key] !== (notType === "object" ? "object" : notType)) {
      throw new Error(`${label}: Explain<T>.${key} has wrong type`);
    }
  }
  if (!Array.isArray(o.inputs)) throw new Error(`${label}: Explain<T>.inputs must be an array`);
  if (o.drivers !== undefined) {
    if (!Array.isArray(o.drivers)) throw new Error(`${label}: Explain<T>.drivers must be an array`);
    for (const d of o.drivers as Driver[]) {
      if (!["association", "causal_candidate", "causal_identified"].includes(d.causalStatus)) {
        throw new Error(`${label}: driver "${d.name}" has invalid causalStatus`);
      }
    }
  }
  if (o.confidence !== undefined) {
    const c = o.confidence as ConfidenceInterval;
    if (!(c.low <= c.high)) throw new Error(`${label}: confidence interval low must be <= high`);
  }
}
