// src/lib/twin/network.ts
//
// Influence network + independent-cascade diffusion.
//
// Graph generation: each agent gets ~`AVG_OUT_DEGREE` outgoing edges, biased
// towards same-team colleagues (small-world-ish org structure) plus a few
// random long edges. Edge weight p_uv is a synthetic activation probability —
// flagged as fiction in modelVersion.ts, it is NOT measured influence.
//
// Diffusion: standard independent cascade (Kempe/Kleinberg/Tardos). A node
// that becomes active at step t gets exactly one activation attempt on each
// outgoing edge; for a newly-active set `frontier` activating neighbours in
// `candidates`:
//
//   P(v activates this round) = 1 - Prod_{u in frontier, edge u->v} (1 - p_uv)
//
// which matches "P(v activates) = 1 - Π_{u∈activeNeighbors}(1 - p_uv)" from
// the spec, applied incrementally per round (only the newly active frontier
// gets to attempt activation, per the classic IC model — already-active
// neighbours do not retry).

import type { AgentState, NetworkEdge } from "./types";
import type { Rng } from "./prng";

const AVG_OUT_DEGREE = 6;
const SAME_TEAM_BIAS = 0.7; // probability an edge target is same-team

export function generateInfluenceNetwork(agents: AgentState[], rng: Rng): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  const byTeam = new Map<string, AgentState[]>();
  for (const a of agents) {
    if (!byTeam.has(a.teamId)) byTeam.set(a.teamId, []);
    byTeam.get(a.teamId)!.push(a);
  }

  for (const a of agents) {
    const degree = Math.max(1, Math.round(rng.normal(AVG_OUT_DEGREE, 1.5)));
    const seenTargets = new Set<string>([a.personId]);
    for (let i = 0; i < degree; i++) {
      let target: AgentState | undefined;
      if (rng.next() < SAME_TEAM_BIAS) {
        const pool = byTeam.get(a.teamId) ?? agents;
        target = rng.pick(pool);
      } else {
        target = rng.pick(agents);
      }
      if (!target || seenTargets.has(target.personId)) continue;
      seenTargets.add(target.personId);
      // Base weight correlates loosely with the target's influence score so
      // influential people are a little "stickier" to activate from.
      const base = rng.uniform(0.03, 0.22);
      const weight = Math.min(0.85, base + target.influenceScore * 0.15);
      edges.push({ from: a.personId, to: target.personId, weight });
    }
  }
  return edges;
}

/**
 * Advance the independent-cascade process by exactly one round.
 * Returns the newly-activated node ids this round (the new "frontier").
 */
export function stepIndependentCascade(
  activeSet: Set<string>,
  frontier: Set<string>,
  edges: NetworkEdge[],
  rng: Rng,
): Set<string> {
  if (frontier.size === 0) return new Set();
  // Build adjacency restricted to edges originating at the frontier.
  const incoming = new Map<string, number[]>(); // target -> list of weights from active frontier sources
  for (const e of edges) {
    if (!frontier.has(e.from)) continue;
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e.weight);
  }
  const newlyActive = new Set<string>();
  for (const [target, weights] of incoming) {
    if (activeSet.has(target)) continue; // already active, no retry (classic IC)
    const pActivate = 1 - weights.reduce((acc, w) => acc * (1 - w), 1);
    if (rng.bernoulli(pActivate)) {
      newlyActive.add(target);
    }
  }
  return newlyActive;
}
