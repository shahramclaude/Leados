// src/lib/bayesianNetwork.ts
//
// Noisy-OR Bayesian network primitives (Pearl 1988 §4.3.2). This is the
// pure math layer: no DB, no IO. beliefFabric.ts builds network topology
// on top of this unchanged.

import type {
  CausalParent,
  LegacyLatentNodeId,
  NoisyOrNode,
  NodeMarginal,
  ObservableNodeId,
} from "./types";

/**
 * Noisy-OR posterior: given a leak probability and a set of (q, p) parent
 * inputs — where q is the causal power of the parent and p is the parent's
 * current probability of being "active" — compute:
 *
 *   P(child=1) = 1 - (1-leak) * Π_i (1 - q_i * p_i)
 *
 * This is the standard noisy-OR combination rule generalized to soft
 * evidence (parent activation probability rather than a hard 0/1).
 */
export function noisyOrPosterior(leak: number, parents: Array<{ q: number; p: number }>): number {
  let product = 1 - leak;
  for (const { q, p } of parents) {
    product *= 1 - q * p;
  }
  return 1 - product;
}

/**
 * Evidentiary confidence: how far, on average, the parent inputs are from
 * the "uninformative" midpoint (0.5). All parents at 0 or 1 => confidence 1.
 * All parents at 0.5 => confidence 0. This is a DESIGN PARAMETER metric,
 * not a formal Bayesian quantity.
 */
export function evidenceConfidence(parentValues: number[]): number {
  if (parentValues.length === 0) return 0;
  const avgDistance =
    parentValues.reduce((acc, p) => acc + Math.abs(p - 0.5) * 2, 0) / parentValues.length;
  return Math.min(1, Math.max(0, avgDistance));
}

/** Baseline 2-node legacy network (flightRisk, strategyRisk) that every
 * later expansion is layered on top of. */
export const BASE_NETWORK: Record<
  LegacyLatentNodeId,
  NoisyOrNode<LegacyLatentNodeId, ObservableNodeId>
> = {
  flightRisk: {
    id: "flightRisk",
    leak: 0.05,
    prior: 0.15,
    parents: [
      { nodeId: "sentimentDrop", q: 0.6 },
      { nodeId: "compGapSignal", q: 0.5 },
      { nodeId: "peerAttritionSignal", q: 0.45 },
      { nodeId: "cadenceSlip", q: 0.3 },
    ],
  },
  strategyRisk: {
    id: "strategyRisk",
    leak: 0.05,
    prior: 0.15,
    parents: [
      { nodeId: "moralePulse", q: 0.4 },
      { nodeId: "runwayMonths", q: 0.55 },
      { nodeId: "cadenceSlip", q: 0.35 },
    ],
  },
};

/**
 * Runs noisy-OR propagation for every node in `network`, using `likelihoods`
 * (a map of parent-node-id -> probability-in-[0,1], whether that parent is
 * an observable or an already-computed latent posterior injected as
 * soft evidence) as input.
 */
export function updateBeliefs<TId extends string, TParentId extends string>(
  network: Record<string, NoisyOrNode<TId, TParentId>>,
  likelihoods: Record<string, number>,
): Record<TId, NodeMarginal> {
  const result = {} as Record<TId, NodeMarginal>;
  for (const node of Object.values(network) as NoisyOrNode<TId, TParentId>[]) {
    const parentInputs = node.parents.map((parent: CausalParent<TParentId>) => ({
      q: parent.q,
      p: likelihoods[parent.nodeId as unknown as string] ?? node.prior,
    }));
    const p = parentInputs.length > 0 ? noisyOrPosterior(node.leak, parentInputs) : node.prior;
    const confidence = evidenceConfidence(parentInputs.map((pi) => pi.p));
    result[node.id] = { p, confidence };
  }
  return result;
}
