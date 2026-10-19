// src/lib/beliefFabric.ts
//
// Part 1 deliverable: the extended (10 latent / 22 observable) belief
// network. Builds topology on top of bayesianNetwork.ts's noisy-OR engine.

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

export const NEW_LATENT_PRIORS: Record<
  | "burnoutRisk"
  | "executionRisk"
  | "cultureRisk"
  | "financialRisk"
  | "innovationStall"
  | "decisionParalysis"
  | "cascadeRisk"
  | "leadershipEnergyDepletion",
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

export const NEW_OBSERVABLE_PRIOR = 0.2;

type ObsOnlyNode = NoisyOrNode<string, ObservableNodeId>;

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

function buildLeadershipEnergyDepletionNode(): ObsOnlyNode {
  return {
    id: "leadershipEnergyDepletion",
    leak: 0.05,
    prior: NEW_LATENT_PRIORS.leadershipEnergyDepletion,
    parents: [
      { nodeId: "meetingLoadIndex", q: 0.5 },
      { nodeId: "burnoutRisk" as ObservableNodeId, q: 0.7 },
      { nodeId: "decisionCycleBloom", q: 0.3 },
      { nodeId: "moralePulse", q: 0.45 },
    ],
  };
}

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

function dominantRiskNarrative(nodeId: LatentNodeId, marginal: NodeMarginal): string {
  const pct = Math.round(marginal.p * 100);
  const confidencePct = Math.round(marginal.confidence * 100);
  return `${nodeId} is the dominant primary risk at p=${pct}% (confidence ${confidencePct}%).`;
}

export function runBeliefFabric(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
  now: Date,
): BeliefFabricResult {
  const observables = computeObservableLikelihoods(events, people, metrics, now);

  const layerAPosteriors = updateBeliefs(LAYER_A_NETWORK, observables);

  const layerBLikelihoods: Record<string, number> = {
    ...observables,
    burnoutRisk: layerAPosteriors.burnoutRisk.p,
  };
  const leadershipNode = buildLeadershipEnergyDepletionNode();
  const layerBPosteriors = updateBeliefs(
    { leadershipEnergyDepletion: leadershipNode },
    layerBLikelihoods,
  );

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

  const cascadeRisk = computeCascadeRisk(primaryPosteriors);

  const posteriors = {
    ...primaryPosteriors,
    cascadeRisk,
  } as Record<LatentNodeId, NodeMarginal>;

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

/** Observable parents feeding each PRIMARY latent node (excluding
 * cascadeRisk, which aggregates latents rather than observables directly).
 * Used by agentCore's uncertainty-flagging step to recommend which signal
 * type to collect more of. */
export const LATENT_NODE_OBSERVABLES: Record<Exclude<LatentNodeId, "cascadeRisk">, ObservableNodeId[]> = {
  flightRisk: ["sentimentDrop", "compGapSignal", "peerAttritionSignal", "cadenceSlip"],
  strategyRisk: ["moralePulse", "runwayMonths", "cadenceSlip"],
  burnoutRisk: ["cadenceSlip", "moralePulse", "meetingLoadIndex", "actionItemSlipRate"],
  executionRisk: ["actionItemSlipRate", "deliveryConfidenceDrop", "techDebtVelocity", "decisionCycleBloom"],
  cultureRisk: ["conflictFrequency", "psychologicalSafetyIndex", "retrospectiveHealth", "onboardingCohortDrop"],
  financialRisk: ["runwayMonths", "budgetDeviationPct", "boardSentiment"],
  innovationStall: ["knowledgeSiloIndex", "techDebtVelocity", "talentBenchDepth"],
  decisionParalysis: ["decisionCycleBloom", "conflictFrequency"],
  leadershipEnergyDepletion: ["meetingLoadIndex", "decisionCycleBloom", "moralePulse"],
};

export { LAYER_A_IDS, CASCADE_PARENT_ORDER };
