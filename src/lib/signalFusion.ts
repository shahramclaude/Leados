// ─────────────────────────────────────────────────────────────────────────
// Multi-signal fusion
//
// Converts the raw event log across all 5 domains into a single
// OrganizationalHealthScore. Each event is first mapped to a 0-100 "domain
// health contribution", then combined into a per-domain score using a
// weighted average where the weight of an event is:
//
//   weight(event) = recencyWeight(ageDays, 14) * reliability[domain]
//
// recencyWeight is the standard half-life exponential decay (see
// src/lib/temporal.ts: w(t) = 0.5 ^ (t / halfLife), half-life = 14 days per
// the product spec). reliability[domain] is a configurable per-domain
// source-trust multiplier (finance/metrics data is audited and therefore
// weighted higher than self-reported pulse data, for example).
//
// The composite score is the reliability-and-recency-weighted average of
// the per-domain scores (domains with more, fresher, more reliable data
// pull the composite more strongly toward their value).
// ─────────────────────────────────────────────────────────────────────────

import { clamp, daysBetween, recencyWeight, round } from "./temporal";
import type { Domain, DomainWeights, LeadosEvent, OrgHealthScore } from "./types";

const HALF_LIFE_DAYS = 14;
const NEUTRAL_SCORE = 50;
/** Weight-sum at which we consider a domain "fully observed" for confidence purposes. */
const FULL_CONFIDENCE_WEIGHT = 5;

export const DOMAINS: Domain[] = ["people", "finance", "sales", "ops", "strategy"];

/** Default per-domain source reliability multipliers (configurable). */
export const DEFAULT_DOMAIN_RELIABILITY: DomainWeights = {
  people: 0.85, // largely self-reported (pulses, 1:1 notes)
  finance: 1.0, // audited figures
  sales: 0.9, // CRM-derived, generally reliable
  ops: 0.8, // incident reporting has gaps
  strategy: 0.75, // qualitative, judgment-heavy
};

function numberField(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Map a single event to its domain health contribution in [0, 100]
 * (100 = healthy, 0 = unhealthy). This is the "sensor model" for fusion:
 * every event type has an explicit, documented mapping to a health value.
 */
export function scoreEvent(event: LeadosEvent): number {
  switch (event.type) {
    case "people.pulse.logged":
      return clamp((numberField(event.data, "mood", 3) / 5) * 100, 0, 100);
    case "people.oneonone.logged":
      return 90;
    case "people.feedback.logged":
      return 80;
    case "people.comp.reviewed":
      return clamp(100 - numberField(event.data, "gapPct", 0) * 2, 0, 100);
    case "hr.flightrisk.flag":
      return 30;
    case "hr.attrition":
      return 10;
    case "engagement.decline":
      return 20;
    case "decision.logged":
      return 70;
    case "decision.resolved":
      return 85;
    case "decision.escalate":
      return 25;
    case "ops.incident":
      return 10;
    case "sales.pipeline.snapshot":
      return clamp((numberField(event.data, "coverageX", 3) / 4) * 100, 0, 100);
    case "pipeline.thin":
      return 15;
    case "fin.runway.snapshot":
      return clamp((numberField(event.data, "months", 18) / 24) * 100, 0, 100);
    case "fin.runway.drop":
      return 15;
    case "fin.pl.logged":
      return clamp(50 + numberField(event.data, "netMarginPct", 0) * 2, 0, 100);
    case "strategy.okr.review":
      return clamp(numberField(event.data, "onTrackPct", 70), 0, 100);
    default:
      return NEUTRAL_SCORE;
  }
}

interface DomainAccumulator {
  weightedSum: number;
  weightTotal: number;
}

function computeBreakdown(
  events: LeadosEvent[],
  reliability: DomainWeights,
  asOf: Date,
): { breakdown: Record<Domain, number>; domainWeight: Record<Domain, number> } {
  const acc: Record<Domain, DomainAccumulator> = {
    people: { weightedSum: 0, weightTotal: 0 },
    finance: { weightedSum: 0, weightTotal: 0 },
    sales: { weightedSum: 0, weightTotal: 0 },
    ops: { weightedSum: 0, weightTotal: 0 },
    strategy: { weightedSum: 0, weightTotal: 0 },
  };

  for (const event of events) {
    if (event.occurredAt.getTime() > asOf.getTime()) continue; // ignore future events for this snapshot
    const ageDays = daysBetween(event.occurredAt, asOf);
    const weight = recencyWeight(ageDays, HALF_LIFE_DAYS) * reliability[event.domain];
    const value = scoreEvent(event);
    acc[event.domain].weightedSum += weight * value;
    acc[event.domain].weightTotal += weight;
  }

  const breakdown = {} as Record<Domain, number>;
  const domainWeight = {} as Record<Domain, number>;
  for (const domain of DOMAINS) {
    const { weightedSum, weightTotal } = acc[domain];
    breakdown[domain] = weightTotal > 0 ? round(weightedSum / weightTotal, 1) : NEUTRAL_SCORE;
    domainWeight[domain] = weightTotal;
  }

  return { breakdown, domainWeight };
}

function compositeFromBreakdown(breakdown: Record<Domain, number>, domainWeight: Record<Domain, number>): number {
  const totalWeight = DOMAINS.reduce((sum, d) => sum + domainWeight[d], 0);
  if (totalWeight === 0) {
    const mean = DOMAINS.reduce((sum, d) => sum + breakdown[d], 0) / DOMAINS.length;
    return round(mean, 1);
  }
  const weightedSum = DOMAINS.reduce((sum, d) => sum + breakdown[d] * domainWeight[d], 0);
  return round(weightedSum / totalWeight, 1);
}

/**
 * Fuse every domain's events into a single organizational health score as
 * of `today`. Trend compares the most recent 14-day window against the
 * preceding 14-day window using the same fusion math, evaluated "as of"
 * the end of each window.
 */
export function fuseSignals(
  events: LeadosEvent[],
  weights: DomainWeights = DEFAULT_DOMAIN_RELIABILITY,
  today: Date = new Date(),
): OrgHealthScore {
  const { breakdown, domainWeight } = computeBreakdown(events, weights, today);
  const composite = compositeFromBreakdown(breakdown, domainWeight);

  const windowMs = 14 * 24 * 60 * 60 * 1000;
  const recentWindowEnd = today;
  const priorWindowEnd = new Date(today.getTime() - windowMs);

  const recentEvents = events.filter((e) => e.occurredAt.getTime() > recentWindowEnd.getTime() - windowMs);
  const priorEvents = events.filter(
    (e) =>
      e.occurredAt.getTime() <= priorWindowEnd.getTime() &&
      e.occurredAt.getTime() > priorWindowEnd.getTime() - windowMs,
  );

  const recent = computeBreakdown(recentEvents, weights, recentWindowEnd);
  const prior = computeBreakdown(priorEvents, weights, priorWindowEnd);
  const recentComposite = compositeFromBreakdown(recent.breakdown, recent.domainWeight);
  const priorComposite = compositeFromBreakdown(prior.breakdown, prior.domainWeight);

  const delta = recentComposite - priorComposite;
  const trend: OrgHealthScore["trend"] = delta > 2 ? "up" : delta < -2 ? "down" : "flat";

  const totalWeight = DOMAINS.reduce((sum, d) => sum + domainWeight[d], 0);
  const expectedWeight = FULL_CONFIDENCE_WEIGHT * DOMAINS.reduce((sum, d) => sum + weights[d], 0);
  const confidence = round(clamp(expectedWeight > 0 ? totalWeight / expectedWeight : 0, 0, 1), 2);

  return { composite, breakdown, trend, confidence };
}
