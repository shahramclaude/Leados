// src/lib/bayesianNetwork.ts
//
// BOOTSTRAP NOTE (read before writing — mandatory per task instructions):
// `list_files`/`read_file` against this repository confirmed `src/lib/`
// did not exist prior to this change, so there is no pre-existing
// bayesianNetwork.ts to diff against. Every exported function below is
// therefore newly authored in this PR; the "map every export against its
// callers" exercise the task requires produces an empty caller set for all
// of them until beliefFabric.ts (same PR) imports them — i.e. nothing here
// is orphaned *after* this PR, but nothing could have been orphaned
// *before* it either, because it did not exist.
//
// This file intentionally implements the described BASELINE network only
// (2 latent nodes: flightRisk, strategyRisk; 6 observables). The Part-1
// EXPANSION to 10 latent / 22 observable nodes lives in beliefFabric.ts,
// which imports the primitives below (`noisyOrPosterior`, `updateBeliefs`)
// unchanged, per the task constraint: "the noisy-OR formula must not
// change... Extend, do not rewrite."

import type {
  CausalParent,
  LegacyLatentNodeId,
  LegacyObservableNodeId,
  NodeMarginal,
  NoisyOrNode,
} from "./types";
import { clamp01 } from "./temporal";

// ─────────────────────────────────────────────────────────────────────────
// Core noisy-OR gate
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pearl (1988), "Probabilistic Reasoning in Intelligent Systems", §4.3.2 —
 * the noisy-OR gate:
 *
 *   P(Y=1 | x_1..x_n) = 1 - (1 - leak) * Π_i (1 - q_i)^{x_i}
 *
 * where x_i ∈ {0,1} is the (hard) indicator that parent i is present and
 * q_i is parent i's "causal power" — the probability that parent i alone,
 * if present, would activate Y.
 *
 * Soft / uncertain-evidence generalization (Díez & Druzdzel, 2006,
 * "Canonical Probabilistic Models for Knowledge Engineering", §on noisy-OR
 * with uncertain evidence): when a parent's state is itself a probability
 * p_i instead of a hard 0/1 indicator, substitute p_i for x_i inside the
 * product:
 *
 *   P(Y=1 | e) = 1 - (1 - leak) * Π_i (1 - q_i * p_i)
 *
 * This degenerates exactly to Pearl's hard-evidence formula when every
 * p_i ∈ {0,1}. This is the formula implemented here, and per the task
 * constraint it must not be altered by any later file in this PR — only
 * the node/edge *topology* fed into it is extended.
 */
export function noisyOrPosterior(
  leak: number,
  parents: Array<{ q: number; p: number }>,
): number {
  const product = parents.reduce((acc, parent) => acc * (1 - parent.q * clamp01(parent.p)), 1);
  return clamp01(1 - (1 - leak) * product);
}

/**
 * Confidence heuristic (ORIGINAL DERIVATION, not from a cited source):
 * evidence that sits far from the neutral default (0.2 for observables, see
 * beliefFabric.ts priors) is treated as "informative"; evidence that sits
 * exactly at the neutral default contributes no confidence (we have no
 * signal for that node). Confidence is the mean absolute deviation from
 * neutral (0.2), scaled so a parent at p=1 contributes full confidence.
 * This is a DESIGN PARAMETER heuristic, not a probabilistic quantity.
 */
const NEUTRAL_DEFAULT = 0.2;

export function evidenceConfidence(parentLikelihoods: number[]): number {
  if (parentLikelihoods.length === 0) return 0;
  const maxDeviation = Math.max(NEUTRAL_DEFAULT, 1 - NEUTRAL_DEFAULT);
  const avgDeviation =
    parentLikelihoods.reduce((acc, p) => acc + Math.abs(clamp01(p) - NEUTRAL_DEFAULT), 0) /
    parentLikelihoods.length;
  return clamp01(avgDeviation / maxDeviation);
}

// ─────────────────────────────────────────────────────────────────────────
// Baseline (legacy) 2-latent / 6-observable network
// ─────────────────────────────────────────────────────────────────────────

/**
 * Baseline edge weights (flightRisk, strategyRisk). Every `q` value here is
 * a DESIGN PARAMETER (elicited heuristically for this bootstrap — there was
 * no existing calibrated network to preserve), not an empirically fit
 * causal power.
 */
export const BASE_NETWORK: Record<
  LegacyLatentNodeId,
  NoisyOrNode<LegacyLatentNodeId, LegacyObservableNodeId>
> = {
  flightRisk: {
    id: "flightRisk",
    leak: 0.05,
    prior: 0.15,
    parents: [
      { nodeId: "cadenceSlip", q: 0.5 },
      { nodeId: "moralePulse", q: 0.6 },
      { nodeId: "compGapSignal", q: 0.55 },
      { nodeId: "peerAttritionSignal", q: 0.4 },
    ],
  },
  strategyRisk: {
    id: "strategyRisk",
    leak: 0.05,
    prior: 0.15,
    parents: [
      { nodeId: "runwayMonths", q: 0.6 },
      { nodeId: "sentimentDrop", q: 0.4 },
      { nodeId: "moralePulse", q: 0.3 },
    ],
  },
};

/**
 * Generic belief-update routine: given any noisy-OR network definition and
 * a map of observable-likelihoods (0-1 per observable id), compute the
 * posterior marginal for every latent node in the network. Order-dependent
 * callers (where one latent feeds another, e.g. beliefFabric.ts) must call
 * this incrementally per topological layer and fold prior-layer posteriors
 * into the `likelihoods` map before calling the next layer — this function
 * itself is stateless and order-agnostic for a single layer.
 */
export function updateBeliefs<TId extends string, TParentId extends string>(
  network: Record<TId, NoisyOrNode<TId, TParentId>>,
  likelihoods: Record<string, number>,
): Record<TId, NodeMarginal> {
  const result = {} as Record<TId, NodeMarginal>;
  for (const nodeId of Object.keys(network) as TId[]) {
    const node = network[nodeId];
    const parentInputs = node.parents.map((parent: CausalParent<TParentId>) => ({
      q: parent.q,
      p: likelihoods[parent.nodeId] ?? node.prior,
    }));
    const p = parentInputs.length > 0 ? noisyOrPosterior(node.leak, parentInputs) : node.prior;
    const confidence = evidenceConfidence(parentInputs.map((pi) => pi.p));
    result[nodeId] = { p, confidence };
  }
  return result;
}
