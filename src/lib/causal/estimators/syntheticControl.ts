/**
 * src/lib/causal/estimators/syntheticControl.ts
 * Synthetic control for single-unit interventions: solves non-negative,
 * sum-to-one donor weights that minimize pre-period RMSPE, then reports the
 * post-period gap (treated - synthetic) and the RMSPE ratio
 * (post-period RMSPE / pre-period RMSPE) used as a placebo-style diagnostic.
 */
import { mean, mulberry32 } from "../../mathUtils";

export interface SyntheticControlInput {
  /** Treated unit's outcome series, one entry per period (ordered). */
  treated: number[];
  /** Donor pool: each entry is a candidate control unit's outcome series, same length/order as `treated`. */
  donors: { id: string; series: number[] }[];
  /** Index of the first post-intervention period (0-based). */
  interventionIndex: number;
}

export interface SyntheticControlResult {
  weights: { id: string; weight: number }[];
  syntheticSeries: number[];
  gapSeries: number[]; // treated - synthetic, per period
  att: number; // mean post-period gap
  preRmspe: number;
  postRmspe: number;
  rmspeRatio: number;
}

function rmspe(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  const ss = a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / n;
  return Math.sqrt(ss);
}

function projectToSimplex(w: number[]): number[] {
  // Project a vector onto the probability simplex (non-negative, sum to 1).
  const n = w.length;
  const sorted = [...w].sort((a, b) => b - a);
  let cumSum = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cumSum += sorted[i];
    if (sorted[i] + (1 - cumSum) / (i + 1) > 0) rho = i + 1;
  }
  const cumSumRho = sorted.slice(0, rho).reduce((s, v) => s + v, 0);
  const theta = (cumSumRho - 1) / rho;
  return w.map((v) => Math.max(v - theta, 0));
}

/**
 * Projected gradient descent to minimize pre-period squared error over the
 * simplex of donor weights. Deterministic given a fixed seed for the random
 * initialization; pure function otherwise.
 */
export function solveSyntheticControl(input: SyntheticControlInput, opts: { iters?: number; lr?: number; seed?: number } = {}): SyntheticControlResult {
  const { iters = 3000, lr = 0.05, seed = 7 } = opts;
  const { treated, donors, interventionIndex } = input;
  const nDonors = donors.length;
  const rand = mulberry32(seed);
  let w = Array.from({ length: nDonors }, () => rand());
  const wsum0 = w.reduce((s, v) => s + v, 0);
  w = w.map((v) => v / wsum0);

  const preTreated = treated.slice(0, interventionIndex);
  const preDonors = donors.map((d) => d.series.slice(0, interventionIndex));

  for (let it = 0; it < iters; it++) {
    // Compute synthetic series under current weights for the pre-period.
    const synthetic = preTreated.map((_, t) => preDonors.reduce((s, series, j) => s + w[j] * series[t], 0));
    const grad = new Array(nDonors).fill(0);
    for (let t = 0; t < preTreated.length; t++) {
      const err = synthetic[t] - preTreated[t];
      for (let j = 0; j < nDonors; j++) grad[j] += 2 * err * preDonors[j][t];
    }
    const n = preTreated.length || 1;
    w = w.map((v, j) => v - (lr / n) * grad[j]);
    w = projectToSimplex(w);
  }

  const syntheticSeries = treated.map((_, t) => donors.reduce((s, d, j) => s + w[j] * d.series[t], 0));
  const gapSeries = treated.map((v, t) => v - syntheticSeries[t]);
  const postGap = gapSeries.slice(interventionIndex);
  const preRmspe = rmspe(treated.slice(0, interventionIndex), syntheticSeries.slice(0, interventionIndex));
  const postRmspe = rmspe(treated.slice(interventionIndex), syntheticSeries.slice(interventionIndex));

  return {
    weights: donors.map((d, j) => ({ id: d.id, weight: w[j] })),
    syntheticSeries,
    gapSeries,
    att: mean(postGap),
    preRmspe,
    postRmspe,
    rmspeRatio: preRmspe > 1e-9 ? postRmspe / preRmspe : postRmspe > 1e-9 ? Infinity : 0,
  };
}

/**
 * Placebo-in-space test: re-run synthetic control treating each donor as if
 * it were the treated unit, and compare their post/pre RMSPE ratio to the
 * real treated unit's ratio. Returns the share of donors whose ratio equals
 * or exceeds the treated unit's ratio (a permutation-style p-value).
 */
export function syntheticControlPlacebo(input: SyntheticControlInput, realRatio: number): { pValue: number; donorRatios: number[] } {
  const donorRatios: number[] = [];
  for (let i = 0; i < input.donors.length; i++) {
    const placeboTreated = input.donors[i].series;
    const placeboDonors = [
      ...input.donors.slice(0, i),
      ...input.donors.slice(i + 1),
      { id: "__original_treated__", series: input.treated },
    ];
    const res = solveSyntheticControl({ treated: placeboTreated, donors: placeboDonors, interventionIndex: input.interventionIndex }, { seed: 11 + i });
    donorRatios.push(res.rmspeRatio);
  }
  const atLeastAsExtreme = donorRatios.filter((r) => r >= realRatio).length;
  return { pValue: (atLeastAsExtreme + 1) / (donorRatios.length + 1), donorRatios };
}
