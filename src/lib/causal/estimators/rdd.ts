/**
 * src/lib/causal/estimators/rdd.ts
 * Sharp regression discontinuity design: local-linear regression on each
 * side of a running-variable cutoff, with a bandwidth-sensitivity check
 * (re-estimate at 0.5x and 2x bandwidth; flag if the sign/magnitude is
 * unstable).
 */
import { olsFit, olsStandardErrors } from "../../mathUtils";

export interface RDDInput {
  runningVariable: number[];
  outcome: number[];
  cutoff: number;
}

export interface RDDResult {
  jump: number;
  se: number;
  ci90: [number, number];
  bandwidth: number;
  nLeft: number;
  nRight: number;
  bandwidthSensitivity: { bandwidthMultiple: number; jump: number }[];
  stable: boolean;
}

function fitLocalLinear(runningVariable: number[], outcome: number[], cutoff: number, bandwidth: number) {
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  runningVariable.forEach((x, i) => {
    const centered = x - cutoff;
    if (Math.abs(centered) > bandwidth) return;
    if (centered < 0) left.push({ x: centered, y: outcome[i] });
    else right.push({ x: centered, y: outcome[i] });
  });
  if (left.length < 3 || right.length < 3) {
    return { jump: NaN, se: NaN, nLeft: left.length, nRight: right.length };
  }
  const XLeft = left.map((p) => [1, p.x]);
  const yLeft = left.map((p) => p.y);
  const XRight = right.map((p) => [1, p.x]);
  const yRight = right.map((p) => p.y);
  const fitLeft = olsFit(XLeft, yLeft);
  const fitRight = olsFit(XRight, yRight);
  const seLeft = olsStandardErrors(XLeft, fitLeft.residuals)[0];
  const seRight = olsStandardErrors(XRight, fitRight.residuals)[0];
  const jump = fitRight.coef[0] - fitLeft.coef[0];
  const se = Math.sqrt(seLeft ** 2 + seRight ** 2);
  return { jump, se, nLeft: left.length, nRight: right.length };
}

export function runRDD(input: RDDInput, bandwidth?: number): RDDResult {
  const range = Math.max(...input.runningVariable) - Math.min(...input.runningVariable);
  const bw = bandwidth ?? range * 0.5;
  const base = fitLocalLinear(input.runningVariable, input.outcome, input.cutoff, bw);
  const sensitivity = [0.5, 1, 1.5, 2].map((m) => ({
    bandwidthMultiple: m,
    jump: fitLocalLinear(input.runningVariable, input.outcome, input.cutoff, bw * m).jump,
  }));
  const signs = sensitivity.map((s) => Math.sign(s.jump)).filter((s) => !Number.isNaN(s));
  const stable = signs.every((s) => s === signs[0]) && signs.length === sensitivity.length;

  return {
    jump: base.jump,
    se: base.se,
    ci90: [base.jump - 1.645 * base.se, base.jump + 1.645 * base.se],
    bandwidth: bw,
    nLeft: base.nLeft,
    nRight: base.nRight,
    bandwidthSensitivity: sensitivity,
    stable,
  };
}
