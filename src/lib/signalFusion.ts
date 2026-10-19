// src/lib/signalFusion.ts
//
// Converts raw events into the 22 observable-node likelihoods the belief
// fabric needs, plus a simple domain-level signal fusion used by the
// narrative layer. Pure functions — no DB access.

import type { LeadosEvent, LeadosMetrics, LeadosPerson, ObservableNodeId } from "./types";
import { OBSERVABLE_NODES } from "./types";
import { daysBetween } from "./temporal";

/** Neutral default used when an observable has no supporting event data.
 * Kept in sync with beliefFabric.NEW_OBSERVABLE_PRIOR intentionally. */
export const NEUTRAL_DEFAULT = 0.2;

/** Maps each observable node to the event-type substrings that count as
 * evidence for it. DESIGN PARAMETER — mapping chosen to give every
 * observable at least one plausible event source. */
export const OBSERVABLE_EVENT_TYPES: Record<ObservableNodeId, string[]> = {
  cadenceSlip: ["one_on_one.missed", "cadence.slip"],
  moralePulse: ["pulse.negative", "sentiment.negative"],
  runwayMonths: ["finance.runway_drop"],
  compGapSignal: ["comp.flag", "compensation_flag"],
  peerAttritionSignal: ["attrition.peer_departure"],
  sentimentDrop: ["sentiment.negative", "negative_sentiment"],
  actionItemSlipRate: ["decision.action_item.overdue"],
  decisionCycleBloom: ["decision.cycle_time.elevated"],
  budgetDeviationPct: ["finance.budget_deviation"],
  techDebtVelocity: ["eng.tech_debt.flag"],
  onboardingCohortDrop: ["onboarding.cohort_drop"],
  conflictFrequency: ["culture.conflict"],
  meetingLoadIndex: ["calendar.overload"],
  knowledgeSiloIndex: ["knowledge.silo_flag"],
  retrospectiveHealth: ["retro.negative"],
  deliveryConfidenceDrop: ["project.confidence_drop"],
  boardSentiment: ["board.sentiment_negative"],
  talentBenchDepth: ["succession.gap"],
  successionGapCount: ["succession.gap"],
  psychologicalSafetyIndex: ["culture.psych_safety_low"],
  regulatoryFlagRate: ["regulatory.flag"],
  customerNPSDrift: ["nps.drop"],
};

const HALF_LIFE_DAYS = 14;

function recencyWeight(occurredAt: Date | string, now: Date): number {
  const age = Math.max(0, daysBetween(occurredAt, now));
  return Math.pow(0.5, age / HALF_LIFE_DAYS);
}

/** Counts events matching an observable's event types within the last
 * `days` days (used both for scoring and for uncertainty/confidence
 * reporting — "do we have >= 3 events in the last 30 days"). */
export function countRecentEventsForObservable(
  events: LeadosEvent[],
  observable: ObservableNodeId,
  now: Date,
  days = 30,
): number {
  const types = OBSERVABLE_EVENT_TYPES[observable];
  return events.filter(
    (e) => types.some((t) => e.type.includes(t)) && daysBetween(e.occurredAt, now) <= days,
  ).length;
}

export function computeObservableLikelihoods(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
  now: Date,
): Record<ObservableNodeId, number> {
  void people;
  void metrics;
  const result = {} as Record<ObservableNodeId, number>;

  for (const obs of OBSERVABLE_NODES) {
    const types = OBSERVABLE_EVENT_TYPES[obs];
    const matching = events.filter((e) => types.some((t) => e.type.includes(t)));
    if (matching.length === 0) {
      result[obs] = NEUTRAL_DEFAULT;
      continue;
    }
    const weighted = matching.reduce((acc, e) => {
      const w = (e.weight ?? 1) * recencyWeight(e.occurredAt, now);
      return acc + w;
    }, 0);
    // Saturating scale: 5 weighted "points" ~= fully-elevated signal.
    const score = 1 - Math.exp(-weighted / 5);
    result[obs] = Math.min(1, Math.max(0, score));
  }

  return result;
}

/** Lightweight domain-level fusion used for narrative text — a simple
 * recency-weighted count of events per domain, normalized to [0,1]. */
export function fuseSignals(events: LeadosEvent[], now: Date): Record<string, number> {
  const byDomain: Record<string, number> = {};
  for (const e of events) {
    const domain = e.domain ?? "general";
    const w = (e.weight ?? 1) * recencyWeight(e.occurredAt, now);
    byDomain[domain] = (byDomain[domain] ?? 0) + w;
  }
  const max = Math.max(1, ...Object.values(byDomain));
  const fused: Record<string, number> = {};
  for (const [domain, value] of Object.entries(byDomain)) {
    fused[domain] = Math.min(1, value / max);
  }
  return fused;
}
