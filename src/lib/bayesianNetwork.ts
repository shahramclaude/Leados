// ─────────────────────────────────────────────────────────────────────────
// Bayesian Belief Network
//
// A small DAG over observable signals (leaves) and two latent risk nodes
// (flightRisk, strategyRisk). Two pieces of probability theory are composed
// here, both cited inline where used:
//
//  1. Bayes' rule in odds form — used to turn each observable's raw
//     evidence into a posterior P(node = elevated):
//       O(H|E) = O(H) * LR(E)              [odds-likelihood form of Bayes'
//                                            theorem; see e.g. Jeffrey, R.
//                                            (1965) "The Logic of Decision"]
//       O(H) = P(H) / (1 - P(H))
//       P(H|E) = O(H|E) / (1 + O(H|E))
//
//  2. The noisy-OR gate — used to combine several parent (observable)
//     nodes into one latent node, generalized to soft (probabilistic)
//     parent evidence instead of boolean evidence:
//       P(Y=1 | x_1..x_n) = 1 - (1 - leak) * Π_i (1 - q_i * x_i)
//     where leak = P(Y=1 | all parents inactive) (the latent node's own
//     prior), q_i = the "causal power" of parent i (probability that
//     parent i alone, if fully active, would flip Y to 1), and x_i is the
//     parent's own posterior probability of being active.
//     [Pearl, J. (1988). "Probabilistic Reasoning in Intelligent Systems",
//      §4.3.2; Díez & Druzdzel (2006), "Canonical Probabilistic Models for
//      Knowledge Engineering" — soft/uncertain-evidence generalization.]
// ─────────────────────────────────────────────────────────────────────────

import { clamp, daysBetween, recencyWeight } from "./temporal";
import type {
  BeliefNetworkPosteriors,
  BeliefNetworkPriors,
  LatentNodeId,
  LeadosEvent,
  NodeId,
  NodeMarginal,
  ObservableNodeId,
  PersonId,
} from "./types";

const HALF_LIFE_DAYS = 14;

/** Edges of the DAG: latent node -> its observable parents. */
export const NETWORK_EDGES: Record<LatentNodeId, ObservableNodeId[]> = {
  flightRisk: ["cadenceSlip", "moralePulse", "flightRiskFlag"],
  strategyRisk: ["runwayMonths", "decisionBacklogAge", "pipelineCoverage"],
};

/**
 * Default priors: P(node = elevated) with zero evidence. For latent nodes
 * this doubles as the noisy-OR "leak" term (background risk unexplained by
 * any modeled parent). These are explicit, labeled design parameters — not
 * fit from historical outcomes, since none are available in this sandbox.
 */
export const DEFAULT_PRIORS: BeliefNetworkPriors = {
  cadenceSlip: 0.2,
  moralePulse: 0.25,
  flightRiskFlag: 0.1,
  decisionBacklogAge: 0.2,
  pipelineCoverage: 0.3,
  runwayMonths: 0.2,
  flightRisk: 0.15,
  strategyRisk: 0.15,
};

/** Noisy-OR causal power q_i of each parent -> latent edge. */
const CAUSAL_POWER: Record<LatentNodeId, Record<ObservableNodeId, number>> = {
  flightRisk: {
    cadenceSlip: 0.45,
    moralePulse: 0.6,
    flightRiskFlag: 0.8,
    decisionBacklogAge: 0,
    pipelineCoverage: 0,
    runwayMonths: 0,
  },
  strategyRisk: {
    runwayMonths: 0.65,
    decisionBacklogAge: 0.4,
    pipelineCoverage: 0.5,
    cadenceSlip: 0,
    moralePulse: 0,
    flightRiskFlag: 0,
  },
};

/** The maximum likelihood ratio a fully-saturated raw signal can produce. */
const MAX_LIKELIHOOD_RATIO = 9;

export interface UpdateBeliefsOptions {
  /** Scope person-level observables (cadenceSlip, moralePulse, flightRiskFlag) to one person. */
  personId?: PersonId;
  now?: Date;
}

interface RawEvidence {
  /** Evidence strength in [0, 1] derived deterministically from events. */
  strength: number;
  /** Count of relevant events backing the estimate (evidence volume). */
  dataPoints: number;
  /** Age in days of the freshest relevant event, or null if none found. */
  freshestAgeDays: number | null;
}

function emptyEvidence(): RawEvidence {
  return { strength: 0, dataPoints: 0, freshestAgeDays: null };
}

function personScopedEvents(events: LeadosEvent[], personId: PersonId | undefined, type: string): LeadosEvent[] {
  return events.filter((e) => e.type === type && (personId === undefined || e.personId === personId));
}

function numberField(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// ── Raw evidence extraction per observable node ───────────────────────────

function evidenceForCadenceSlip(events: LeadosEvent[], personId: PersonId | undefined, now: Date): RawEvidence {
  const logs = personScopedEvents(events, personId, "people.oneonone.logged").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  if (logs.length === 0) return emptyEvidence();
  const ageDays = daysBetween(logs[0].occurredAt, now);
  // Target cadence is 14 days; risk ramps from 0 at 14d to 1 at 35d overdue.
  const strength = clamp((ageDays - 14) / 21, 0, 1);
  return { strength, dataPoints: logs.length, freshestAgeDays: ageDays };
}

function evidenceForMoralePulse(events: LeadosEvent[], personId: PersonId | undefined, now: Date): RawEvidence {
  const pulses = personScopedEvents(events, personId, "people.pulse.logged").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  if (pulses.length === 0) return emptyEvidence();
  const recent = pulses.slice(0, 3);
  const avgMood = recent.reduce((sum, e) => sum + numberField(e.data, "mood", 3), 0) / recent.length;
  // Mood is on a 1 (worst) - 5 (best) scale; map to risk strength in [0,1].
  let strength = clamp((5 - avgMood) / 4, 0, 1);
  if (recent.length >= 3) {
    const moods = recent.map((e) => numberField(e.data, "mood", 3));
    const declining = moods[0] < moods[1] && moods[1] < moods[2];
    if (declining) strength = clamp(strength + 0.2, 0, 1);
  }
  return { strength, dataPoints: pulses.length, freshestAgeDays: daysBetween(pulses[0].occurredAt, now) };
}

function evidenceForFlightRiskFlag(events: LeadosEvent[], personId: PersonId | undefined, now: Date): RawEvidence {
  const flags = personScopedEvents(events, personId, "hr.flightrisk.flag").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  if (flags.length === 0) return emptyEvidence();
  const ageDays = daysBetween(flags[0].occurredAt, now);
  const strength = recencyWeight(ageDays, 30);
  return { strength, dataPoints: flags.length, freshestAgeDays: ageDays };
}

function evidenceForDecisionBacklogAge(events: LeadosEvent[], now: Date): RawEvidence {
  const opened = events.filter((e) => e.type === "decision.logged");
  const resolved = new Set(
    events.filter((e) => e.type === "decision.resolved").map((e) => String(e.data.decisionId ?? e.id)),
  );
  const open = opened.filter((e) => !resolved.has(String(e.data.decisionId ?? e.id)));
  if (open.length === 0) return emptyEvidence();
  const ages = open.map((e) => daysBetween(e.occurredAt, now));
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  const strength = clamp((avgAge - 7) / 21, 0, 1);
  return { strength, dataPoints: open.length, freshestAgeDays: Math.min(...ages) };
}

function evidenceForPipelineCoverage(events: LeadosEvent[], now: Date): RawEvidence {
  const snaps = events
    .filter((e) => e.type === "sales.pipeline.snapshot")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (snaps.length === 0) return emptyEvidence();
  const coverageX = numberField(snaps[0].data, "coverageX", 3);
  // Healthy coverage is >= 3x quota; risk ramps up as coverage falls toward 0.
  const strength = clamp((3 - coverageX) / 3, 0, 1);
  return { strength, dataPoints: snaps.length, freshestAgeDays: daysBetween(snaps[0].occurredAt, now) };
}

function evidenceForRunwayMonths(events: LeadosEvent[], now: Date): RawEvidence {
  const snaps = events
    .filter((e) => e.type === "fin.runway.snapshot")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (snaps.length === 0) return emptyEvidence();
  const months = numberField(snaps[0].data, "months", 18);
  // Healthy runway is >= 18 months; risk saturates by ~3 months.
  const strength = clamp((18 - months) / 15, 0, 1);
  return { strength, dataPoints: snaps.length, freshestAgeDays: daysBetween(snaps[0].occurredAt, now) };
}

function evidenceFor(node: ObservableNodeId, events: LeadosEvent[], options: UpdateBeliefsOptions): RawEvidence {
  const now = options.now ?? new Date();
  switch (node) {
    case "cadenceSlip":
      return evidenceForCadenceSlip(events, options.personId, now);
    case "moralePulse":
      return evidenceForMoralePulse(events, options.personId, now);
    case "flightRiskFlag":
      return evidenceForFlightRiskFlag(events, options.personId, now);
    case "decisionBacklogAge":
      return evidenceForDecisionBacklogAge(events, now);
    case "pipelineCoverage":
      return evidenceForPipelineCoverage(events, now);
    case "runwayMonths":
      return evidenceForRunwayMonths(events, now);
    default:
      return emptyEvidence();
  }
}

/** Step 1: Bayes' rule (odds form) turns raw evidence strength into a posterior. */
function bayesUpdateObservable(prior: number, evidence: RawEvidence): NodeMarginal {
  if (evidence.dataPoints === 0) {
    // No evidence at all: fall back to the prior with low confidence.
    return { p: prior, confidence: 0.2 };
  }
  const likelihoodRatio = 1 + evidence.strength * (MAX_LIKELIHOOD_RATIO - 1);
  const priorOdds = prior / (1 - prior);
  const posteriorOdds = priorOdds * likelihoodRatio;
  const posterior = posteriorOdds / (1 + posteriorOdds);

  const volumeConfidence = clamp(0.5 + 0.1 * Math.min(evidence.dataPoints, 5), 0, 0.95);
  const recency = evidence.freshestAgeDays === null ? 1 : recencyWeight(evidence.freshestAgeDays, HALF_LIFE_DAYS);
  const confidence = clamp(volumeConfidence * recency, 0.1, 0.95);

  return { p: clamp(posterior, 0, 1), confidence };
}

/** Step 2: noisy-OR gate combines parent posteriors into the latent node's posterior. */
function noisyOrUpdateLatent(
  latent: LatentNodeId,
  leak: number,
  parentMarginals: Record<ObservableNodeId, NodeMarginal>,
): NodeMarginal {
  const parents = NETWORK_EDGES[latent];
  let product = 1;
  let weightedConfidence = 0;
  let totalWeight = 0;

  for (const parent of parents) {
    const q = CAUSAL_POWER[latent][parent];
    if (q <= 0) continue;
    const marginal = parentMarginals[parent];
    product *= 1 - q * marginal.p;
    weightedConfidence += q * marginal.confidence;
    totalWeight += q;
  }

  const p = clamp(1 - (1 - leak) * product, 0, 1);
  const confidence = totalWeight > 0 ? clamp(weightedConfidence / totalWeight, 0, 0.95) : 0.3;
  return { p, confidence };
}

/**
 * Propagate new events through the network and return the full posterior
 * set for every node (observable + latent).
 */
export function updateBeliefs(
  events: LeadosEvent[],
  priors: BeliefNetworkPriors = DEFAULT_PRIORS,
  options: UpdateBeliefsOptions = {},
): BeliefNetworkPosteriors {
  const observableIds: ObservableNodeId[] = [
    "cadenceSlip",
    "moralePulse",
    "flightRiskFlag",
    "decisionBacklogAge",
    "pipelineCoverage",
    "runwayMonths",
  ];

  const observablePosteriors = {} as Record<ObservableNodeId, NodeMarginal>;
  for (const node of observableIds) {
    const evidence = evidenceFor(node, events, options);
    observablePosteriors[node] = bayesUpdateObservable(priors[node], evidence);
  }

  const flightRisk = noisyOrUpdateLatent("flightRisk", priors.flightRisk, observablePosteriors);
  const strategyRisk = noisyOrUpdateLatent("strategyRisk", priors.strategyRisk, observablePosteriors);

  return { ...observablePosteriors, flightRisk, strategyRisk };
}

/** Read a single node's marginal out of a previously computed posterior set. */
export function getMarginals(posteriors: BeliefNetworkPosteriors, node: NodeId): NodeMarginal {
  return posteriors[node] ?? { p: DEFAULT_PRIORS[node], confidence: 0 };
}
