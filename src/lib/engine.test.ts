// Lightweight assertion-based test suite for the probabilistic intelligence
// layer. No test framework dependency — run with: npx tsx src/lib/engine.test.ts
//
// Every exported function from bayesianNetwork.ts, signalFusion.ts,
// causalChain.ts, predictiveScoring.ts, and intelligence.ts (pure part) has
// at least one test below.

import { DEFAULT_PRIORS, NETWORK_EDGES, getMarginals, updateBeliefs } from "./bayesianNetwork";
import {
  DEFAULT_FREQUENCY_THRESHOLD,
  REQUIRED_CHAINS,
  detectCausalChains,
  detectEdge,
} from "./causalChain";
import { buildIntelligenceReport } from "./intelligence";
import {
  computeBurnoutRiskIndex,
  computeDecisionHealthIndex,
  computeFlightRiskScore,
  computeFlightRiskScores,
} from "./predictiveScoring";
import { DEFAULT_DOMAIN_RELIABILITY, DOMAINS, fuseSignals, scoreEvent } from "./signalFusion";
import { clamp, daysBetween, recencyWeight, round } from "./temporal";
import type { LeadosEvent, Person } from "./types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

let counter = 0;
function mkEvent(
  type: LeadosEvent["type"],
  domain: LeadosEvent["domain"],
  data: Record<string, unknown>,
  daysAgo: number,
  personId: string | null = null,
): LeadosEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    type,
    domain,
    personId,
    data,
    occurredAt: new Date(Date.now() - daysAgo * 86400000),
  };
}

function mkPerson(overrides: Partial<Person> & { id: string; name: string }): Person {
  return {
    id: overrides.id,
    name: overrides.name,
    role: overrides.role ?? "Engineer",
    team: overrides.team ?? "Platform",
    tenureStartAt: overrides.tenureStartAt ?? new Date(Date.now() - 365 * 86400000),
  };
}

const NOW = new Date();

// ───────────────────────── temporal.ts ─────────────────────────

{
  const a = new Date("2024-01-01T00:00:00Z");
  const b = new Date("2024-01-11T00:00:00Z");
  assert(daysBetween(a, b) === 10, "daysBetween: 10 day gap computed correctly");
}

{
  assert(recencyWeight(0, 14) === 1, "recencyWeight: age 0 -> weight 1");
  assert(Math.abs(recencyWeight(14, 14) - 0.5) < 1e-9, "recencyWeight: age == half-life -> weight 0.5");
  assert(recencyWeight(28, 14) < 0.26 && recencyWeight(28, 14) > 0.24, "recencyWeight: age == 2x half-life -> weight ~0.25");
}

{
  assert(clamp(5, 0, 10) === 5, "clamp: passthrough within range");
  assert(clamp(-5, 0, 10) === 0, "clamp: floors below min");
  assert(clamp(15, 0, 10) === 10, "clamp: ceilings above max");
  assert(clamp(Number.NaN, 0, 10) === 0, "clamp: NaN falls back to min");
}

{
  assert(round(1.2345, 2) === 1.23, "round: rounds to 2 decimals");
}

// ───────────────────────── bayesianNetwork.ts ─────────────────────────

{
  assert(Object.keys(DEFAULT_PRIORS).length === 8, "DEFAULT_PRIORS: covers all 6 observable + 2 latent nodes");
  assert(NETWORK_EDGES.flightRisk.includes("moralePulse"), "NETWORK_EDGES: moralePulse feeds flightRisk");
  assert(NETWORK_EDGES.strategyRisk.includes("runwayMonths"), "NETWORK_EDGES: runwayMonths feeds strategyRisk");
}

{
  // No evidence at all -> posteriors fall back to priors with low confidence.
  const posteriors = updateBeliefs([], undefined, { now: NOW });
  const flightRisk = getMarginals(posteriors, "flightRisk");
  assert(flightRisk.p >= 0 && flightRisk.p <= 1, "updateBeliefs: flightRisk posterior in [0,1] with no evidence");
  assert(getMarginals(posteriors, "cadenceSlip").confidence <= 0.3, "updateBeliefs: low confidence with no data");
}

{
  // A strong, fresh morale signal should push flightRisk's posterior above its prior.
  const events = [
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 1, "p1"),
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 5, "p1"),
    mkEvent("people.pulse.logged", "people", { mood: 2 }, 9, "p1"),
  ];
  const posteriors = updateBeliefs(events, undefined, { now: NOW, personId: "p1" });
  const flightRisk = getMarginals(posteriors, "flightRisk");
  assert(flightRisk.p > DEFAULT_PRIORS.flightRisk, "updateBeliefs: morale signal raises flightRisk above its prior");
}

{
  // A low-runway signal should push strategyRisk's posterior above its prior.
  const events = [mkEvent("fin.runway.snapshot", "finance", { months: 3 }, 1)];
  const posteriors = updateBeliefs(events, undefined, { now: NOW });
  const strategyRisk = getMarginals(posteriors, "strategyRisk");
  assert(strategyRisk.p > DEFAULT_PRIORS.strategyRisk, "updateBeliefs: runway signal raises strategyRisk above its prior");
}

{
  // Healthy runway should not elevate strategyRisk materially above prior.
  const events = [mkEvent("fin.runway.snapshot", "finance", { months: 20 }, 1)];
  const posteriors = updateBeliefs(events, undefined, { now: NOW });
  assert(getMarginals(posteriors, "runwayMonths").p < 0.3, "updateBeliefs: healthy runway keeps runwayMonths posterior low");
}

{
  const posteriors = updateBeliefs([], undefined, {});
  const fallback = getMarginals(posteriors, "cadenceSlip");
  assert(typeof fallback.p === "number" && typeof fallback.confidence === "number", "getMarginals: returns a well-formed marginal");
}

// ───────────────────────── signalFusion.ts ─────────────────────────

{
  assert(DOMAINS.length === 5, "DOMAINS: exactly 5 domains");
  assert(Object.keys(DEFAULT_DOMAIN_RELIABILITY).length === 5, "DEFAULT_DOMAIN_RELIABILITY: one weight per domain");
}

{
  assert(scoreEvent(mkEvent("people.pulse.logged", "people", { mood: 5 }, 0)) === 100, "scoreEvent: mood 5/5 scores 100");
  assert(scoreEvent(mkEvent("ops.incident", "ops", {}, 0)) === 10, "scoreEvent: ops incident scores low (10)");
  assert(scoreEvent(mkEvent("decision.resolved", "strategy", {}, 0)) === 85, "scoreEvent: resolved decision scores high (85)");
}

{
  const score = fuseSignals([], undefined, NOW);
  assert(score.composite === 50, "fuseSignals: empty event log yields neutral composite (50)");
  assert(DOMAINS.every((d) => score.breakdown[d] === 50), "fuseSignals: empty event log yields neutral breakdown everywhere");
  assert(score.confidence === 0, "fuseSignals: empty event log yields zero confidence");
}

{
  const healthyEvents = DOMAINS.flatMap((d, i) =>
    Array.from({ length: 5 }, (_, j) => mkEvent("decision.resolved", d, {}, i + j)),
  );
  const unhealthyEvents = DOMAINS.flatMap((d, i) =>
    Array.from({ length: 5 }, (_, j) => mkEvent("ops.incident", d, {}, i + j)),
  );
  const healthyScore = fuseSignals(healthyEvents, undefined, NOW);
  const unhealthyScore = fuseSignals(unhealthyEvents, undefined, NOW);
  assert(healthyScore.composite > unhealthyScore.composite, "fuseSignals: healthy events score higher than unhealthy events");
}

{
  const recentGood = Array.from({ length: 5 }, (_, i) => mkEvent("decision.resolved", "strategy", {}, i));
  const recentBad = Array.from({ length: 5 }, (_, i) => mkEvent("decision.escalate", "strategy", {}, 20 + i));
  const score = fuseSignals([...recentGood, ...recentBad], undefined, NOW);
  assert(score.trend === "up", "fuseSignals: improving recent window vs prior window trends up");
}

// ───────────────────────── causalChain.ts ─────────────────────────

{
  assert(REQUIRED_CHAINS.length === 3, "REQUIRED_CHAINS: exactly the 3 hard-coded chains");
  assert(DEFAULT_FREQUENCY_THRESHOLD > 0 && DEFAULT_FREQUENCY_THRESHOLD < 1, "DEFAULT_FREQUENCY_THRESHOLD: sane probability");
}

{
  const events = [
    mkEvent("decision.escalate", "strategy", {}, 10),
    mkEvent("ops.incident", "ops", {}, 7),
    mkEvent("decision.escalate", "strategy", {}, 27),
    mkEvent("ops.incident", "ops", {}, 24),
  ];
  const stats = detectEdge(events, { from: "decision.escalate", to: "ops.incident", maxLagDays: 7 });
  assert(stats.fromCount === 2, "detectEdge: counts all `from` events");
  assert(stats.occurrences === 2, "detectEdge: both escalations followed by an incident within the window");
  assert(stats.avgLagDays === 3, "detectEdge: average lag computed correctly (3 days each)");
  assert(stats.confidence === 1, "detectEdge: confidence is occurrences/fromCount");
}

{
  const chains = detectCausalChains([]);
  assert(chains.length >= 3, "detectCausalChains: always reports the 3 required chains even with no data");
  for (const required of REQUIRED_CHAINS) {
    assert(
      chains.some((c) => c.path[0] === required.from && c.path[1] === required.to),
      `detectCausalChains: includes required chain ${required.from} -> ${required.to}`,
    );
  }
}

{
  const events = [
    mkEvent("decision.escalate", "strategy", {}, 20),
    mkEvent("ops.incident", "ops", {}, 17),
    mkEvent("ops.incident", "ops", {}, 10),
    mkEvent("hr.attrition", "people", {}, 5),
  ];
  const chains = detectCausalChains(events, { thresholdFrequency: 0.1 });
  assert(
    chains.some((c) => c.path.length === 3 && c.path[0] === "decision.escalate" && c.path[2] === "hr.attrition"),
    "detectCausalChains: composes a 3-step chain from two qualifying edges sharing a middle node",
  );
}

// ───────────────────────── predictiveScoring.ts ─────────────────────────

{
  const stablePerson = mkPerson({ id: "p-stable", name: "Stable Person", tenureStartAt: new Date(Date.now() - 1200 * 86400000) });
  const events = [
    mkEvent("people.oneonone.logged", "people", {}, 2, "p-stable"),
    mkEvent("people.pulse.logged", "people", { mood: 5 }, 1, "p-stable"),
    mkEvent("people.feedback.logged", "people", {}, 10, "p-stable"),
    mkEvent("people.feedback.logged", "people", {}, 20, "p-stable"),
  ];
  const risky = mkPerson({ id: "p-risky", name: "Risky Person", tenureStartAt: new Date(Date.now() - 25 * 30 * 86400000) });
  const riskyEvents = [
    mkEvent("people.oneonone.logged", "people", {}, 40, "p-risky"),
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 2, "p-risky"),
    mkEvent("people.pulse.logged", "people", { mood: 2 }, 10, "p-risky"),
    mkEvent("people.pulse.logged", "people", { mood: 3 }, 20, "p-risky"),
    mkEvent("people.comp.reviewed", "people", { gapPct: 25 }, 30, "p-risky"),
  ];

  const stableScore = computeFlightRiskScore(stablePerson, events, NOW);
  const riskyScore = computeFlightRiskScore(risky, riskyEvents, NOW);

  assert(stableScore.score >= 0 && stableScore.score <= 1, "computeFlightRiskScore: score in [0,1]");
  assert(riskyScore.score > stableScore.score, "computeFlightRiskScore: at-risk person scores higher than stable person");
  assert(riskyScore.drivers.length > 0, "computeFlightRiskScore: at-risk person has named drivers");
  assert(riskyScore.horizon === "30d" || riskyScore.horizon === "90d", "computeFlightRiskScore: horizon is a valid value");
}

{
  const people = [mkPerson({ id: "a", name: "A" }), mkPerson({ id: "b", name: "B" })];
  const scores = computeFlightRiskScores(people, [], NOW);
  assert(scores.length === 2, "computeFlightRiskScores: returns one score per person");
}

{
  const burnedOut = mkPerson({ id: "p-burn", name: "Burned Out" });
  const events = [
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 1, "p-burn"),
    mkEvent("ops.incident", "ops", {}, 3, "p-burn"),
    mkEvent("ops.incident", "ops", {}, 10, "p-burn"),
    mkEvent("ops.incident", "ops", {}, 15, "p-burn"),
    mkEvent("people.oneonone.logged", "people", {}, 40, "p-burn"),
  ];
  const index = computeBurnoutRiskIndex([burnedOut], events, NOW);
  assert(index.value > 0.5, "computeBurnoutRiskIndex: high-signal person yields elevated org-wide value");
  assert(index.hotspots.includes("p-burn"), "computeBurnoutRiskIndex: flags the burned-out person as a hotspot");
  assert(index.evidence.length > 0, "computeBurnoutRiskIndex: returns supporting evidence strings");
}

{
  const events = [
    mkEvent("decision.logged", "strategy", { decisionId: "D-1" }, 40),
    mkEvent("decision.escalate", "strategy", { decisionId: "D-1" }, 35),
    mkEvent("decision.logged", "strategy", { decisionId: "D-2" }, 5),
    mkEvent("decision.resolved", "strategy", { decisionId: "D-3" }, 2),
    mkEvent("decision.resolved", "strategy", { decisionId: "D-4" }, 45),
  ];
  const health = computeDecisionHealthIndex(events, NOW);
  assert(health.stale === 1, "computeDecisionHealthIndex: counts open decisions older than 14 days as stale");
  assert(health.blockedCount === 1, "computeDecisionHealthIndex: counts escalated+unresolved decisions as blocked");
  assert(health.velocityTrend === "accelerating", "computeDecisionHealthIndex: more recent resolutions than prior -> accelerating");
}

// ───────────────────────── intelligence.ts (pure) ─────────────────────────

{
  const report = buildIntelligenceReport([], [], NOW);
  assert(typeof report.generatedAt === "string", "buildIntelligenceReport: generatedAt is an ISO string");
  assert(report.healthScore.composite === 50, "buildIntelligenceReport: neutral health score with no data");
  assert(Array.isArray(report.findings), "buildIntelligenceReport: findings is an array");
  assert(Array.isArray(report.causalChains), "buildIntelligenceReport: causalChains is an array");
  assert(report.counts.findings === report.findings.length, "buildIntelligenceReport: counts.findings matches findings.length");
}

{
  const atRiskPerson = mkPerson({ id: "p-exec", name: "At Risk" });
  const events = [
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 1, "p-exec"),
    mkEvent("people.pulse.logged", "people", { mood: 1 }, 6, "p-exec"),
    mkEvent("people.pulse.logged", "people", { mood: 2 }, 12, "p-exec"),
    mkEvent("hr.flightrisk.flag", "people", {}, 2, "p-exec"),
    mkEvent("people.oneonone.logged", "people", {}, 40, "p-exec"),
    mkEvent("fin.runway.snapshot", "finance", { months: 2 }, 1),
  ];
  const report = buildIntelligenceReport([atRiskPerson], events, NOW);
  assert(
    report.findings.some((f) => f.rule === "FLIGHT_RISK_ELEVATED"),
    "buildIntelligenceReport: generates a FLIGHT_RISK_ELEVATED finding from belief-network evidence",
  );
  assert(
    report.findings.some((f) => f.rule === "STRATEGY_RISK_ELEVATED"),
    "buildIntelligenceReport: generates a STRATEGY_RISK_ELEVATED finding from runway evidence",
  );
  assert(report.counts.critical + report.counts.major + report.counts.minor === report.counts.findings, "buildIntelligenceReport: severity buckets sum to total findings");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll tests passed.");
}
