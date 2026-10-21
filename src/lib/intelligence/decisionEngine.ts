/**
 * decisionEngine.ts — expected value, regret, and value of information (VOI).
 *
 * EV(a)     = Σ_s P(s) * U(a,s)
 * Regret(a) = max_a' EV(a') − EV(a)                      (always >= 0)
 * VOI       = E_info[ max_a EV(a|info) ] − max_a EV(a)    (always >= 0 for a
 *             consistent information partition — Blackwell's theorem; see
 *             property tests)
 */

export interface DecisionState {
  id: string;
  label: string;
  /** Marginal probability of this state, must sum to 1 across all states in a decision. */
  probability: number;
}

export interface InformationSignal {
  id: string;
  label: string;
  /** P(signal) */
  probability: number;
  /** P(state | signal) for every state id — must sum to 1. */
  statePosteriors: Record<string, number>;
}

export interface InformationSource {
  id: string;
  label: string;
  cost: number;
  signals: InformationSignal[];
}

export interface PendingDecision {
  id: string;
  title: string;
  description: string;
  actions: { id: string; label: string }[];
  states: DecisionState[];
  /** utilities[actionId][stateId] = payoff */
  utilities: Record<string, Record<string, number>>;
  informationSources: InformationSource[];
  /** Confidence class inherited from the weakest contributing state-probability source. */
  stateConfidenceClass: "observed" | "estimated" | "inferred" | "assumed";
}

export interface DecisionAnalysis {
  decisionId: string;
  ev: Record<string, number>;
  bestActionId: string;
  bestEv: number;
  regret: Record<string, number>;
  voiBySource: { sourceId: string; label: string; cost: number; voi: number; netValue: number }[];
  maxVoi: number;
  highVoiFlag: boolean;
}

const PROB_SUM_TOLERANCE = 1e-6;

function assertProbabilitiesSumToOne(probs: number[], label: string) {
  const sum = probs.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-3) {
    throw new Error(`${label} probabilities must sum to 1 (got ${sum.toFixed(4)})`);
  }
}

export function expectedValue(decision: PendingDecision, actionId: string): number {
  const utilityRow = decision.utilities[actionId];
  if (!utilityRow) throw new Error(`Unknown action ${actionId}`);
  return decision.states.reduce((acc, s) => acc + s.probability * (utilityRow[s.id] ?? 0), 0);
}

export function expectedValueGivenPosteriors(
  decision: PendingDecision,
  actionId: string,
  statePosteriors: Record<string, number>,
): number {
  const utilityRow = decision.utilities[actionId];
  if (!utilityRow) throw new Error(`Unknown action ${actionId}`);
  return decision.states.reduce((acc, s) => acc + (statePosteriors[s.id] ?? 0) * (utilityRow[s.id] ?? 0), 0);
}

export function bestAction(decision: PendingDecision): { actionId: string; ev: number; evByAction: Record<string, number> } {
  const evByAction: Record<string, number> = {};
  let bestId = decision.actions[0]?.id;
  let bestEv = -Infinity;
  for (const a of decision.actions) {
    const ev = expectedValue(decision, a.id);
    evByAction[a.id] = ev;
    if (ev > bestEv) {
      bestEv = ev;
      bestId = a.id;
    }
  }
  return { actionId: bestId, ev: bestEv, evByAction };
}

export function bestActionGivenPosteriors(
  decision: PendingDecision,
  statePosteriors: Record<string, number>,
): { actionId: string; ev: number } {
  let bestId = decision.actions[0]?.id;
  let bestEv = -Infinity;
  for (const a of decision.actions) {
    const ev = expectedValueGivenPosteriors(decision, a.id, statePosteriors);
    if (ev > bestEv) {
      bestEv = ev;
      bestId = a.id;
    }
  }
  return { actionId: bestId, ev: bestEv };
}

export function regret(decision: PendingDecision): Record<string, number> {
  const { evByAction, ev: bestEv } = bestAction(decision);
  const out: Record<string, number> = {};
  for (const a of decision.actions) {
    out[a.id] = Math.max(0, bestEv - evByAction[a.id]);
  }
  return out;
}

/**
 * VOI for one information source: expected best-EV after learning the signal,
 * minus the best EV you could get right now without it. Validates that each
 * signal's posteriors average back out to the prior marginals (a consistency
 * check on the fixture / real data), which is what guarantees VOI >= 0.
 */
export function valueOfInformation(decision: PendingDecision, source: InformationSource): number {
  assertProbabilitiesSumToOne(
    source.signals.map((s) => s.probability),
    `InformationSource ${source.id} signal`,
  );

  // Consistency check: Σ_signal P(signal) * P(s|signal) ≈ P(s) for every state.
  for (const state of decision.states) {
    const implied = source.signals.reduce(
      (acc, sig) => acc + sig.probability * (sig.statePosteriors[state.id] ?? 0),
      0,
    );
    if (Math.abs(implied - state.probability) > 1e-2) {
      throw new Error(
        `InformationSource ${source.id} is inconsistent with prior for state ${state.id}: implied=${implied.toFixed(4)} prior=${state.probability.toFixed(4)}`,
      );
    }
  }

  const { ev: priorBestEv } = bestAction(decision);
  const expectedPosteriorBest = source.signals.reduce((acc, sig) => {
    const { ev } = bestActionGivenPosteriors(decision, sig.statePosteriors);
    return acc + sig.probability * ev;
  }, 0);

  // Floating point can push this a hair below zero; clamp with documentation.
  return Math.max(0, expectedPosteriorBest - priorBestEv);
}

const HIGH_VOI_THRESHOLD_FRACTION = 0.05; // VOI > 5% of |best EV| => "worth surfacing"

export function analyzeDecision(decision: PendingDecision): DecisionAnalysis {
  const { evByAction, actionId: bestActionId, ev: bestEv } = bestAction(decision);
  const regretByAction = regret(decision);
  const voiBySource = decision.informationSources.map((src) => {
    const voi = valueOfInformation(decision, src);
    return {
      sourceId: src.id,
      label: src.label,
      cost: src.cost,
      voi,
      netValue: voi - src.cost,
    };
  });
  voiBySource.sort((a, b) => b.voi - a.voi);
  const maxVoi = voiBySource.length > 0 ? voiBySource[0].voi : 0;
  const threshold = Math.abs(bestEv) * HIGH_VOI_THRESHOLD_FRACTION;
  return {
    decisionId: decision.id,
    ev: evByAction,
    bestActionId,
    bestEv,
    regret: regretByAction,
    voiBySource,
    maxVoi,
    highVoiFlag: maxVoi > threshold && maxVoi > 0,
  };
}

export function rankDecisionsByVoi(decisions: PendingDecision[]): (DecisionAnalysis & { title: string })[] {
  return decisions
    .map((d) => ({ ...analyzeDecision(d), title: d.title }))
    .sort((a, b) => b.maxVoi - a.maxVoi);
}
