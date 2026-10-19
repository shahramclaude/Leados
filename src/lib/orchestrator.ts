// src/lib/orchestrator.ts
//
// Full orchestration pass: takes an already-computed BeliefFabricResult
// (produced by beliefFabric.runBeliefFabric in agentCore STEP 1) and layers
// rule evaluation, domain health rollups, project/decision summaries, and
// per-person flight-risk scoring on top of it.

import { gte } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { decisions as decisionsTable, events as eventsTable, people as peopleTable, projects as projectsTable } from "@/db/schema";
import type {
  BeliefFabricResult,
  DecisionSummary,
  Domain,
  DomainHealthScore,
  LeadosEvent,
  OrchestratorResult,
  ProjectSummary,
} from "./types";
import { DOMAINS, LATENT_NODE_DOMAIN } from "./types";
import { evaluateRules } from "./ruleEngine";
import { daysBetween } from "./temporal";

type Database = typeof defaultDb;

function computeDomainHealth(beliefs: BeliefFabricResult): Record<string, DomainHealthScore> {
  const result: Record<string, DomainHealthScore> = {};
  for (const domain of DOMAINS) {
    const nodesInDomain = (Object.keys(LATENT_NODE_DOMAIN) as Array<keyof typeof LATENT_NODE_DOMAIN>).filter(
      (node) => LATENT_NODE_DOMAIN[node] === domain,
    );
    const maxP = nodesInDomain.reduce((acc, node) => Math.max(acc, beliefs.posteriors[node].p), 0);
    const score = Math.round(Math.max(0, Math.min(100, (1 - maxP) * 100)));
    result[domain] = { domain, score, trend: "stable" };
  }
  return result;
}

async function loadRecentEvents(db: Database, now: Date, days = 30): Promise<LeadosEvent[]> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.select().from(eventsTable).where(gte(eventsTable.occurredAt, cutoff));
  return rows.map((r) => ({
    id: String(r.id),
    type: r.type,
    occurredAt: r.occurredAt,
    personId: r.personId ?? undefined,
    teamId: r.teamId ?? undefined,
    projectId: r.projectId ?? undefined,
    domain: r.domain ?? undefined,
    weight: r.weight ?? 1,
    data: (r.data as Record<string, unknown>) ?? undefined,
  }));
}

function computePersonFlightRisk(
  personId: string,
  events: LeadosEvent[],
  basePosterior: number,
  now: Date,
): number {
  const personEvents = events.filter(
    (e) => String(e.personId) === personId && daysBetween(e.occurredAt, now) <= 30,
  );
  const negativeSignals = personEvents.filter((e) =>
    ["sentiment.negative", "comp.flag", "attrition.peer_departure", "negative_sentiment", "compensation_flag"].some(
      (t) => e.type.includes(t),
    ),
  ).length;
  // Each negative signal nudges this person's individual estimate above the
  // org-wide base posterior; capped at 0.95.
  const adjusted = basePosterior + negativeSignals * 0.08;
  return Math.min(0.95, Math.max(0, adjusted));
}

export async function runFullOrchestration(
  db: Database,
  beliefs: BeliefFabricResult,
  now: Date,
  cycleId?: string | null,
): Promise<OrchestratorResult> {
  const events = await loadRecentEvents(db, now);

  const evaluated = await evaluateRules(db, beliefs, events, now, { cycleId });
  const findings = evaluated.map((e) => e.finding).filter((f): f is NonNullable<typeof f> => f !== null);

  const domainHealth = computeDomainHealth(beliefs);

  const peopleRows = await db.select().from(peopleTable);
  const flightRiskByPerson: OrchestratorResult["flightRiskByPerson"] = {};
  for (const person of peopleRows) {
    const p = computePersonFlightRisk(String(person.id), events, beliefs.posteriors.flightRisk.p, now);
    flightRiskByPerson[String(person.id)] = { personId: String(person.id), name: person.name, p };
  }

  const projectRows = await db.select().from(projectsTable);
  const projects: ProjectSummary[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    domain: (p.domain ?? "execution") as Domain,
    deliveryConfidence: p.deliveryConfidence ?? 80,
    previousDeliveryConfidence: p.previousDeliveryConfidence ?? 80,
    targetDate: p.targetDate ? new Date(p.targetDate).toISOString() : null,
  }));

  const decisionRows = await db.select().from(decisionsTable);
  const decisions: DecisionSummary[] = decisionRows.map((d) => ({
    id: d.id,
    title: d.title,
    domain: (d.domain ?? "strategy") as Domain,
    confidence: d.confidence ?? 50,
    deadline: d.deadline ? new Date(d.deadline).toISOString() : null,
    status: d.status ?? "open",
  }));

  const narrative = [
    beliefs.dominantRiskDetail,
    `Cascade risk is at ${Math.round(beliefs.cascadeRisk.p * 100)}% (confidence ${Math.round(
      beliefs.cascadeRisk.confidence * 100,
    )}%).`,
    `${findings.length} finding(s) generated this cycle across ${new Set(findings.map((f) => f.domain)).size} domain(s).`,
  ];

  return {
    beliefs,
    findings,
    domainHealth,
    projects,
    decisions,
    flightRiskByPerson,
    narrative,
    generatedAt: now.toISOString(),
  };
}
