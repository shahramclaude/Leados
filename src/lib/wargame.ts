// wargame — strategic wargaming engine.
//
// PROVENANCE: pasted "pt-O" brief names `js/wargame.js`. Not found in
// github.com/wbweve/Leados this session. Original payoff-matrix simulation
// built from scratch; the four postures/archetypes and payoff numbers below
// are an original, disclosed-fabricated scenario design, not sourced data.

import type { CompetitorArchetype, Posture } from "./types";
import { round1 } from "./prng";

// Expected-value payoff[ourPosture][competitorArchetype] = our net outcome index (-100..100)
// Hand-authored, disclosed-fabricated payoff table (original to this delivery).
const PAYOFF: Record<Posture, Record<CompetitorArchetype, number>> = {
  aggressive: { incumbent: 30, disruptor: -15, "fast-follower": 20, "niche-player": 45 },
  defensive: { incumbent: 10, disruptor: -35, "fast-follower": 5, "niche-player": 15 },
  collaborative: { incumbent: 25, disruptor: 20, "fast-follower": 35, "niche-player": 10 },
  niche: { incumbent: 5, disruptor: 10, "fast-follower": 0, "niche-player": -20 },
};

export interface WargameRound {
  round: number;
  posture: Posture;
  outcome: number;
  volatilityShock: number;
}

export interface WargameResult {
  recommendedPosture: Posture;
  expectedOutcome: number;
  matrix: { posture: Posture; outcome: number }[];
  rounds: WargameRound[];
  summary: string;
}

/** Deterministic pseudo-random shock from a numeric seed, no external RNG dependency. */
function shockFor(seed: number, round: number): number {
  const x = Math.sin(seed * 12.9898 + round * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // -1..1
}

export function runWargame(
  posture: Posture,
  competitorArchetype: CompetitorArchetype,
  marketVolatility: number,
  roundsCount = 5
): WargameResult {
  const matrix = (Object.keys(PAYOFF) as Posture[]).map((p) => ({
    posture: p,
    outcome: PAYOFF[p][competitorArchetype],
  }));
  const best = [...matrix].sort((a, b) => b.outcome - a.outcome)[0];

  const seed = competitorArchetype.length * 7 + marketVolatility;
  const volAmplitude = marketVolatility / 100;
  const rounds: WargameRound[] = Array.from({ length: roundsCount }, (_, i) => {
    const base = PAYOFF[posture][competitorArchetype];
    const shock = shockFor(seed, i + 1) * volAmplitude * 25;
    return {
      round: i + 1,
      posture,
      outcome: round1(base + shock),
      volatilityShock: round1(shock),
    };
  });

  const expectedOutcome = round1(rounds.reduce((s, r) => s + r.outcome, 0) / rounds.length);

  const summary =
    best.posture === posture
      ? `Current posture (${posture}) is already the modeled best response to a ${competitorArchetype} competitor.`
      : `Modeled best response to a ${competitorArchetype} competitor is "${best.posture}" (expected ${best.outcome}), vs current posture "${posture}" (expected ${PAYOFF[posture][competitorArchetype]}).`;

  return { recommendedPosture: best.posture, expectedOutcome, matrix, rounds, summary };
}

export function wargameSignal(posture: Posture, competitorArchetype: CompetitorArchetype, marketVolatility: number): number {
  const r = runWargame(posture, competitorArchetype, marketVolatility, 3);
  // Map outcome index (-100..100) onto a 0-100 "strategic position strength" signal.
  return Math.max(0, Math.min(100, (r.expectedOutcome + 100) / 2));
}
