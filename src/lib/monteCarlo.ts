import type { MonteCarloResult } from "./types";

/**
 * Monte Carlo runway simulator.
 *
 * Models runway (months until cash runs out) as a base deterministic runway
 * (cash / net monthly burn) perturbed per-iteration by a continuous,
 * normally-distributed relative shock to burn, with a modest extension for
 * revenue growth. This keeps the output a smooth continuous distribution
 * (no "cap hit" ties), which is required for the p10 < p50 < p90 guarantee.
 */
export function runMonteCarloRunway(
  startingCash: number,
  monthlyBurn: number,
  burnStdDev: number,
  monthlyRevenue: number,
  revenueGrowthRate: number,
  iterations: number
): MonteCarloResult {
  const netBurn = Math.max(1, monthlyBurn - monthlyRevenue);
  const baseRunwayMonths = startingCash / netBurn;
  const volatilityRatio = burnStdDev / Math.max(1, monthlyBurn);
  const growthRelief = 1 + Math.max(0, revenueGrowthRate) * 2;

  const runways: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const shock = sampleNormal(0, volatilityRatio);
    const burnFactor = Math.max(0.05, 1 + shock);
    const runway = (baseRunwayMonths * growthRelief) / burnFactor;
    runways.push(Math.max(0.1, runway));
  }

  runways.sort((a, b) => a - b);
  return {
    p10: percentile(runways, 10),
    p50: percentile(runways, 50),
    p90: percentile(runways, 90),
  };
}

function sampleNormal(mean: number, stdDev: number): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
