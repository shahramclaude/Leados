// =============================================================================
// Leados — Org Physics primitives
// -----------------------------------------------------------------------------
// This file does not pre-exist in this checkout (Parts 1-5 are not present
// in the sandbox). It is authored here as the canonical source so Part 6
// can import real, non-reimplemented functions rather than mocking them.
// Part 6 MUST call these two exports directly — do not reimplement entropy
// or energy math inside executionIntelligence.ts.
// =============================================================================

import type { LeadosEvent, PersonRecord } from "./types";

/**
 * measureOrgEntropy(events, people): number
 * Returns a 0-1 scalar. Shannon entropy of the distribution of event
 * `type` values over the trailing window, normalized by log2(distinctTypes),
 * blended with the dispersion of event activity across domains (an org
 * where all activity is concentrated in one domain/person is "ordered";
 * one where activity/noise is spread evenly across many types & domains
 * is "chaotic").
 *
 * Signature: export function measureOrgEntropy(
 *   events: LeadosEvent[],
 *   people: PersonRecord[],
 * ): number
 */
export function measureOrgEntropy(
  events: LeadosEvent[],
  people: PersonRecord[],
): number {
  if (events.length === 0) return 0;

  const typeCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  for (const e of events) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    const d = e.domain ?? "unknown";
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }

  const shannon = (counts: Map<string, number>, total: number) => {
    const distinct = counts.size;
    if (distinct <= 1) return 0;
    let h = 0;
    for (const c of counts.values()) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
    return h / Math.log2(distinct); // normalized 0-1
  };

  const typeEntropy = shannon(typeCounts, events.length);
  const domainEntropy = shannon(domainCounts, events.length);

  // Burnout/flight-risk volatility in the workforce raises perceived entropy.
  const avgRisk =
    people.length > 0
      ? people.reduce((s, p) => s + p.flightRisk + p.burnoutRisk, 0) /
        (people.length * 2)
      : 0;

  const entropy = 0.45 * typeEntropy + 0.35 * domainEntropy + 0.2 * avgRisk;
  return Math.max(0, Math.min(1, entropy));
}

/**
 * computeLeadershipEnergyBudget(events, people): number
 * Returns a 0-1 scalar representing remaining leadership capacity to absorb
 * shocks. Depleted by high burnout/flight risk concentration and by event
 * volume (load), replenished by headcount and lower recent event density.
 *
 * Signature: export function computeLeadershipEnergyBudget(
 *   events: LeadosEvent[],
 *   people: PersonRecord[],
 * ): number
 */
export function computeLeadershipEnergyBudget(
  events: LeadosEvent[],
  people: PersonRecord[],
): number {
  if (people.length === 0) return 0.5;

  const avgBurnout =
    people.reduce((s, p) => s + p.burnoutRisk, 0) / people.length;
  const avgFlight =
    people.reduce((s, p) => s + p.flightRisk, 0) / people.length;

  // Load factor: events per person over trailing window, saturating.
  const loadPerPerson = events.length / Math.max(1, people.length);
  const loadFactor = 1 - Math.min(1, loadPerPerson / 25); // 25 events/person considered saturating

  const reserves =
    0.4 * (1 - avgBurnout) + 0.3 * (1 - avgFlight) + 0.3 * loadFactor;

  return Math.max(0, Math.min(1, reserves));
}
