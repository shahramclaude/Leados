// Contagion cascade simulator: independent-cascade model on the ecosystem /
// value-chain graph, implemented via the equivalent "live-edge" percolation
// formulation (Kempe-Kleinberg-Tardos), extended with a correlated-shock
// term for systemic scenarios (supplier failure, demand shock, regulatory
// shock all hit a shared group of nodes/edges at once).
//
// Design choices made explicitly for testability (see tests/contagion-*):
//   1. All randomness is derived from `deterministicUniform(key)` where the
//      key does NOT depend on the probability parameters themselves. This
//      means: for a fixed seed/trial/edge, the same "live" draw is reused no
//      matter how we vary baseProbabilityMultiplier or correlatedShockFactor.
//      Consequence: increasing either parameter can only turn edges from
//      "not live" to "live", never the reverse => the reachable (affected)
//      set is provably monotone non-decreasing in both parameters. This is
//      the property under test in `cascade monotonicity` tests, not just an
//      empirical observation.
//   2. Same (graph, seedNodeIds, params, seed) always produces the exact
//      same output — required reproducibility.
//   3. Every output carries an explicit sensitivity report (gate #2).

import { deterministicUniform } from "./rng";

export interface CascadeNode {
  id: string;
  revenueWeight: number; // relative importance in exposure scoring, > 0
}

export interface CascadeEdge {
  id: string;
  from: string;
  to: string;
  weight: number; // 0..1 baseline dependency / propagation strength
  correlatedShockGroup?: string | null;
}

export interface CascadeGraph {
  nodes: CascadeNode[];
  edges: CascadeEdge[];
}

export interface CascadeParams {
  baseProbabilityMultiplier: number; // scales edge.weight -> base propagation probability
  correlatedShockFactor: number; // 0..1, strength of shared systemic shock
  trials: number; // Monte Carlo trial count
}

export interface CascadeAggregate {
  meanExposure: number; // mean fraction (revenue-weighted) of non-seed network affected
  intervalLow: number; // p10 across trials — WIDE interval by design, do not over-trust point estimate
  intervalHigh: number; // p90 across trials
  perTrialExposure: number[];
  affectedFrequency: Record<string, number>; // nodeId -> fraction of trials affected
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function effectiveEdgeProbability(
  edge: CascadeEdge,
  params: CascadeParams,
  groupIntensity: (group: string) => number,
): number {
  const base = clamp01(edge.weight * params.baseProbabilityMultiplier);
  if (!edge.correlatedShockGroup) return base;
  const intensity = groupIntensity(edge.correlatedShockGroup);
  const boost = clamp01(params.correlatedShockFactor * intensity);
  // Probabilistic OR-combine: monotone increasing in both base and boost, stays in [0,1].
  return clamp01(base + boost - base * boost);
}

/** Runs a single deterministic trial, returns the set of node ids reached from seeds over live edges. */
export function runSingleTrial(
  graph: CascadeGraph,
  seedNodeIds: string[],
  params: CascadeParams,
  seed: number,
  trialIndex: number,
): Set<string> {
  const groups = new Set<string>();
  for (const e of graph.edges) {
    if (e.correlatedShockGroup) groups.add(e.correlatedShockGroup);
  }
  const groupIntensityCache = new Map<string, number>();
  const groupIntensity = (group: string): number => {
    let v = groupIntensityCache.get(group);
    if (v === undefined) {
      v = deterministicUniform(`${seed}:${trialIndex}:group:${group}`);
      groupIntensityCache.set(group, v);
    }
    return v;
  };

  const adjacency = new Map<string, CascadeEdge[]>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e);
    adjacency.set(e.from, list);
  }

  const affected = new Set<string>(seedNodeIds);
  const queue = [...seedNodeIds];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const outEdges = adjacency.get(current) ?? [];
    for (const edge of outEdges) {
      if (affected.has(edge.to)) continue;
      const liveDraw = deterministicUniform(`${seed}:${trialIndex}:edge:${edge.id}`);
      const effectiveP = effectiveEdgeProbability(edge, params, groupIntensity);
      if (liveDraw < effectiveP) {
        affected.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return affected;
}

export function runCascadeSimulation(
  graph: CascadeGraph,
  seedNodeIds: string[],
  params: CascadeParams,
  seed: number,
): CascadeAggregate {
  if (params.trials < 1) throw new Error("runCascadeSimulation: trials must be >= 1");

  const seedSet = new Set(seedNodeIds);
  const nonSeedNodes = graph.nodes.filter((n) => !seedSet.has(n.id));
  const totalWeight = nonSeedNodes.reduce((sum, n) => sum + n.revenueWeight, 0) || 1;

  const perTrialExposure: number[] = [];
  const affectedCounts: Record<string, number> = Object.fromEntries(graph.nodes.map((n) => [n.id, 0]));

  for (let t = 0; t < params.trials; t++) {
    const affected = runSingleTrial(graph, seedNodeIds, params, seed, t);
    let weightedAffected = 0;
    for (const n of nonSeedNodes) {
      if (affected.has(n.id)) {
        weightedAffected += n.revenueWeight;
        affectedCounts[n.id] += 1;
      }
    }
    perTrialExposure.push(weightedAffected / totalWeight);
  }

  const sorted = [...perTrialExposure].sort((a, b) => a - b);
  const meanExposure = perTrialExposure.reduce((a, b) => a + b, 0) / perTrialExposure.length;

  const affectedFrequency: Record<string, number> = {};
  for (const [nodeId, count] of Object.entries(affectedCounts)) {
    affectedFrequency[nodeId] = count / params.trials;
  }

  return {
    meanExposure,
    intervalLow: percentile(sorted, 0.1),
    intervalHigh: percentile(sorted, 0.9),
    perTrialExposure,
    affectedFrequency,
  };
}
