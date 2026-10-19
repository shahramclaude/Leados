// Scenario probability engine.
//
// Previously this engine was only invoked from a dedicated scenario-planning
// view — it never ran automatically against the live event stream, so
// scenarios sat static until a human opened that screen. Part 5's
// `strategicIntelligence.ts` now reruns this model on every strategic
// intelligence pass so scenario probabilities move as new events land and
// can auto-trigger ("activate") without manual intervention.

import type { LeadosEvent, ScenarioRow } from "./types";
import { toNumber } from "./types";

export interface ScenarioResult {
  id: string;
  name: string;
  domain: string;
  probability: number;
  previousProbability: number;
  delta: number;
  activated: boolean;
  status: "monitoring" | "activated" | "resolved";
  matchedEventCount: number;
  narrative: string;
  playbook: string[];
}

const DOMAIN_PLAYBOOK: Record<string, string[]> = {
  market: [
    "Validate the signal with a focused customer/market research sprint",
    "Pressure-test pricing and positioning against the emerging scenario",
  ],
  product: [
    "Spin up a discovery spike to de-risk the highest-uncertainty assumption",
    "Prepare a fast-follow roadmap slot in case the scenario materializes",
  ],
  financial: [
    "Stress-test the budget/runway model against this scenario's downside case",
    "Pre-negotiate a contingency facility or cost-reduction lever",
  ],
  talent: [
    "Shore up retention for roles most exposed to this scenario",
    "Prepare a hiring/backfill plan contingent on activation",
  ],
  general: [
    "Assign a scenario owner to monitor weekly and report deviations",
    "Draft a one-page contingency playbook before the scenario fully activates",
  ],
};

/** Suggested response playbook for a scenario's domain. */
export function suggestResponsePlaybook(domain: string): string[] {
  return DOMAIN_PLAYBOOK[domain] ?? DOMAIN_PLAYBOOK.general;
}

const LOOKBACK_DAYS = 30;
export const SCENARIO_ACTIVATION_THRESHOLD = 0.15;

/**
 * A scenario's driver tags are matched against recent event types/domains and
 * payload text. Each matching event nudges probability using a simple
 * logistic-style accumulation so probability stays bounded in (0, 1).
 */
export function computeScenarioProbability(
  scenario: ScenarioRow,
  events: LeadosEvent[],
  now: Date,
): { probability: number; matchedEventCount: number } {
  const tags = (scenario.driverTags ?? []).map((t) => t.toLowerCase());
  const cutoff = now.getTime() - LOOKBACK_DAYS * 24 * 3_600_000;

  const relevant = events.filter((e) => {
    const created = new Date(e.createdAt ?? now).getTime();
    if (created < cutoff) return false;
    if (scenario.domain && e.domain && e.domain !== scenario.domain) {
      // still allow domain-less tag matches through, but domain match boosts weight
    }
    const haystack = `${e.type} ${JSON.stringify(e.payload ?? {})}`.toLowerCase();
    return tags.length === 0 || tags.some((tag) => haystack.includes(tag));
  });

  const base = toNumber(scenario.probability, 0.3);
  // Weight each matching event by severity; domain-matching events count double.
  const weight = relevant.reduce((sum, e) => {
    const domainBoost = e.domain === scenario.domain ? 2 : 1;
    return sum + (e.severity / 5) * 0.08 * domainBoost;
  }, 0);

  // Logistic nudge keeps the result inside (0, 1) regardless of how much
  // weight accumulates.
  const logit = Math.log(base / (1 - base)) + weight;
  const probability = 1 / (1 + Math.exp(-logit));

  return { probability: Math.min(0.98, Math.max(0.02, probability)), matchedEventCount: relevant.length };
}

function buildNarrative(name: string, delta: number, matched: number): string {
  if (Math.abs(delta) < 0.02) {
    return `${name} probability is stable (${matched} supporting signals in the last ${LOOKBACK_DAYS} days).`;
  }
  const direction = delta > 0 ? "risen" : "fallen";
  return `${name} probability has ${direction} by ${(Math.abs(delta) * 100).toFixed(1)} points on ${matched} supporting signals.`;
}

/** Run the scenario engine for every monitored scenario against current events. */
export function runScenarioEngine(scenarios: ScenarioRow[], events: LeadosEvent[], now: Date): ScenarioResult[] {
  return scenarios.map((scenario) => {
    const previousProbability = toNumber(scenario.probability, 0.3);
    const { probability, matchedEventCount } = computeScenarioProbability(scenario, events, now);
    const delta = probability - previousProbability;
    const activated = Math.abs(delta) > SCENARIO_ACTIVATION_THRESHOLD;

    return {
      id: scenario.id,
      name: scenario.name,
      domain: scenario.domain ?? "general",
      probability,
      previousProbability,
      delta,
      activated,
      status: activated ? "activated" : (scenario.status as ScenarioResult["status"]) ?? "monitoring",
      matchedEventCount,
      narrative: buildNarrative(scenario.name, delta, matchedEventCount),
      playbook: suggestResponsePlaybook(scenario.domain ?? "general"),
    };
  });
}
