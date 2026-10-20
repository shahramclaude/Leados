/**
 * wargameEngine.ts — Part 06 section F: analysis layer built on top of
 * `wargame.ts`'s single-run engine.
 *
 * Provides:
 *   - a round-robin tournament across built-in strategies (many seeds) to
 *     identify the dominant strategy by average final score
 *   - fragility detection: perturb the random seed / shock magnitude
 *     slightly and see whether the winner flips — flagged scenarios are
 *     "fragile" (small perturbation, different outcome)
 *   - leading indicators: metrics measured early (e.g. market share after
 *     round 3) correlated with who eventually wins, reported as "watch
 *     this" signals
 *
 * Deterministic-per-seed throughout: every run here is driven by
 * `createRng` substreams, never `Math.random()`.
 */
import { createRng } from "@/lib/prng";
import { STRATEGIES, runWargame, type StrategyName, type WargameSpec, type WargameRunResult } from "@/lib/wargame";
import { mean, ols } from "@/lib/stats";

export interface TournamentRow {
  strategyName: StrategyName;
  avgFinalScore: number;
  winRate: number;
  n: number;
}

export interface TournamentResult {
  rows: TournamentRow[];
  dominantStrategy: StrategyName;
  seedsUsed: number;
}

/**
 * Round-robin 1v1 tournament: every strategy plays every other strategy
 * (including itself) across `seedsPerMatchup` seeds, `roundsPerGame` rounds
 * each. Ranks strategies by average final score across all their games.
 */
export function runTournament(opts: { roundsPerGame?: number; seedsPerMatchup?: number; shockProbability?: number; shockMagnitude?: number; baseSeed?: string } = {}): TournamentResult {
  const roundsPerGame = opts.roundsPerGame ?? 20;
  const seedsPerMatchup = opts.seedsPerMatchup ?? 10;
  const shockProbability = opts.shockProbability ?? 0.25;
  const shockMagnitude = opts.shockMagnitude ?? 0.3;
  const baseSeed = opts.baseSeed ?? "leados-wargame-tournament-v1";

  const strategyNames = Object.keys(STRATEGIES) as StrategyName[];
  const scoresByStrategy = new Map<StrategyName, number[]>();
  const winsByStrategy = new Map<StrategyName, number>();
  const gamesByStrategy = new Map<StrategyName, number>();
  for (const s of strategyNames) {
    scoresByStrategy.set(s, []);
    winsByStrategy.set(s, 0);
    gamesByStrategy.set(s, 0);
  }

  for (let i = 0; i < strategyNames.length; i++) {
    for (let j = i; j < strategyNames.length; j++) {
      const stratA = strategyNames[i];
      const stratB = strategyNames[j];
      for (let s = 0; s < seedsPerMatchup; s++) {
        const seed = createRng(baseSeed).substream(`${stratA}-vs-${stratB}#${s}`).state().a.toString();
        const spec: WargameSpec = {
          actors: [
            { id: "A", name: stratA, strategyName: stratA },
            { id: "B", name: stratB, strategyName: stratB },
          ],
          rounds: roundsPerGame,
          shockProbability,
          shockMagnitude,
          seed,
        };
        const result = runWargame(spec);
        scoresByStrategy.get(stratA)!.push(result.finalScores.A);
        scoresByStrategy.get(stratB)!.push(result.finalScores.B);
        gamesByStrategy.set(stratA, gamesByStrategy.get(stratA)! + 1);
        gamesByStrategy.set(stratB, gamesByStrategy.get(stratB)! + 1);
        if (result.winnerActorId === "A") winsByStrategy.set(stratA, winsByStrategy.get(stratA)! + 1);
        else winsByStrategy.set(stratB, winsByStrategy.get(stratB)! + 1);
      }
    }
  }

  const rows: TournamentRow[] = strategyNames.map((s) => ({
    strategyName: s,
    avgFinalScore: mean(scoresByStrategy.get(s)!),
    winRate: (winsByStrategy.get(s) ?? 0) / Math.max(1, gamesByStrategy.get(s) ?? 1),
    n: gamesByStrategy.get(s) ?? 0,
  }));
  rows.sort((a, b) => b.avgFinalScore - a.avgFinalScore);

  return { rows, dominantStrategy: rows[0].strategyName, seedsUsed: seedsPerMatchup };
}

export interface FragilityPoint {
  description: string;
  baseWinner: string;
  perturbedWinner: string;
  perturbation: string;
}

/**
 * Fragility check: run the base spec, then run small perturbations
 * (seed bump, +/-10% shock magnitude) and flag any case where the winner
 * changes. A scenario with many flips is "fragile" — small, plausible
 * changes in assumptions change who wins.
 */
export function findFragilityPoints(spec: WargameSpec): FragilityPoint[] {
  const base = runWargame(spec);
  const points: FragilityPoint[] = [];

  const variants: Array<{ description: string; spec: WargameSpec }> = [
    { description: "seed+1", spec: { ...spec, seed: `${spec.seed}#alt1` } },
    { description: "seed+2", spec: { ...spec, seed: `${spec.seed}#alt2` } },
    { description: "shockMagnitude -10%", spec: { ...spec, shockMagnitude: spec.shockMagnitude * 0.9 } },
    { description: "shockMagnitude +10%", spec: { ...spec, shockMagnitude: spec.shockMagnitude * 1.1 } },
    { description: "shockProbability +10pp", spec: { ...spec, shockProbability: Math.min(1, spec.shockProbability + 0.1) } },
  ];

  for (const v of variants) {
    const result = runWargame(v.spec);
    if (result.winnerActorId !== base.winnerActorId) {
      points.push({
        description: `Winner flips under perturbation: ${v.description}`,
        baseWinner: base.winnerActorId,
        perturbedWinner: result.winnerActorId,
        perturbation: v.description,
      });
    }
  }
  return points;
}

export interface LeadingIndicator {
  metric: string;
  roundMeasured: number;
  correlationWithFinalWinnerScore: number;
  interpretation: string;
}

/**
 * Correlate an early-round metric (market share at `roundMeasured`) with
 * the actor's eventual final score, across many re-seeded runs of the same
 * actor/strategy configuration. A strong correlation means "watch this
 * metric early — it's predictive."
 */
export function findLeadingIndicators(spec: WargameSpec, opts: { roundMeasured?: number; samples?: number } = {}): LeadingIndicator[] {
  const roundMeasured = opts.roundMeasured ?? Math.max(1, Math.floor(spec.rounds / 4));
  const samples = opts.samples ?? 40;
  const early: number[] = [];
  const final: number[] = [];

  for (let i = 0; i < samples; i++) {
    const seed = `${spec.seed}#indicator${i}`;
    const result = runWargame({ ...spec, seed });
    const roundRecord = result.rounds[roundMeasured] ?? result.rounds[result.rounds.length - 1];
    const firstActorId = spec.actors[0].id;
    early.push(roundRecord.marketShareAfter[firstActorId] ?? 0);
    final.push(result.finalScores[firstActorId] ?? 0);
  }

  const fit = ols(early, final);
  return [
    {
      metric: `marketShare(${spec.actors[0].id})@round${roundMeasured}`,
      roundMeasured,
      correlationWithFinalWinnerScore: fit.r2,
      interpretation:
        fit.r2 > 0.3
          ? `Market share at round ${roundMeasured} is a meaningfully predictive early indicator of ${spec.actors[0].id}'s final score (R²=${fit.r2.toFixed(2)}).`
          : `Market share at round ${roundMeasured} is NOT a reliable early indicator here (R²=${fit.r2.toFixed(2)}) — avoid over-interpreting early leads in this configuration.`,
    },
  ];
}

export interface WargameAnalysis {
  run: WargameRunResult;
  tournament: TournamentResult;
  fragilityPoints: FragilityPoint[];
  leadingIndicators: LeadingIndicator[];
}

export function analyzeWargame(spec: WargameSpec): WargameAnalysis {
  return {
    run: runWargame(spec),
    tournament: runTournament({ baseSeed: `${spec.seed}-tournament` }),
    fragilityPoints: findFragilityPoints(spec),
    leadingIndicators: findLeadingIndicators(spec),
  };
}
