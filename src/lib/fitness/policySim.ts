// LEADOS — Part 39: Weight Policy "what-if" simulation.
//
// Before a proposed weight change is activated, we recompute what fitness
// WOULD have been across historical periods using the proposed weights
// applied to the already-recorded per-dimension scores (D_i) from each
// historical snapshot's decomposition. This lets us warn: "this weight
// change would have flipped last quarter's trend — proceed?"

import { DIMENSIONS } from "./dimensions";
import type { WeightMap } from "./types";

export interface HistoricalDimensionScores {
  periodEnd: string;
  dimensionScores: Record<string, number>; // dimensionId -> D_i, as recorded in a past snapshot
  actualFitness: number; // fitness as originally computed with the policy active at that time
}

export interface PolicySimulationPoint {
  periodEnd: string;
  originalFitness: number;
  simulatedFitness: number;
  delta: number;
}

export interface PolicySimulationResult {
  points: PolicySimulationPoint[];
  originalTrendSlope: number;
  simulatedTrendSlope: number;
  trendFlips: boolean;
  summary: string;
}

function simulateFitnessWithWeights(weights: WeightMap, dimensionScores: Record<string, number>): number {
  const totalRaw = DIMENSIONS.reduce((s, d) => s + (weights[d.id]?.weight ?? 0), 0);
  if (totalRaw <= 0) return 0;
  let fitness = 0;
  for (const d of DIMENSIONS) {
    const n = (weights[d.id]?.weight ?? 0) / totalRaw;
    fitness += n * (dimensionScores[d.id] ?? 0);
  }
  return fitness;
}

function slopeOf(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanT = (n - 1) / 2;
  const meanV = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    num += (t - meanT) * (values[t] - meanV);
    den += (t - meanT) * (t - meanT);
  }
  return den === 0 ? 0 : num / den;
}

export function simulatePolicy(
  history: HistoricalDimensionScores[],
  proposedWeights: WeightMap,
): PolicySimulationResult {
  const sorted = [...history].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const points: PolicySimulationPoint[] = sorted.map((h) => {
    const simulatedFitness = simulateFitnessWithWeights(proposedWeights, h.dimensionScores);
    return {
      periodEnd: h.periodEnd,
      originalFitness: h.actualFitness,
      simulatedFitness,
      delta: simulatedFitness - h.actualFitness,
    };
  });

  const originalTrendSlope = slopeOf(points.map((p) => p.originalFitness));
  const simulatedTrendSlope = slopeOf(points.map((p) => p.simulatedFitness));
  const trendFlips = Math.sign(originalTrendSlope) !== Math.sign(simulatedTrendSlope) && points.length >= 2;

  const summary = trendFlips
    ? `Warning: under the proposed weights, the historical trend direction would FLIP (original slope ${originalTrendSlope.toFixed(4)}, simulated slope ${simulatedTrendSlope.toFixed(4)}). Review carefully before activating.`
    : `Proposed weights preserve the historical trend direction (original slope ${originalTrendSlope.toFixed(4)}, simulated slope ${simulatedTrendSlope.toFixed(4)}).`;

  return { points, originalTrendSlope, simulatedTrendSlope, trendFlips, summary };
}
