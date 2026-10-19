// Bayesian hypothesis tracking used by the inference/strategic-reasoning view.
// Each hypothesis carries a prior and a posterior that gets updated whenever
// new evidence (events) arrives, using an odds-ratio (likelihood-ratio) update
// rather than a raw probability average, which keeps updates well-calibrated.

import type { HypothesisRow, LeadosEvent } from "./types";
import { toNumber } from "./types";

export interface HypothesisUpdate {
  id: string;
  statement: string;
  prior: number;
  posterior: number;
  delta: number;
  supportingEvents: number;
}

function oddsOf(p: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return clamped / (1 - clamped);
}

function probabilityFromOdds(odds: number): number {
  return odds / (1 + odds);
}

/**
 * Update a hypothesis' posterior using recent events as evidence. Evidence
 * with higher severity contributes a larger likelihood ratio. This is a
 * simplified Bayesian update: posterior_odds = prior_odds * product(LR_i).
 */
export function updateHypothesis(
  hypothesis: HypothesisRow,
  events: LeadosEvent[],
  now: Date,
): HypothesisUpdate {
  const statementWords = hypothesis.statement.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const cutoff = now.getTime() - 30 * 24 * 3_600_000;

  const supporting = events.filter((e) => {
    const created = new Date(e.createdAt ?? now).getTime();
    if (created < cutoff) return false;
    const haystack = `${e.type} ${JSON.stringify(e.payload ?? {})}`.toLowerCase();
    return statementWords.some((w) => haystack.includes(w));
  });

  const prior = toNumber(hypothesis.priorProbability, 0.5);
  let odds = oddsOf(prior);
  for (const e of supporting) {
    const likelihoodRatio = 1 + e.severity / 5; // stronger evidence => bigger pull
    odds *= likelihoodRatio;
  }

  const posterior = probabilityFromOdds(odds);

  return {
    id: hypothesis.id,
    statement: hypothesis.statement,
    prior,
    posterior,
    delta: posterior - prior,
    supportingEvents: supporting.length,
  };
}

export function updateAllHypotheses(
  hypotheses: HypothesisRow[],
  events: LeadosEvent[],
  now: Date,
): HypothesisUpdate[] {
  return hypotheses.map((h) => updateHypothesis(h, events, now));
}
