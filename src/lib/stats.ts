/**
 * src/lib/stats.ts
 * Statistical helpers layered on mathUtils: hypothesis tests, balance
 * diagnostics, and sensitivity-analysis primitives (E-value, Rosenbaum-style
 * bound) used across the causal estimators.
 */
import { mean, variance, weightedMean, weightedVariance, zTwoSidedPValue, sum, mulberry32 } from "./mathUtils";

export interface TTestResult {
  diff: number;
  se: number;
  t: number;
  pValue: number;
  ci95: [number, number];
}

/** Welch's two-sample t-test (unequal variance), used for simple difference-in-means estimators and placebo tests. */
export function welchTTest(a: number[], b: number[]): TTestResult {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  const diff = ma - mb;
  const t = diff / se;
  const pValue = zTwoSidedPValue(t); // normal approximation, adequate for N >= ~30
  return { diff, se, t, pValue, ci95: [diff - 1.96 * se, diff + 1.96 * se] };
}

/** Standardized mean difference between treated/control for one covariate (used for balance diagnostics). */
export function standardizedMeanDifference(treated: number[], control: number[], weightsTreated?: number[], weightsControl?: number[]): number {
  const mt = weightsTreated ? weightedMean(treated, weightsTreated) : mean(treated);
  const mc = weightsControl ? weightedMean(control, weightsControl) : mean(control);
  const vt = weightsTreated ? weightedVariance(treated, weightsTreated) : variance(treated);
  const vc = weightsControl ? weightedVariance(control, weightsControl) : variance(control);
  const pooledSd = Math.sqrt((vt + vc) / 2);
  if (pooledSd === 0 || Number.isNaN(pooledSd)) return 0;
  return (mt - mc) / pooledSd;
}

export interface BalanceRow {
  covariate: string;
  smdBefore: number;
  smdAfter: number;
  balanced: boolean; // |smdAfter| < 0.1
}

export function balanceTable(
  covariateNames: string[],
  treatedRows: number[][],
  controlRows: number[][],
  controlWeights: number[],
): BalanceRow[] {
  const unitWeightsControl = controlRows.map(() => 1);
  return covariateNames.map((name, j) => {
    const treatedCol = treatedRows.map((r) => r[j]);
    const controlCol = controlRows.map((r) => r[j]);
    const smdBefore = standardizedMeanDifference(treatedCol, controlCol, undefined, unitWeightsControl);
    const smdAfter = standardizedMeanDifference(treatedCol, controlCol, undefined, controlWeights);
    return { covariate: name, smdBefore, smdAfter, balanced: Math.abs(smdAfter) < 0.1 };
  });
}

/**
 * E-value: minimum strength of association (risk-ratio scale) an unmeasured
 * confounder would need to have with BOTH treatment and outcome to fully
 * explain away an observed effect estimate, given the CI bound closest to
 * the null. Implemented for a standardized-mean-difference-style estimate by
 * first converting to an approximate risk ratio via the VanderWeele-Ding
 * approximation (RR ≈ exp(0.91 * SMD)) for continuous outcomes.
 */
export function eValue(estimateSmd: number, ciBoundSmd: number): { pointEValue: number; ciEValue: number } {
  const toRR = (smd: number) => Math.exp(0.91 * Math.abs(smd));
  const evalFromRR = (rr: number) => (rr >= 1 ? rr + Math.sqrt(rr * (rr - 1)) : (1 / rr) + Math.sqrt((1 / rr) * (1 / rr - 1)));
  const rrPoint = toRR(estimateSmd);
  const rrCi = toRR(ciBoundSmd);
  return {
    pointEValue: evalFromRR(rrPoint),
    ciEValue: ciBoundSmd === 0 ? 1 : evalFromRR(rrCi),
  };
}

/**
 * Simplified Rosenbaum-style sensitivity bound for matched-pair comparisons:
 * reports, for a grid of Gamma (odds of differential assignment due to an
 * unmeasured confounder), the worst-case p-value under Wilcoxon signed-rank
 * logic approximated with a normal approximation. Returns the smallest
 * Gamma at which significance (p<0.05) could be lost.
 */
export function rosenbaumBounds(pairedDiffs: number[], gammaGrid: number[] = [1, 1.5, 2, 2.5, 3, 4, 5]): {
  gamma: number;
  worstCaseP: number;
}[] {
  const n = pairedDiffs.length;
  const ranks = rankAbs(pairedDiffs);
  const signs = pairedDiffs.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0));
  const wPlus = sum(ranks.map((r, i) => (signs[i] > 0 ? r : 0)));
  return gammaGrid.map((gamma) => {
    const pPlus = gamma / (1 + gamma);
    const muMax = sum(ranks.map((r) => r * pPlus));
    const varMax = sum(ranks.map((r) => r * r * pPlus * (1 - pPlus)));
    const z = varMax > 0 ? (wPlus - muMax) / Math.sqrt(varMax) : 0;
    const worstCaseP = 1 - normalCdfLocal(z);
    return { gamma, worstCaseP };
  });

  function rankAbs(xs: number[]): number[] {
    const idx = xs.map((x, i) => [Math.abs(x), i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n).fill(0);
    idx.forEach(([, origIdx], rank) => (r[origIdx] = rank + 1));
    return r;
  }
  function normalCdfLocal(z: number): number {
    return 0.5 * (1 + erfLocal(z / Math.SQRT2));
  }
  function erfLocal(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }
}

/** Bootstrap percentile CI for an arbitrary statistic function over paired arrays. */
export function bootstrapCI(
  n: number,
  statFn: (sampleIdx: number[]) => number,
  opts: { iters?: number; seed?: number; alpha?: number } = {},
): { low: number; high: number; draws: number[] } {
  const { iters = 500, seed = 42, alpha = 0.1 } = opts;
  const rand = mulberry32(seed);
  const draws: number[] = [];
  for (let b = 0; b < iters; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
    draws.push(statFn(idx));
  }
  const sorted = [...draws].sort((a, b) => a - b);
  const low = sorted[Math.floor((alpha / 2) * sorted.length)];
  const high = sorted[Math.ceil((1 - alpha / 2) * sorted.length) - 1];
  return { low, high, draws };
}

export function pooledStd(a: number[], b: number[]): number {
  return Math.sqrt((variance(a) + variance(b)) / 2);
}
