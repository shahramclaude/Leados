// eventBrain.ts
//
// NOTE: recreated for this sandbox — see the comment at the top of
// src/db/schema.ts.
//
// project(events, now)  -> Projection   (per-domain + per-person rollups)
// run(P, now, weights?) -> BrainFindings (rule evaluation + org health score)

import {
  DOMAINS,
  type BrainFindings,
  type Domain,
  type DomainProjection,
  type EventRecord,
  type PersonProjection,
  type Projection,
  type RiskProfile,
} from "./types";
import { evaluateAll, isFlightRiskIndicator } from "./ruleEngine";

const DEFAULT_LOOKBACK_DAYS = 90;
const DECAY_HALF_LIFE_DAYS = 14; // DESIGN PARAMETER: recency decay half-life
const SEVERITY_WEIGHT = 0.9; // DESIGN PARAMETER: per-event risk contribution scale

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function decayWeight(ageDays: number): number {
  // exponential decay: weight halves every DECAY_HALF_LIFE_DAYS
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

/** Compute a 0..10 health score (10 = healthiest) from a set of events as of `asOf`. */
function computeScore(events: EventRecord[], asOf: Date): number {
  let riskAccum = 0;
  for (const e of events) {
    const ageDays = Math.max(0, daysBetween(asOf, e.occurredAt));
    riskAccum += e.severity * SEVERITY_WEIGHT * decayWeight(ageDays);
  }
  const score = 10 - Math.min(10, riskAccum);
  return Math.max(0, Math.min(10, score));
}

function computeDomainProjection(
  domain: Domain,
  events: EventRecord[],
  now: Date,
): DomainProjection {
  const score = computeScore(events, now);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const scoreNow = score;
  const scorePrior = computeScore(
    events.filter((e) => e.occurredAt <= sevenDaysAgo),
    sevenDaysAgo,
  );
  const scorePriorPrior = computeScore(
    events.filter((e) => e.occurredAt <= fourteenDaysAgo),
    fourteenDaysAgo,
  );

  const riskNow = 10 - scoreNow;
  const riskPrior = 10 - scorePrior;
  const riskPriorPrior = 10 - scorePriorPrior;

  // velocity = per-day change of risk, averaged over the two most recent 7d windows
  const v1 = (riskNow - riskPrior) / 7;
  const v2 = (riskPrior - riskPriorPrior) / 7;
  const velocity = (v1 + v2) / 2;

  // posterior: heuristic Bayesian-flavoured belief the domain is "at risk" (0..1)
  const posterior = Math.max(0, Math.min(1, (10 - score) / 10));

  const lastEventAt = events.length
    ? events.reduce((max, e) => (e.occurredAt > max ? e.occurredAt : max), events[0].occurredAt)
    : null;

  return {
    domain,
    events,
    eventCount: events.length,
    score,
    velocity,
    posterior,
    lastEventAt,
  };
}

export function project(
  events: EventRecord[],
  now: Date = new Date(),
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Projection {
  const cutoff = new Date(now.getTime() - lookbackDays * 86400000);
  const windowed = events.filter((e) => e.occurredAt >= cutoff && e.occurredAt <= now);

  const domains = {} as Record<Domain, DomainProjection>;
  for (const domain of DOMAINS) {
    const domainEvents = windowed.filter((e) => e.domain === domain);
    domains[domain] = computeDomainProjection(domain, domainEvents, now);
  }

  const people: Record<string, PersonProjection> = {};
  for (const e of windowed) {
    if (!e.personId) continue;
    if (!people[e.personId]) {
      people[e.personId] = {
        personId: e.personId,
        name: (e.payload?.personName as string | undefined) ?? e.personId,
        events: [],
        flightRiskIndicatorTypes: [],
        flightRiskCount: 0,
      };
    }
    people[e.personId].events.push(e);
  }
  for (const person of Object.values(people)) {
    const types = new Set<string>();
    for (const e of person.events) {
      if (isFlightRiskIndicator(e.type)) types.add(e.type);
    }
    person.flightRiskIndicatorTypes = Array.from(types);
    person.flightRiskCount = types.size;
  }

  return { generatedAt: now, lookbackDays, domains, people };
}

function riskProfileFromScore(orgHealthScore: number): RiskProfile {
  if (orgHealthScore >= 80) return "low";
  if (orgHealthScore >= 60) return "moderate";
  if (orgHealthScore >= 40) return "elevated";
  return "critical";
}

function buildPhysicsSummary(P: Projection): string {
  const entries = Object.values(P.domains).slice().sort((a, b) => b.velocity - a.velocity);
  const worst = entries[0];
  const best = entries[entries.length - 1];
  if (!worst || !best || worst.domain === best.domain) {
    return "Domain dynamics are stable with no dominant trend this cycle.";
  }
  const worstDir = worst.velocity > 0.01 ? "deteriorating" : "holding steady";
  const bestDir = best.velocity < -0.01 ? "improving" : "holding steady";
  return `${worst.domain} is ${worstDir} at ${Math.abs(worst.velocity).toFixed(2)} risk/day while ${best.domain} is ${bestDir} at ${Math.abs(best.velocity).toFixed(2)} risk/day.`;
}

export function run(
  P: Projection,
  now: Date = new Date(),
  ruleWeights: Record<string, number> = {},
): BrainFindings {
  const findings = evaluateAll(P, now, ruleWeights);
  const novelFindings = findings.filter((f) => f.severity >= 4);
  const topFinding = findings[0] ?? null;

  const domainScores = Object.values(P.domains).map((d) => d.score);
  const avgScore =
    domainScores.length > 0
      ? domainScores.reduce((a, b) => a + b, 0) / domainScores.length
      : 10;
  const orgHealthScore = Math.round(avgScore * 10);

  return {
    generatedAt: now,
    orgHealthScore,
    riskProfile: riskProfileFromScore(orgHealthScore),
    domainMetrics: P.domains,
    findings,
    novelFindings,
    topFinding,
    physicsSummary: buildPhysicsSummary(P),
  };
}

const eventBrain = { project, run };
export default eventBrain;
