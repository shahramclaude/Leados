// src/lib/intelligence/fairness/gates.ts
//
// Declared, fixed thresholds (not tuned post-hoc per report) and the gate
// evaluation logic. A gate that can't be evaluated (insufficient sample) is
// reported as `not-evaluated`, never silently passed and never silently
// dropped from the report.

export const FAIRNESS_THRESHOLDS = {
  demographicParityDifference: 0.1,
  equalizedOddsDifference: 0.1,
  calibrationEce: 0.1,
  minGroupSize: 30,
  kAnonymity: 5,
} as const;

export type GateVerdict = "pass" | "fail" | "not-evaluated";

export interface GateResult {
  gate: string;
  verdict: GateVerdict;
  threshold: number;
  observed: number | null;
  detail: string;
}

export function evaluateDifferenceGate(gate: string, value: number | null, threshold: number, evaluable: boolean, note: string): GateResult {
  if (!evaluable || value === null) {
    return { gate, verdict: "not-evaluated", threshold, observed: value, detail: note };
  }
  return {
    gate,
    verdict: value <= threshold ? "pass" : "fail",
    threshold,
    observed: value,
    detail: `${value} ${value <= threshold ? "<=" : ">"} threshold ${threshold}`,
  };
}
