/**
 * monteCarlo.ts — Part 04-F forecasting core. Pure Monte Carlo simulation:
 * given a list of named input distributions and a combinator, draws N
 * samples with a seeded `Rng` (see `prng.ts`, so results are reproducible)
 * and returns p10/p50/p90 + a histogram, never a single point estimate.
 */

import { makeRng, type Rng } from "./prng";
import { quantile } from "./stats";
import type { ForecastAssumption } from "./types";

export type InputDistribution =
  | { name: string; kind: "normal"; mu: number; sigma: number; detail: string }
  | { name: string; kind: "beta"; alpha: number; beta: number; detail: string }
  | { name: string; kind: "uniform"; lo: number; hi: number; detail: string };

export type MonteCarloConfig = {
  inputs: InputDistribution[];
  /** combine one draw per input (keyed by name) into the scalar outcome for
   * that trial, e.g. (draws) => draws.conversionRate * draws.trafficVolume */
  combine: (draws: Record<string, number>) => number;
  trials: number;
  seed: number;
  histogramBins?: number;
};

export type MonteCarloResult = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  samples: number[]; // kept for CRPS scoring in metricsIntelligence.ts
  histogram: { binLo: number; binHi: number; count: number }[];
  assumptions: ForecastAssumption[];
  rawDraws: Record<string, number[]>; // per-input draws, for sensitivity/driver analysis
};

/** Pearson correlation coefficient — used to turn per-input Monte Carlo
 * draws into a driver "contribution" for `Explain<Forecast>` (how much of
 * the outcome's variance each assumption is associated with). */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx;
    const ey = ys[i] - my;
    num += ex * ey;
    dx += ex * ex;
    dy += ey * ey;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function drawOne(rng: Rng, dist: InputDistribution): number {
  switch (dist.kind) {
    case "normal":
      return rng.gaussian(dist.mu, dist.sigma);
    case "beta":
      return rng.beta(dist.alpha, dist.beta);
    case "uniform":
      return rng.range(dist.lo, dist.hi);
  }
}

export function runMonteCarlo(config: MonteCarloConfig): MonteCarloResult {
  const rng = makeRng(config.seed);
  const samples: number[] = new Array(config.trials);
  const rawDraws: Record<string, number[]> = {};
  for (const input of config.inputs) rawDraws[input.name] = new Array(config.trials);
  for (let t = 0; t < config.trials; t++) {
    const draws: Record<string, number> = {};
    for (const input of config.inputs) {
      const v = drawOne(rng, input);
      draws[input.name] = v;
      rawDraws[input.name][t] = v;
    }
    samples[t] = config.combine(draws);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const bins = config.histogramBins ?? 20;
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => {
    const binLo = lo + i * width;
    const binHi = i === bins - 1 ? hi : binLo + width;
    const count = sorted.filter((x) => x >= binLo && (i === bins - 1 ? x <= binHi : x < binHi)).length;
    return { binLo, binHi, count };
  });

  return {
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    samples,
    histogram,
    assumptions: config.inputs.map((i) => ({ name: i.name, detail: i.detail })),
    rawDraws,
  };
}
