// wargameEngine — multi-actor competitive simulation: our move catalog,
// rival best-response modeling, market shocks, and Monte Carlo outcome
// distributions (never a single "you win" verdict).
import { mulberry32 } from "@/lib/prng";

export type MoveCategory = "price" | "product" | "partnership" | "talent" | "market";

export interface Move {
  id: string;
  label: string;
  category: MoveCategory;
  ourCostScore: number; // 0..1
  impactScore: number; // 0..1, our expected gain if uncontested
  counterable: string[]; // move ids a rival could use to blunt this
}

export const MOVE_CATALOG: Move[] = [
  { id: "price_cut", label: "Targeted price cut on at-risk segment", category: "price", ourCostScore: 0.6, impactScore: 0.55, counterable: ["bundle_discount"] },
  { id: "feature_sprint", label: "Ship differentiating feature in 30 days", category: "product", ourCostScore: 0.5, impactScore: 0.75, counterable: ["fast_follow"] },
  { id: "key_partnership", label: "Announce strategic channel partnership", category: "partnership", ourCostScore: 0.4, impactScore: 0.6, counterable: ["counter_partnership"] },
  { id: "talent_raid", label: "Hire competitor's key technical lead", category: "talent", ourCostScore: 0.7, impactScore: 0.5, counterable: ["retention_package"] },
  { id: "market_expansion", label: "Expand into adjacent market segment", category: "market", ourCostScore: 0.65, impactScore: 0.7, counterable: ["localization_push"] },
  { id: "bundle_discount", label: "Bundle discount to defend incumbent accounts", category: "price", ourCostScore: 0.45, impactScore: 0.5, counterable: ["price_cut"] },
  { id: "fast_follow", label: "Fast-follow competitor's feature within a quarter", category: "product", ourCostScore: 0.55, impactScore: 0.45, counterable: ["feature_sprint"] },
];

export interface CompetitorProfile {
  id: string;
  name: string;
  aggressiveness: number; // 0..1 — likelihood of counter-moving at all
  strengthCategories: MoveCategory[];
  weaknessCategories: MoveCategory[];
  marketShockProbability?: number; // 0..1 per round chance of an exogenous shock
}

export interface KnownCompetitorData {
  recentFunding?: boolean;
  priceAggressive?: boolean;
  shippingFast?: boolean;
  hiringSurge?: boolean;
}

/** Heuristically derives a competitor profile from a few known public signals. */
export function generateCompetitorProfile(name: string, knownData: KnownCompetitorData = {}): CompetitorProfile {
  let aggressiveness = 0.4;
  const strengthCategories: MoveCategory[] = [];
  const weaknessCategories: MoveCategory[] = ["talent"];
  if (knownData.recentFunding) {
    aggressiveness += 0.2;
    strengthCategories.push("market", "talent");
  }
  if (knownData.priceAggressive) {
    aggressiveness += 0.15;
    strengthCategories.push("price");
  } else {
    weaknessCategories.push("price");
  }
  if (knownData.shippingFast) {
    strengthCategories.push("product");
  } else {
    weaknessCategories.push("product");
  }
  if (knownData.hiringSurge) {
    aggressiveness += 0.1;
  }
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    aggressiveness: Math.max(0, Math.min(1, aggressiveness)),
    strengthCategories: [...new Set(strengthCategories)],
    weaknessCategories: [...new Set(weaknessCategories)],
    marketShockProbability: 0.1,
  };
}

export interface RoundResult {
  round: number;
  ourMove: Move;
  competitorCountered: boolean;
  counterMove: Move | null;
  marketShock: boolean;
  netImpactToUs: number; // -1..1
}

export interface WargameResult {
  rounds: RoundResult[];
  outcomeDistribution: {
    n: number;
    seed: number;
    winProbability: number; // fraction of simulated paths where cumulative net impact > 0
    meanCumulativeImpact: number;
    p10CumulativeImpact: number;
    p50CumulativeImpact: number;
    p90CumulativeImpact: number;
  };
  earlyWarningIndicators: { signal: string; threshold: string; impliesLikely: string }[];
  assumptions: { ourMoveIds: string[]; competitors: string[]; rounds: number; seed: number };
}

function counterFit(move: Move, competitor: CompetitorProfile): number {
  return competitor.strengthCategories.includes(move.category) ? 1 : 0.5;
}

function simulatePath(ourMoveIds: string[], competitors: CompetitorProfile[], rounds: number, rng: () => number): { rounds: RoundResult[]; cumulativeImpact: number } {
  const roundResults: RoundResult[] = [];
  let cumulativeImpact = 0;
  for (let r = 0; r < rounds; r++) {
    const moveId = ourMoveIds[r % ourMoveIds.length];
    const move = MOVE_CATALOG.find((m) => m.id === moveId) ?? MOVE_CATALOG[0];
    const competitor = competitors[r % competitors.length];
    const fit = counterFit(move, competitor);
    const counterLikelihood = competitor.aggressiveness * fit;
    const competitorCountered = rng() < counterLikelihood;
    const counterMoveId = move.counterable[0];
    const counterMove = competitorCountered ? MOVE_CATALOG.find((m) => m.id === counterMoveId) ?? null : null;
    const marketShock = rng() < (competitor.marketShockProbability ?? 0.1);

    let netImpactToUs = move.impactScore - move.ourCostScore * 0.3;
    if (competitorCountered && counterMove) netImpactToUs -= counterMove.impactScore * 0.6;
    if (marketShock) netImpactToUs -= 0.15 * (rng() > 0.5 ? 1 : -1);
    netImpactToUs = Math.max(-1, Math.min(1, netImpactToUs));

    cumulativeImpact += netImpactToUs;
    roundResults.push({ round: r + 1, ourMove: move, competitorCountered, counterMove, marketShock, netImpactToUs });
  }
  return { rounds: roundResults, cumulativeImpact };
}

/**
 * Runs the wargame as a Monte Carlo ensemble (default 500 paths) over the
 * stochastic counter-move / market-shock decisions, and returns an outcome
 * *distribution* plus one representative round-by-round narrative (the
 * median-outcome path) rather than a single deterministic verdict.
 */
export function runWargame(
  ourMoveIds: string[],
  competitors: CompetitorProfile[],
  rounds = 4,
  seed = 2025,
  paths = 500,
): WargameResult {
  const rng = mulberry32(seed);
  const cumulativeImpacts: number[] = [];
  let representative: RoundResult[] = [];
  let bestDistanceToMedian = Infinity;

  const allPaths: { rounds: RoundResult[]; cumulativeImpact: number }[] = [];
  for (let p = 0; p < paths; p++) {
    const sim = simulatePath(ourMoveIds, competitors, rounds, rng);
    cumulativeImpacts.push(sim.cumulativeImpact);
    allPaths.push(sim);
  }

  const sorted = [...cumulativeImpacts].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const median = pct(50);
  for (const sim of allPaths) {
    const dist = Math.abs(sim.cumulativeImpact - median);
    if (dist < bestDistanceToMedian) {
      bestDistanceToMedian = dist;
      representative = sim.rounds;
    }
  }

  const winProbability = cumulativeImpacts.filter((v) => v > 0).length / cumulativeImpacts.length;
  const meanCumulativeImpact = cumulativeImpacts.reduce((a, b) => a + b, 0) / cumulativeImpacts.length;

  const avgAggressiveness = competitors.reduce((s, c) => s + c.aggressiveness, 0) / (competitors.length || 1);
  const earlyWarningIndicators = [
    {
      signal: "competitor_pricing_moves_per_month",
      threshold: avgAggressiveness > 0.6 ? "> 1" : "> 2",
      impliesLikely: "Counter-move probability rises sharply; favor product/partnership moves over price moves next round.",
    },
    {
      signal: "our_win_rate_trailing_90d",
      threshold: `< ${Math.round((1 - winProbability) * 100)}%`,
      impliesLikely: "Observed reality is tracking the pessimistic tail of this wargame — re-run with updated competitor profile.",
    },
  ];

  return {
    rounds: representative,
    outcomeDistribution: {
      n: paths,
      seed,
      winProbability,
      meanCumulativeImpact,
      p10CumulativeImpact: pct(10),
      p50CumulativeImpact: pct(50),
      p90CumulativeImpact: pct(90),
    },
    earlyWarningIndicators,
    assumptions: { ourMoveIds, competitors: competitors.map((c) => c.name), rounds, seed },
  };
}
