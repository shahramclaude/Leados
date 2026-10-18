// ─────────────────────────────────────────────────────────────────────────
// Intelligence orchestrator
//
// `buildIntelligenceReport` is a pure function (no DB access) composing the
// four probabilistic engines — Bayesian belief network, signal fusion,
// causal chain detection, predictive scoring — into one IntelligenceReport.
// `computeIntelligence` is the thin DB-bound wrapper the API route calls.
// ─────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { leados_events, leados_people } from "@/db/schema";
import { getMarginals, updateBeliefs } from "@/lib/bayesianNetwork";
import { detectCausalChains } from "@/lib/causalChain";
import {
  computeBurnoutRiskIndex,
  computeDecisionHealthIndex,
  computeFlightRiskScores,
} from "@/lib/predictiveScoring";
import { DOMAINS, fuseSignals } from "@/lib/signalFusion";
import { round } from "@/lib/temporal";
import type { Finding, IntelligenceReport, LeadosEvent, Person, Severity } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EVENT_TYPE_SET = new Set<string>([
  "people.oneonone.logged",
  "people.pulse.logged",
  "people.feedback.logged",
  "people.comp.reviewed",
  "hr.flightrisk.flag",
  "hr.attrition",
  "engagement.decline",
  "decision.logged",
  "decision.escalate",
  "decision.resolved",
  "ops.incident",
  "sales.pipeline.snapshot",
  "pipeline.thin",
  "fin.runway.snapshot",
  "fin.runway.drop",
  "fin.pl.logged",
  "strategy.okr.review",
]);

function isEventType(value: string): value is LeadosEvent["type"] {
  return EVENT_TYPE_SET.has(value);
}

const DOMAIN_SET = new Set<string>(["people", "finance", "sales", "ops", "strategy"]);

function isDomain(value: string): value is LeadosEvent["domain"] {
  return DOMAIN_SET.has(value);
}

function buildFindings(people: Person[], events: LeadosEvent[], now: Date): Finding[] {
  const findings: Finding[] = [];
  const orgBeliefs = updateBeliefs(events, undefined, { now });

  const strategyRisk = getMarginals(orgBeliefs, "strategyRisk");
  if (strategyRisk.p > 0.5) {
    const sev: Severity = strategyRisk.p > 0.75 ? 5 : 4;
    findings.push({
      key: "STRATEGY_RISK_ELEVATED",
      rule: "STRATEGY_RISK_ELEVATED",
      domain: "strategy",
      sev,
      title: "Strategy risk is elevated",
      detail: `Belief network posterior P(strategyRisk) = ${Math.round(strategyRisk.p * 100)}% (confidence ${Math.round(strategyRisk.confidence * 100)}%), driven by runway, decision backlog, and pipeline coverage signals.`,
      probability: round(strategyRisk.p, 3),
    });
  }

  for (const person of people) {
    const personBeliefs = updateBeliefs(events, undefined, { now, personId: person.id });
    const flightRisk = getMarginals(personBeliefs, "flightRisk");
    if (flightRisk.p > 0.5) {
      const sev: Severity = flightRisk.p > 0.75 ? 5 : 3;
      findings.push({
        key: `FLIGHT_RISK_ELEVATED:${person.id}`,
        rule: "FLIGHT_RISK_ELEVATED",
        domain: "people",
        sev,
        personId: person.id,
        personName: person.name,
        title: `Flight risk elevated: ${person.name}`,
        detail: `Belief network posterior P(flightRisk) = ${Math.round(flightRisk.p * 100)}% (confidence ${Math.round(flightRisk.confidence * 100)}%), fused from cadence, morale, and flag signals.`,
        probability: round(flightRisk.p, 3),
      });
    }
  }

  const healthScore = fuseSignals(events, undefined, now);
  for (const domain of DOMAINS) {
    const value = healthScore.breakdown[domain];
    if (value < 40) {
      findings.push({
        key: `DOMAIN_HEALTH_LOW:${domain}`,
        rule: "DOMAIN_HEALTH_LOW",
        domain,
        sev: value < 25 ? 5 : 3,
        title: `${domain} health is low`,
        detail: `Fused ${domain} health score is ${value}/100 (composite ${healthScore.composite}/100, trend ${healthScore.trend}).`,
      });
    }
  }

  const chains = detectCausalChains(events);
  for (const chain of chains) {
    if (chain.confidence <= 0.2 || chain.occurrences === 0) continue;
    findings.push({
      key: `CAUSAL_CHAIN:${chain.path.join(">")}`,
      rule: "CAUSAL_CHAIN_DETECTED",
      domain: "strategy",
      sev: chain.confidence > 0.5 ? 4 : 2,
      title: `Causal pattern detected: ${chain.path.join(" → ")}`,
      detail: `Observed ${chain.occurrences} time(s), avg lag ${chain.avgLagDays}d, confidence ${Math.round(chain.confidence * 100)}%. Next likely: ${chain.nextLikely}.`,
      probability: chain.confidence,
    });
  }

  const burnout = computeBurnoutRiskIndex(people, events, now);
  for (const personId of burnout.hotspots) {
    const person = people.find((p) => p.id === personId);
    findings.push({
      key: `BURNOUT_RISK:${personId}`,
      rule: "BURNOUT_RISK",
      domain: "people",
      sev: 4,
      personId,
      personName: person?.name,
      title: `Burnout risk hotspot: ${person?.name ?? personId}`,
      detail: `Org-wide burnout index ${Math.round(burnout.value * 100)}%. Evidence: ${burnout.evidence.join("; ")}.`,
      probability: burnout.value,
    });
  }

  const decisionHealth = computeDecisionHealthIndex(events, now);
  if (decisionHealth.stale > 0) {
    findings.push({
      key: "DECISIONS_STALE",
      rule: "DECISIONS_STALE",
      domain: "strategy",
      sev: decisionHealth.stale > 3 ? 4 : 2,
      title: `${decisionHealth.stale} decision(s) are stale`,
      detail: `${decisionHealth.stale} open decision(s) have been unresolved for more than 14 days. Velocity is ${decisionHealth.velocityTrend}.`,
    });
  }
  if (decisionHealth.blockedCount > 0) {
    findings.push({
      key: "DECISIONS_BLOCKED",
      rule: "DECISIONS_BLOCKED",
      domain: "strategy",
      sev: 3,
      title: `${decisionHealth.blockedCount} decision(s) blocked after escalation`,
      detail: `${decisionHealth.blockedCount} decision(s) were escalated and remain unresolved.`,
    });
  }

  return findings;
}

/** Pure composition of the full intelligence report from already-fetched data. */
export function buildIntelligenceReport(people: Person[], events: LeadosEvent[], now: Date = new Date()): IntelligenceReport {
  const healthScore = fuseSignals(events, undefined, now);
  const findings = buildFindings(people, events, now);
  const causalChains = detectCausalChains(events);
  const flightRisk = computeFlightRiskScores(people, events, now);
  const burnoutIndex = computeBurnoutRiskIndex(people, events, now);
  const decisionHealth = computeDecisionHealthIndex(events, now);

  const counts = {
    critical: findings.filter((f) => f.sev === 5).length,
    major: findings.filter((f) => f.sev === 3 || f.sev === 4).length,
    minor: findings.filter((f) => f.sev === 1 || f.sev === 2).length,
    findings: findings.length,
  };

  return {
    generatedAt: now.toISOString(),
    healthScore,
    findings,
    causalChains,
    predictions: { flightRisk, burnoutIndex, decisionHealth },
    counts,
  };
}

function toPerson(row: typeof leados_people.$inferSelect): Person {
  return {
    id: String(row.id),
    name: row.name,
    role: row.role,
    team: row.team,
    tenureStartAt: row.tenureStartAt,
  };
}

// The event log's `type`/`domain` columns are free text (see
// src/db/schema.ts) so the log can absorb new signal types without a
// migration. Rows that don't match a known EventType/Domain are dropped
// (rather than force-cast) so the engine never operates on unverified data.
function toEvent(row: typeof leados_events.$inferSelect): LeadosEvent | null {
  if (!isEventType(row.type) || !isDomain(row.domain)) return null;
  const data = isRecord(row.data) ? row.data : {};
  return {
    id: String(row.id),
    type: row.type,
    domain: row.domain,
    personId: row.personId === null ? null : String(row.personId),
    data,
    occurredAt: row.occurredAt,
  };
}

function isLeadosEvent(value: LeadosEvent | null): value is LeadosEvent {
  return value !== null;
}

/** DB-bound wrapper: fetch the roster + event log, then build the report. */
export async function computeIntelligence(): Promise<IntelligenceReport> {
  const [peopleRows, eventRows] = await Promise.all([db.select().from(leados_people), db.select().from(leados_events)]);

  const people = peopleRows.map(toPerson);
  const events = eventRows.map(toEvent).filter(isLeadosEvent);

  return buildIntelligenceReport(people, events, new Date());
}
