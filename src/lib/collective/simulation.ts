// Part 44 — Simulations used by the measurement gates (PHASE 4):
//   (1) calibration-weighted pooling vs unweighted mean pooling on seeded
//       heterogeneous (mixed skill) forecasters -> Brier score comparison.
//   (2) herding behavior: synthetic agents with correlated signals in an "open"
//       visibility mode (see others' live estimates) vs "anonymous_delayed" mode
//       (Delphi default) -> dispersion collapse measurement.
//
// A seeded linear congruential generator is used (not Math.random) so every run is
// byte-for-byte reproducible for the verification log.

import { extremize, mean, stdDev } from "./aggregation";

export function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function gaussianFrom(rand: () => number): number {
  // Box-Muller
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface SyntheticForecaster {
  id: string;
  skill: number; // 0..1, higher = estimate closer to truth with less noise
}

export interface PoolingSimulationResult {
  trials: number;
  nForecasters: number;
  uniformMeanBrier: number;
  calibrationWeightedBrier: number;
  extremizedBrier: number;
  improvementVsUniform: number; // uniform - calibrationWeighted (positive = weighting helped)
}

/**
 * Simulates `trials` binary questions. Each question has a true probability drawn
 * uniformly; a heterogeneous panel of forecasters (mixed skill) each observe a noisy
 * signal of the truth whose noise scales inversely with skill. We then compare:
 *   - naive uniform mean pooling
 *   - calibration-weighted pooling (weights = true skill, i.e. the best-case use of
 *     Part 13 calibration scores when they accurately reflect ability)
 *   - extremized pooling of the uniform mean
 * against realized outcomes, and compare Brier scores.
 */
export function simulateCalibrationWeightedPooling(
  seed: number,
  trials = 2000,
  forecasters: SyntheticForecaster[] = defaultHeterogeneousPanel(),
): PoolingSimulationResult {
  const rand = seededRandom(seed);
  let uniformBrierTotal = 0;
  let weightedBrierTotal = 0;
  let extremizedBrierTotal = 0;

  for (let t = 0; t < trials; t++) {
    const truth = rand(); // true probability of YES
    const outcome = rand() < truth ? 1 : 0;

    const estimates = forecasters.map((f) => {
      const noiseScale = 0.5 * (1 - f.skill) + 0.02; // lower skill -> more noise
      const noisy = truth + gaussianFrom(rand) * noiseScale;
      return clamp01(noisy);
    });

    const uniformPooled = mean(estimates);
    const totalSkill = forecasters.reduce((a, f) => a + f.skill, 0) || 1;
    const weightedPooled = estimates.reduce((acc, e, i) => acc + e * forecasters[i].skill, 0) / totalSkill;
    const extremizedPooled = extremize(uniformPooled, 1.5);

    uniformBrierTotal += (uniformPooled - outcome) ** 2;
    weightedBrierTotal += (weightedPooled - outcome) ** 2;
    extremizedBrierTotal += (extremizedPooled - outcome) ** 2;
  }

  const uniformMeanBrier = uniformBrierTotal / trials;
  const calibrationWeightedBrier = weightedBrierTotal / trials;
  const extremizedBrier = extremizedBrierTotal / trials;

  return {
    trials,
    nForecasters: forecasters.length,
    uniformMeanBrier,
    calibrationWeightedBrier,
    extremizedBrier,
    improvementVsUniform: uniformMeanBrier - calibrationWeightedBrier,
  };
}

export function defaultHeterogeneousPanel(): SyntheticForecaster[] {
  return [
    { id: "expert-1", skill: 0.95 },
    { id: "expert-2", skill: 0.88 },
    { id: "generalist-1", skill: 0.6 },
    { id: "generalist-2", skill: 0.55 },
    { id: "novice-1", skill: 0.3 },
    { id: "novice-2", skill: 0.25 },
    { id: "noise-trader", skill: 0.05 },
  ];
}

// ---------------------------------------------------------------------------
// Herding simulation
// ---------------------------------------------------------------------------

export interface HerdingSimulationResult {
  mode: "open" | "anonymous_delayed";
  rounds: number;
  initialStdDev: number;
  finalStdDev: number;
  dispersionCollapseRatio: number; // finalStdDev / initialStdDev (lower = more collapse)
}

/**
 * Simulates N agents with correlated private signals (common noise component `rho`)
 * forming estimates over several rounds.
 *  - "open" mode: each agent's next-round estimate is pulled toward the *live* mean of
 *    all other agents' current-round estimates by an anchoring factor (classic herding/
 *    anchoring channel: seeing others' numbers in real time).
 *  - "anonymous_delayed" mode: agents only see the ROUND-CLOSED controlled-feedback
 *    summary (mean + bucketed histogram) *after* the round ends, and the anchoring pull
 *    is weaker because individual live positions are never visible (this mirrors the
 *    Delphi engine's `anonymous_delayed` mode in delphi.ts).
 */
export function simulateHerding(
  seed: number,
  mode: "open" | "anonymous_delayed",
  nAgents = 40,
  rounds = 5,
  correlatedSignalWeight = 0.6,
): HerdingSimulationResult {
  const rand = seededRandom(seed);
  const truth = 0.5 + 0.1 * gaussianFrom(rand);
  const commonNoise = gaussianFrom(rand) * 0.15; // shared bias all agents partially see (correlated signal)

  let estimates = Array.from({ length: nAgents }, () => {
    const idiosyncratic = gaussianFrom(rand) * 0.2;
    return clamp01(truth + correlatedSignalWeight * commonNoise + (1 - correlatedSignalWeight) * idiosyncratic);
  });
  const initialStdDev = stdDev(estimates);

  // Open mode anchors strongly toward the live group mean each round (visible positions).
  // Anonymous/delayed mode anchors much more weakly, since agents only see a post-hoc
  // summary and must still reason independently before the next round opens.
  const anchorStrength = mode === "open" ? 0.55 : 0.12;

  for (let r = 0; r < rounds; r++) {
    const groupMean = mean(estimates);
    estimates = estimates.map((e) => {
      const idiosyncraticUpdate = gaussianFrom(rand) * 0.03; // small continued independent reasoning
      const anchored = e + anchorStrength * (groupMean - e) + idiosyncraticUpdate;
      return clamp01(anchored);
    });
  }

  const finalStdDev = stdDev(estimates);
  return {
    mode,
    rounds,
    initialStdDev,
    finalStdDev,
    dispersionCollapseRatio: initialStdDev === 0 ? 1 : finalStdDev / initialStdDev,
  };
}
