/**
 * montecarlo.ts — orchestrates the worker pool into a single Monte Carlo
 * estimate with a documented convergence check, wrapped as Explain<T>.
 *
 * Scenario: TotalCost = Σ weight_i * X_i, X_i ~ Normal(mean_i, sd_i) i.i.d.
 * across variables. Because this sum is itself Normal(muT, sigmaT), we have
 * closed-form ground truth for both quantities we estimate by simulation:
 *   P(TotalCost > budget)            = Φ((muT - budget) / sigmaT)
 *   E[max(TotalCost - budget, 0)]    = (muT-budget)*Φ(d) + sigmaT*φ(d),  d=(muT-budget)/sigmaT
 * This lets the eval harness and property tests check the simulator against
 * exact answers, not just internal consistency.
 */

import { normalCdf } from "@/lib/mathUtils";
import { McScenarioSpec, runWorkerPool, ChunkResult, PoolProgress } from "./workerPool";
import { Explain, makeExplain } from "./types";

function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function analyticGroundTruth(scenario: McScenarioSpec): {
  muT: number;
  sigmaT: number;
  probExceed: number;
  expectedOverrun: number;
} {
  const muT = scenario.variables.reduce((acc, v) => acc + v.weight * v.mean, 0);
  const varT = scenario.variables.reduce((acc, v) => acc + (v.weight * v.sd) ** 2, 0);
  const sigmaT = Math.sqrt(varT);
  const d = (muT - scenario.budget) / sigmaT;
  const probExceed = normalCdf(d);
  const expectedOverrun = (muT - scenario.budget) * normalCdf(d) + sigmaT * phi(d);
  return { muT, sigmaT, probExceed, expectedOverrun };
}

export interface McEstimate {
  mean: number;
  stderr: number;
  n: number;
  relativeError: number;
  converged: boolean;
}

function poolEstimate(chunks: ChunkResult[], pick: (c: ChunkResult) => [number, number, number]): McEstimate {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (const c of chunks) {
    const [cn, csum, csumSq] = pick(c);
    n += cn;
    sum += csum;
    sumSq += csumSq;
  }
  const m = n > 0 ? sum / n : NaN;
  const variance = n > 1 ? Math.max(0, sumSq / n - m * m) * (n / (n - 1)) : NaN;
  const stderr = n > 0 ? Math.sqrt(variance / n) : NaN;
  const relativeError = Math.abs(stderr / Math.max(Math.abs(m), 1e-9));
  return { mean: m, stderr, n, relativeError, converged: relativeError < 0.02 };
}

export interface McRunResult {
  probExceed: McEstimate;
  expectedOverrun: McEstimate;
  strategyUsed: "threads" | "inline";
  cancelled: boolean;
  groundTruth: ReturnType<typeof analyticGroundTruth>;
}

export async function runMonteCarloScenario(args: {
  seed: string;
  scenario: McScenarioSpec;
  totalPairs: number;
  chunkSize?: number;
  poolSize?: number;
  onProgress?: (p: PoolProgress) => void;
  isCancelled?: () => boolean;
  strategy?: "threads" | "inline" | "auto";
}): Promise<McRunResult> {
  const { chunks, strategyUsed, cancelled } = await runWorkerPool({
    seed: args.seed,
    scenario: args.scenario,
    totalPairs: args.totalPairs,
    chunkSize: args.chunkSize,
    poolSize: args.poolSize,
    onProgress: args.onProgress,
    isCancelled: args.isCancelled,
    strategy: args.strategy,
  });

  const probExceed = poolEstimate(chunks, (c) => [c.n, c.sumExceed, c.sumExceedSq]);
  const expectedOverrun = poolEstimate(chunks, (c) => [c.n, c.sumOverrun, c.sumOverrunSq]);
  const groundTruth = analyticGroundTruth(args.scenario);

  return { probExceed, expectedOverrun, strategyUsed, cancelled, groundTruth };
}

const Z95 = 1.959963984540054;

export function explainMcEstimate(
  est: McEstimate,
  opts: { method: string; modelCardId: string; label: string; scenarioAssumptions: string[] },
): Explain<number> {
  if (!Number.isFinite(est.mean) || est.n === 0) {
    return makeExplain({
      value: 0,
      interval: [NaN, NaN],
      confidenceClass: "assumed",
      method: opts.method,
      assumptions: ["Simulation produced no completed samples (cancelled before any pair finished)."],
      evidence: [],
      sensitivity: [],
      modelCardId: opts.modelCardId,
      nextDataNeeded: "Re-run the simulation to completion.",
    });
  }
  return makeExplain({
    value: est.mean,
    interval: [est.mean - Z95 * est.stderr, est.mean + Z95 * est.stderr],
    confidenceClass: "inferred",
    method: opts.method,
    assumptions: [
      ...opts.scenarioAssumptions,
      `Monte Carlo over n=${est.n} antithetic pairs; relative standard error ${(est.relativeError * 100).toFixed(2)}% (target < 2%).`,
      est.converged
        ? "Converged: relative MC error is below the 2% target at this N."
        : "NOT converged: relative MC error exceeds the 2% target — increase N before trusting this interval.",
    ],
    evidence: [{ ref: `monte-carlo:${opts.label}`, weight: est.n, direction: "neutral" }],
    sensitivity: [],
    modelCardId: opts.modelCardId,
  });
}
