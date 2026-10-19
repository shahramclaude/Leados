// src/lib/beliefFabric.ts
//
// Part 1 deliverable: the extended (10 latent / 22 observable) belief
// network. Imports `noisyOrPosterior`/`updateBeliefs` from
// bayesianNetwork.ts UNCHANGED (see constraint in task + comment in that
// file) and only adds topology on top.

import type {
  BeliefFabricResult,
  LatentNodeId,
  LeadosEvent,
  LeadosMetrics,
  LeadosPerson,
  NodeMarginal,
  NoisyOrNode,
  ObservableNodeId,
} from "./types";
import { BASE_NETWORK, noisyOrPosterior, updateBeliefs, evidenceConfidence } from "./bayesianNetwork";
import { computeObservableLikelihoods } from "./signalFusion";

// ─────────────────────────────────────────────────────────────────────────
// New latent-node priors (task spec, section "NEW PRIORS")
// ─────────────────────────────────────────────────────────────────────────

export const NEW_LATENT_PRIORS: Record<
  "burnoutRisk" | "executionRisk" | "cultureRisk" | "financialRisk" | "innovationStall" | "decisionParalysis" | "cascadeRisk" | "leadershipEnergyDepletion",
  number
> = {
  burnoutRisk: 0.2,
  executionRisk: 0.2,
  cultureRisk: 0.15,
  financialRisk: 0.2,
  innovationStall: 0.25,
  decisionParalysis: 0.15,
  cascadeRisk: 0.1,
  leadershipEnergyDepletion: 0.2,
};

/** All new observables default prior 0.2 (task spec). Used by
 * signalFusion.computeObservableLikelihoods as the neutral default when a
 * node has no supporting event data (see NEUTRAL_DEFAULT there, kept in
 * sync intentionally).
 */
export const NEW_OBSERVABLE_PRIOR = 0.2;

// ─────────────────────────────────────────────────────────────────────────
// Extended network topology — all `q` values are DESIGN PARAMETERS taken
// verbatim from the task specification's "EDGE ADDITIONS" section.
// ─────────────────────────────────────────────────────────────────────────

type ObsOnlyNode = NoisyOrNode<string, ObservableNodeId>;

/** Layer A: latent nodes whose parents are purely observable nodes. These
 * can all be computed in a single `updateBeliefs` pass together with the
 * legacy network.
 */
const LAYER_A_NETWORK: Record<string, ObsOnlyNode> = {
  ...BASE_NETWORK,
  burnoutRisk: {
    id: "burnoutRisk",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.burnoutRisk,
    parents: [
      { nodeId: "cadenceSlip", q: 0.4 },
      { nodeId: "moralePulse", q: 0.65 },
      { nodeId: "meetingLoadIndex", q: 0.5 },
      { nodeId: "actionItemSlipRate", q: 0.3 },
    ],
  },
  executionRisk: {
    id: "executionRisk",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.executionRisk,
    parents: [
      { nodeId: "actionItemSlipRate", q: 0.55 },
      { nodeId: "deliveryConfidenceDrop", q: 0.7 },
      { nodeId: "techDebtVelocity", q: 0.35 },
      { nodeId: "decisionCycleBloom", q: 0.45 },
    ],
  },
  cultureRisk: {
    id: "cultureRisk",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.cultureRisk,
    parents: [
      { nodeId: "conflictFrequency", q: 0.6 },
      { nodeId: "psychologicalSafetyIndex", q: 0.7 },
      { nodeId: "retrospectiveHealth", q: 0.35 },
      { nodeId: "onboardingCohortDrop", q: 0.4 },
    ],
  },
  financialRisk: {
    id: "financialRisk",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.financialRisk,
    parents: [
      { nodeId: "runwayMonths", q: 0.7 },
      { nodeId: "budgetDeviationPct", q: 0.45 },
      { nodeId: "boardSentiment", q: 0.3 },
    ],
  },
  innovationStall: {
    id: "innovationStall",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.innovationStall,
    parents: [
      { nodeId: "knowledgeSiloIndex", q: 0.5 },
      { nodeId: "techDebtVelocity", q: 0.4 },
      { nodeId: "talentBenchDepth", q: 0.35 },
    ],
  },
};

const LAYER_A_IDS = Object.keys(LAYER_A_NETWORK) as LatentNodeId[];

/** Layer B: leadershipEnergyDepletion — depends on observables PLUS the
 * Layer-A posterior of `burnoutRisk` (a latent feeding a latent). Per
 * Díez & Druzdzel's soft-evidence generalization, the parent latent's
 * posterior probability is used directly as the soft-evidence input `p_i`
 * to the same noisy-OR gate (no formula change — see bayesianNetwork.ts).
 */
function buildLeadershipEnergyDepletionNode(): ObsOnlyNode {
  return {
    id: "leadershipEnergyDepletion",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.leadershipEnergyDepletion,
    parents: [
      { nodeId: "meetingLoadIndex", q: 0.5 },
      // burnoutRisk posterior injected as a synthetic "observable" entry in
      // the likelihoods map at call time (key: "burnoutRisk").
      { nodeId: "burnoutRisk" as ObservableNodeId, q: 0.7 },
      { nodeId: "decisionCycleBloom", q: 0.3 },
      { nodeId: "moralePulse", q: 0.45 },
    ],
  };
}

/** Layer C: decisionParalysis — depends on observables PLUS the Layer-B
 * posterior of leadershipEnergyDepletion.
 */
function buildDecisionParalysisNode(): ObsOnlyNode {
  return {
    id: "decisionParalysis",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.decisionParalysis,
    parents: [
      { nodeId: "decisionCycleBloom", q: 0.7 },
      { nodeId: "conflictFrequency", q: 0.35 },
      { nodeId: "leadershipEnergyDepletion" as ObservableNodeId, q: 0.45 },
    ],
  };
}

/** cascadeRisk second-order aggregation order + causal power weights, taken
 * verbatim from the task spec ("flightRisk first"). All weights are DESIGN
 * PARAMETERS specified by the task, leak = 0.05.
 */
const CASCADE_PARENT_ORDER: Exclude<LatentNodeId, "cascadeRisk">[] = [
  "flightRisk",
  "burnoutRisk",
  "strategyRisk",
  "executionRisk",
  "cultureRisk",
  "financialRisk",
  "innovationStall",
  "decisionParalysis",
  "leadershipEnergyDepletion",
];
const CASCADE_WEIGHTS = [0.3, 0.4, 0.5, 0.45, 0.5, 0.5, 0.3, 0.6, 0.5];
const CASCADE_LEAK = 0.05;

export function computeCascadeRisk(
  latentPosteriors: Record<Exclude<LatentNodeId, "cascadeRisk">, NodeMarginal>,
): NodeMarginal {
  const parentInputs = CASCADE_PARENT_ORDER.map((nodeId, i) => ({
    q: CASCADE_WEIGHTS[i],
    p: latentPosteriors[nodeId].p,
  }));
  const p = noisyOrPosterior(CASCADE_LEAK, parentInputs);
  const confidence = evidenceConfidence(parentInputs.map((pi) => pi.p));
  return { p, confidence };
}

// ─────────────────────────────────────────────────────────────────────────
// Belief revision pipeline
// ─────────────────────────────────────────────────────────────────────────

function dominantRiskNarrative(nodeId: LatentNodeId, marginal: NodeMarginal): string {
  const pct = Math.round(marginal.p * 100);
  const confidencePct = Math.round(marginal.confidence * 100);
  return `${nodeId} is the dominant primary risk at p=${pct}% (confidence ${confidencePct}%).`;
}

/**
 * Step 1: computeObservableLikelihoods → Record<ObsNodeId, p>
 * Step 2: updateBeliefs with all 22 observables, in topological layers
 *         (Layer A: obs-only, Layer B: leadershipEnergyDepletion depends on
 *         burnoutRisk posterior, Layer C: decisionParalysis depends on
 *         leadershipEnergyDepletion posterior)
 * Step 3: computeCascadeRisk from the 9 primary latent posteriors
 * Step 4: Return BeliefFabricResult
 */
export function runBeliefFabric(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
  now: Date,
): BeliefFabricResult {
  // Step 1
  const observables = computeObservableLikelihoods(events, people, metrics, now);

  // Step 2a — Layer A (legacy network + 5 obs-only new latents)
  const layerAPosteriors = updateBeliefs(LAYER_A_NETWORK, observables);

  // Step 2b — Layer B (leadershipEnergyDepletion, soft-evidence from burnoutRisk)
  const layerBLikelihoods: Record<string, number> = {
    ...observables,
    burnoutRisk: layerAPosteriors.burnoutRisk.p,
  };
  const leadershipNode = buildLeadershipEnergyDepletionNode();
  const layerBPosteriors = updateBeliefs(
    { leadershipEnergyDepletion: leadershipNode },
    layerBLikelihoods,
  );

  // Step 2c — Layer C (decisionParalysis, soft-evidence from leadershipEnergyDepletion)
  const layerCLikelihoods: Record<string, number> = {
    ...observables,
    leadershipEnergyDepletion: layerBPosteriors.leadershipEnergyDepletion.p,
  };
  const decisionParalysisNode = buildDecisionParalysisNode();
  const layerCPosteriors = updateBeliefs(
    { decisionParalysis: decisionParalysisNode },
    layerCLikelihoods,
  );

  const primaryPosteriors = {
    ...layerAPosteriors,
    ...layerBPosteriors,
    ...layerCPosteriors,
  } as Record<Exclude<LatentNodeId, "cascadeRisk">, NodeMarginal>;

  // Step 3
  const cascadeRisk = computeCascadeRisk(primaryPosteriors);

  const posteriors = {
    ...primaryPosteriors,
    cascadeRisk,
  } as Record<LatentNodeId, NodeMarginal>;

  // Dominant risk = argmax over the 9 PRIMARY latents (cascadeRisk is an
  // aggregate "meta" signal, not a primary driver — DESIGN DECISION, see
  // task framing of cascadeRisk as "the system's master risk aggregator"
  // rather than a root cause in its own right).
  let dominantRisk: LatentNodeId = CASCADE_PARENT_ORDER[0];
  for (const nodeId of CASCADE_PARENT_ORDER) {
    if (primaryPosteriors[nodeId].p > primaryPosteriors[dominantRisk as typeof nodeId].p) {
      dominantRisk = nodeId;
    }
  }

  return {
    posteriors,
    observables,
    cascadeRisk,
    dominantRisk,
    dominantRiskDetail: dominantRiskNarrative(dominantRisk, posteriors[dominantRisk]),
    generatedAt: now.toISOString(),
  };
}

export { LAYER_A_IDS };
