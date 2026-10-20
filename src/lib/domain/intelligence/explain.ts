/**
 * explain.ts — Part 04-B, the explainability contract. `explainFinding()`
 * is the single API every engine uses to wrap a value before it is allowed
 * to reach a view. Components must only ever accept `Explain<T>` props for
 * anything score-like — enforced by `explainContract.test.ts` walking the
 * adapter registry in `src/components/intelligence/adapters.ts`.
 */

import type { Driver, EvidenceRef, Explain } from "./types";
import { isExplain } from "./types";

export type ExplainInput<T> = {
  value: T;
  interval?: { lo: number; hi: number };
  drivers: Driver[];
  evidence: EvidenceRef[];
  method: string;
  asOf: string;
  counterfactual?: { change: string; newValue: T }[];
};

/**
 * Construct an `Explain<T>` and validate it at runtime (fail fast rather
 * than let a malformed explanation silently reach a component). This is the
 * ONLY constructor used across the codebase — belief fabric, rule engine,
 * signal fusion, and forecasting all funnel their outputs through this
 * function before returning them to a use case or component.
 */
export function explainFinding<T>(input: ExplainInput<T>): Explain<T> {
  if (!input.method || input.method.trim().length === 0) {
    throw new Error("explainFinding: method is required (no decorative/unnamed math)");
  }
  if (!Array.isArray(input.drivers)) {
    throw new Error("explainFinding: drivers must be an array (can be empty, never absent)");
  }
  for (const d of input.drivers) {
    if (!d.factor || d.direction !== "up" && d.direction !== "down") {
      throw new Error(`explainFinding: malformed driver ${JSON.stringify(d)}`);
    }
  }
  const result: Explain<T> = {
    value: input.value,
    interval: input.interval,
    drivers: input.drivers,
    evidence: input.evidence,
    method: input.method,
    asOf: input.asOf,
    counterfactual: input.counterfactual,
  };
  if (!isExplain(result)) {
    throw new Error("explainFinding: constructed object failed isExplain() guard");
  }
  return result;
}

/** Convenience: wrap a bare number with the minimum legal explanation when
 * an engine genuinely has no drivers yet (e.g. a freshly created prior with
 * no evidence). Still goes through full validation. */
export function explainBareValue<T>(value: T, method: string, asOf: string): Explain<T> {
  return explainFinding({ value, drivers: [], evidence: [], method, asOf });
}
