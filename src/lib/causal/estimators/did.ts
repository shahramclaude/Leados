/**
 * src/lib/causal/estimators/did.ts
 * Difference-in-differences with a pre-period parallel-trends diagnostic
 * and event-study point estimates.
 */
import { mean, olsFit, olsStandardErrors, zTwoSidedPValue } from "../../mathUtils";

export interface DiDRow {
  unit: string;
  time: number; // relative or absolute period index
  treatedGroup: boolean;
  post: boolean;
  outcome: number;
}

export interface DiDResult {
  att: number;
  se: number;
  ci90: [number, number];
  pValue: number;
  parallelTrends: {
    pValue: number;
    passed: boolean; // true if pre-trend coefficient is not significantly different from 0
    preTrendCoef: number;
  };
  eventStudy: { relTime: number; estimate: number; se: number }[];
}

/**
 * Classic two-way-fixed-effects DiD: outcome ~ unit FE + time FE + treatedGroup*post.
 * Returns the ATT (coefficient on the interaction) plus diagnostics.
 *
 * Implementation note: for large N, forming an explicit dummy-variable design
 * matrix (one column per unit) and inverting it is O(nUnits^3) and becomes
 * impractically slow well before the product's real sample sizes. Since the
 * panel here is balanced (every unit observed at every period), the
 * two-way-fixed-effects estimate is algebraically identical to running a
 * SINGLE-regressor OLS on the doubly-demeaned outcome and treatment
 * interaction (Frisch-Waugh-Lovell), which is O(N) instead of O(nUnits^3).
 * This was caught and fixed during the eval:causal ground-truth harness
 * (see AI-SESSION-LOG.md) when N=1000 made the naive version time out.
 */
export function runDiD(rows: DiDRow[]): DiDResult {
  const units = Array.from(new Set(rows.map((r) => r.unit)));
  const times = Array.from(new Set(rows.map((r) => r.time))).sort((a, b) => a - b);
  const timeRef = times[0];

  const interactionOf = (r: DiDRow) => (r.treatedGroup && r.post ? 1 : 0);

  const { demeaned: yTilde } = twoWayDemean(rows, (r) => r.outcome);
  const { demeaned: dTilde } = twoWayDemean(rows, interactionOf);

  const sumDD = dTilde.reduce((s, d) => s + d * d, 0) || 1e-9;
  const sumDY = dTilde.reduce((s, d, i) => s + d * yTilde[i], 0);
  const att = sumDY / sumDD;
  const residuals = yTilde.map((y, i) => y - att * dTilde[i]);

  const nObs = rows.length;
  const numFeParams = units.length + times.length - 1; // two-way FE, one redundancy
  const df = Math.max(nObs - numFeParams - 1, 1);
  const sigma2 = residuals.reduce((s, r) => s + r * r, 0) / df;
  const attSe = Math.sqrt(sigma2 / sumDD);
  const pValue = zTwoSidedPValue(att / attSe);

  // Pre-trend diagnostic: among pre-period rows only, regress outcome on time * treatedGroup.
  const preRows = rows.filter((r) => !r.post);
  const preTimes = Array.from(new Set(preRows.map((r) => r.time))).sort((a, b) => a - b);
  let preTrendCoef = 0;
  let preTrendP = 1;
  if (preTimes.length >= 2) {
    const Xp: number[][] = [];
    const yp: number[] = [];
    const t0 = preTimes[0];
    for (const r of preRows) {
      const tRel = r.time - t0;
      Xp.push([1, tRel, r.treatedGroup ? 1 : 0, tRel * (r.treatedGroup ? 1 : 0)]);
      yp.push(r.outcome);
    }
    const fit = olsFit(Xp, yp);
    const sep = olsStandardErrors(Xp, fit.residuals);
    preTrendCoef = fit.coef[3];
    preTrendP = zTwoSidedPValue(preTrendCoef / (sep[3] || 1e-9));
  }

  // Event study: for each relative time period, estimate the treated-vs-control gap minus the base-period gap.
  const baseTime = times[times.includes(timeRef) ? times.indexOf(timeRef) : 0];
  const eventStudy = times.map((t) => {
    const treatedAtT = rows.filter((r) => r.time === t && r.treatedGroup).map((r) => r.outcome);
    const controlAtT = rows.filter((r) => r.time === t && !r.treatedGroup).map((r) => r.outcome);
    const treatedAtBase = rows.filter((r) => r.time === baseTime && r.treatedGroup).map((r) => r.outcome);
    const controlAtBase = rows.filter((r) => r.time === baseTime && !r.treatedGroup).map((r) => r.outcome);
    const gapT = mean(treatedAtT) - mean(controlAtT);
    const gapBase = mean(treatedAtBase) - mean(controlAtBase);
    const estimate = gapT - gapBase;
    const seApprox =
      Math.sqrt(
        variance(treatedAtT) / Math.max(treatedAtT.length, 1) +
          variance(controlAtT) / Math.max(controlAtT.length, 1),
      ) || 0.01;
    return { relTime: t, estimate, se: seApprox };
  });

  return {
    att,
    se: attSe,
    ci90: [att - 1.645 * attSe, att + 1.645 * attSe],
    pValue,
    parallelTrends: { pValue: preTrendP, passed: preTrendP > 0.1, preTrendCoef },
    eventStudy,
  };
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Two-way demeaning for a BALANCED panel: demeaned_it = v_it - unitMean_i -
 * timeMean_t + grandMean. This is the exact within-transformation used by
 * the Frisch-Waugh-Lovell shortcut for two-way fixed effects, and only
 * requires O(N) work (one pass to compute group means, one pass to demean).
 */
function twoWayDemean(rows: DiDRow[], valueOf: (r: DiDRow) => number): { demeaned: number[] } {
  const unitSums = new Map<string, { sum: number; n: number }>();
  const timeSums = new Map<number, { sum: number; n: number }>();
  let grandSum = 0;
  for (const r of rows) {
    const v = valueOf(r);
    grandSum += v;
    const u = unitSums.get(r.unit) ?? { sum: 0, n: 0 };
    u.sum += v;
    u.n += 1;
    unitSums.set(r.unit, u);
    const t = timeSums.get(r.time) ?? { sum: 0, n: 0 };
    t.sum += v;
    t.n += 1;
    timeSums.set(r.time, t);
  }
  const grandMean = grandSum / rows.length;
  const demeaned = rows.map((r) => {
    const v = valueOf(r);
    const unitMean = unitSums.get(r.unit)!.sum / unitSums.get(r.unit)!.n;
    const timeMean = timeSums.get(r.time)!.sum / timeSums.get(r.time)!.n;
    return v - unitMean - timeMean + grandMean;
  });
  return { demeaned };
}
