// src/lib/agentCore.ts
//
// Part 2 deliverable: the autonomous intelligence agent's orchestrating
// cycle. Pure-ish orchestration logic — all IO goes through the lib
// modules it composes (beliefFabric, temporalBeliefTracker, orchestrator,
// ruleEngine, hypothesis, playbooksEngine, selfImprove).

import { randomUUID } from "crypto";
import { desc, eq, gte } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import {
  agentCycles,
  events as eventsTable,
  notifications as notificationsTable,
  people as peopleTable,
  projects as projectsTable,
  settings as settingsTable,
  weeklyBriefings,
} from "@/db/schema";
import type {
  AgentCycleInput,
  AgentCycleResult,
  AgentPriority,
  BeliefDrift,
  BeliefFabricResult,
  CycleDelta,
  Domain,
  DomainDropEvent,
  Finding,
  Hypothesis,
  HypothesisResolution,
  LatentNodeId,
  LeadosEvent,
  LeadosMetrics,
  LeadosPerson,
  MetricBreachEvent,
  OrchestratorResult,
  RuleCalibrationRecord,
  UncertaintyFlag,
  WeeklyBriefing,
} from "./types";
import { DOMAINS, LATENT_NODES, LATENT_NODE_DOMAIN } from "./types";
import { CASCADE_PARENT_ORDER, LATENT_NODE_OBSERVABLES, runBeliefFabric } from "./beliefFabric";
import {
  detectBeliefDrift,
  getBeliefTrajectory,
  persistBeliefSnapshot,
} from "./temporalBeliefTracker";
import { runFullOrchestration } from "./orchestrator";
import { auditRuleAccuracy } from "./ruleEngine";
import { countRecentEventsForObservable } from "./signalFusion";
import { createHypothesisIfAbsent, getOpenHypothesesPastDue, resolveHypothesis, countOpenHypotheses } from "./hypothesis";
import type { HypothesisCandidate } from "./hypothesis";
import { triggerPlaybookForFinding, countPlaybooksTriggeredSince } from "./playbooksEngine";
import { getRuleByKey, updateRuleWeight } from "./ruleStore";
import { nudgeWeight } from "./selfImprove";
import { addDays, daysBetween } from "./temporal";
import { assertExactSentenceCount } from "./selfTest";

type Database = typeof defaultDb;

const CRITICAL_CASCADE_THRESHOLD = 0.6;
const DRIFT_RATE_THRESHOLD = 0.02;
const DRIFT_HORIZON_DAYS = 14;
const SLOW_STEP_WARNING_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────
// Step timing helper
// ─────────────────────────────────────────────────────────────────────────

async function timeStep<T>(
  name: string,
  timings: Record<string, number>,
  warnings: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    timings[name] = durationMs;
    if (durationMs > SLOW_STEP_WARNING_MS) {
      const msg = `WARNING: step "${name}" took ${durationMs}ms (> ${SLOW_STEP_WARNING_MS}ms budget)`;
      warnings.push(msg);
      console.warn(`[agentCore] ${msg}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Dataset loading (events/people/metrics for the belief fabric)
// ─────────────────────────────────────────────────────────────────────────

async function loadDataset(
  db: Database,
  now: Date,
): Promise<{ events: LeadosEvent[]; people: LeadosPerson[]; metrics: LeadosMetrics }> {
  const cutoff = new Date(now.getTime() - 60 * 86_400_000);
  const [eventRows, peopleRows, projectRows] = await Promise.all([
    db.select().from(eventsTable).where(gte(eventsTable.occurredAt, cutoff)),
    db.select().from(peopleTable),
    db.select().from(projectsTable),
  ]);

  const events: LeadosEvent[] = eventRows.map((r) => ({
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

  const people: LeadosPerson[] = peopleRows.map((p) => ({
    id: String(p.id),
    name: p.name,
    teamId: p.teamId ?? undefined,
    level: p.level ?? undefined,
    startDate: p.startDate ?? undefined,
    hasSuccessor: p.hasSuccessor ?? false,
    calendarLoadPct: p.calendarLoadPct ?? 0,
    status: p.status ?? "active",
    flightRiskScore: p.flightRiskScore ?? 0,
  }));

  const nodes = peopleRows.map((p) => ({
    personId: String(p.id),
    connections: events.filter((e) => String(e.personId) === String(p.id)).length,
  }));

  const metrics: LeadosMetrics = {
    decisionHealthIndex: { avgCycleTimeDays: 5 },
    orgNetwork: {
      nodes,
      isolatedCount: nodes.filter((n) => n.connections === 0).length,
      totalNodes: nodes.length,
    },
    projectConfidenceSnapshots: projectRows.map((p) => ({
      projectId: String(p.id),
      takenAt: now.toISOString(),
      confidence: (p.deliveryConfidence ?? 80) / 100,
    })),
    npsSnapshots: [],
  };

  return { events, people, metrics };
}

// ─────────────────────────────────────────────────────────────────────────
// Settings helper
// ─────────────────────────────────────────────────────────────────────────

async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

async function getSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 2 — Belief drift detection
// ─────────────────────────────────────────────────────────────────────────

function driftTitle(node: LatentNodeId, drift: BeliefDrift): string {
  const dateStr = drift.projectedCrossing ? drift.projectedCrossing.toISOString().slice(0, 10) : "unknown";
  const pct = (drift.ratePerDay * 100).toFixed(1);
  return `${node} on trajectory to critical by ${dateStr} (rate: +${pct}% per day)`;
}

async function detectAllDrifts(db: Database, now: Date): Promise<{ drifts: BeliefDrift[]; findings: Finding[] }> {
  const drifts: BeliefDrift[] = [];
  const findings: Finding[] = [];

  for (const node of LATENT_NODES) {
    const trajectory = await getBeliefTrajectory(db, node, DRIFT_HORIZON_DAYS);
    const drift = detectBeliefDrift(node, trajectory);
    const withinHorizon =
      drift.projectedCrossing !== null && daysBetween(now, drift.projectedCrossing) <= DRIFT_HORIZON_DAYS;

    if (drift.drifting && drift.ratePerDay > DRIFT_RATE_THRESHOLD && withinHorizon) {
      drifts.push(drift);
      const domain: Domain | string = node === "cascadeRisk" ? "strategy" : LATENT_NODE_DOMAIN[node];
      findings.push({
        id: randomUUID(),
        ruleKey: `DRIFT:${node}`,
        domain,
        severity: 4,
        title: driftTitle(node, drift),
        description: `Belief trajectory regression over the last ${DRIFT_HORIZON_DAYS} days shows ${node} rising at ${(
          drift.ratePerDay * 100
        ).toFixed(2)}%/day.`,
        createdAt: now.toISOString(),
      });
    }
  }

  return { drifts, findings };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 4 — Delta computation
// ─────────────────────────────────────────────────────────────────────────

function computeDelta(
  current: OrchestratorResult,
  driftFindings: Finding[],
  previous: AgentCycleResult | null,
): CycleDelta {
  const previousOrchestrator = previous?.orchestratorResult ?? null;
  const allCurrentFindings = [...current.findings, ...driftFindings];

  const previousRuleKeys = new Set((previousOrchestrator?.findings ?? []).map((f) => f.ruleKey));
  const newCritical = allCurrentFindings.filter(
    (f) => f.severity >= 4 && !previousRuleKeys.has(f.ruleKey),
  );

  const scoreDrop: DomainDropEvent[] = [];
  if (previousOrchestrator) {
    for (const domain of DOMAINS) {
      const prevScore = previousOrchestrator.domainHealth[domain]?.score;
      const curScore = current.domainHealth[domain]?.score;
      if (prevScore === undefined || curScore === undefined) continue;
      const drop = prevScore - curScore;
      if (drop > 10) {
        scoreDrop.push({ domain, previousScore: prevScore, currentScore: curScore, drop });
      }
    }
  }

  const beliefCrossings: LatentNodeId[] = [];
  if (previousOrchestrator) {
    for (const node of LATENT_NODES) {
      const prevP = previousOrchestrator.beliefs.posteriors[node]?.p ?? 0;
      const curP = current.beliefs.posteriors[node]?.p ?? 0;
      if (prevP < 0.6 && curP >= 0.6) {
        beliefCrossings.push(node);
      }
    }
  }

  const DOMAIN_SCORE_TARGET = 70;
  const metricBreaches: MetricBreachEvent[] = [];
  for (const domain of DOMAINS) {
    const score = current.domainHealth[domain]?.score;
    if (score === undefined) continue;
    const deviationPct = ((score - DOMAIN_SCORE_TARGET) / DOMAIN_SCORE_TARGET) * 100;
    if (Math.abs(deviationPct) > 15) {
      metricBreaches.push({
        metric: `domain.score.${domain}`,
        target: DOMAIN_SCORE_TARGET,
        actual: score,
        deviationPct,
      });
    }
  }

  return { newCritical, scoreDrop, beliefCrossings, metricBreaches };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 5 — Playbook auto-trigger
// ─────────────────────────────────────────────────────────────────────────

async function triggerPlaybooks(
  db: Database,
  delta: CycleDelta,
): Promise<{ triggered: AgentCycleResult["playbooksTriggered"] }> {
  const triggered: AgentCycleResult["playbooksTriggered"] = [];

  for (const finding of delta.newCritical) {
    const result = await triggerPlaybookForFinding(db, finding);

    if (result.triggered) {
      triggered.push(result.triggered);
      await db.insert(notificationsTable).values({
        severity: finding.severity,
        title: `Playbook auto-triggered: ${result.triggered.playbookName}`,
        message: `${finding.title} → ${result.triggered.playbookName} has been activated automatically.`,
      });
    } else if (!result.matched) {
      await db.insert(notificationsTable).values({
        severity: 3,
        title: "No playbook defined",
        message: `No playbook defined for ${finding.ruleKey}. Consider creating one.`,
      });
    }
    // result.alreadyActive: an instance is already running — no new
    // notification, per spec (only the two cases above require one).
  }

  return { triggered };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 6 — Hypothesis generation
// ─────────────────────────────────────────────────────────────────────────

async function generateHypotheses(
  db: Database,
  cycleId: string,
  now: Date,
  beliefs: BeliefFabricResult,
  orchestratorResult: OrchestratorResult,
  drifts: BeliefDrift[],
  scoreDrop: DomainDropEvent[],
): Promise<Hypothesis[]> {
  const created: Hypothesis[] = [];
  const candidates: HypothesisCandidate[] = [];

  // H1 — per-person flight risk
  for (const person of Object.values(orchestratorResult.flightRiskByPerson)) {
    if (person.p > 0.55) {
      candidates.push({
        key: `FLIGHT_RISK:${person.personId}`,
        entityId: person.personId,
        entityType: "person",
        claim: `${person.name} will leave within 30 days`,
        predictedBy: now,
        resolveBy: addDays(now, 30),
        metricToCheck: "person.status",
        threshold: 1, // 1 == "departed"
        ruleKey: "FLIGHT_RISK_ELEVATED",
      });
    }
  }

  // H2 — belief drift
  for (const drift of drifts) {
    if (!drift.projectedCrossing) continue;
    const projected = drift.projectedCrossing;
    candidates.push({
      key: `DRIFT:${drift.node}`,
      entityId: drift.node,
      entityType: "latent_node",
      claim: `${drift.node} will exceed 0.7 posterior by ${projected.toISOString().slice(0, 10)}`,
      predictedBy: now,
      resolveBy: addDays(projected, 3),
      metricToCheck: `belief.${drift.node}`,
      threshold: 0.7,
    });
  }

  // H3 — domain decline > 15
  for (const drop of scoreDrop) {
    if (drop.drop > 15) {
      candidates.push({
        key: `DOMAIN_DECLINE:${drop.domain}`,
        entityId: String(drop.domain),
        entityType: "domain",
        claim: `${drop.domain} health score will recover to within 10 of prior baseline by ${addDays(
          now,
          21,
        )
          .toISOString()
          .slice(0, 10)}`,
        predictedBy: now,
        resolveBy: addDays(now, 21),
        metricToCheck: `domain.score.${drop.domain}`,
        threshold: drop.previousScore - 10,
      });
    }
  }

  // H4 — causal chain confidence > 0.65 for cross-domain chain
  const order = CASCADE_PARENT_ORDER;
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to = order[i + 1];
    const fromDomain = LATENT_NODE_DOMAIN[from];
    const toDomain = LATENT_NODE_DOMAIN[to];
    if (fromDomain === toDomain) continue;
    const confidence = Math.min(beliefs.posteriors[from].p, beliefs.posteriors[to].p);
    if (confidence > 0.65) {
      candidates.push({
        key: `CASCADE:${from}:${to}`,
        entityId: `${from}:${to}`,
        entityType: "chain",
        claim: `Event cascade from ${from} → ${to} will produce a severity-4 finding within 14 days`,
        predictedBy: now,
        resolveBy: addDays(now, 14),
        metricToCheck: `finding.sev4.${toDomain}`,
        threshold: 1,
      });
    }
  }

  // H5 — delivery confidence dropped > 20
  for (const project of orchestratorResult.projects) {
    const drop = project.previousDeliveryConfidence - project.deliveryConfidence;
    if (drop > 20) {
      candidates.push({
        key: `DELIVERY_RISK:${project.id}`,
        entityId: String(project.id),
        entityType: "project",
        claim: `Project ${project.name} will miss its target date or require scope cut within 21 days`,
        predictedBy: now,
        resolveBy: addDays(now, 21),
        metricToCheck: `project.delivery.${project.id}`,
        threshold: 60,
      });
    }
  }

  // H6 — cascadeRisk.p > 0.5
  if (beliefs.cascadeRisk.p > 0.5) {
    candidates.push({
      key: `CASCADE_RISK_ELEVATED:${cycleId}`,
      entityId: cycleId,
      entityType: "system",
      claim: "An observable multi-domain cascade event will manifest (sev-5 finding across 2+ domains) within 7 days",
      predictedBy: now,
      resolveBy: addDays(now, 7),
      metricToCheck: "finding.sev5.cascade",
      threshold: 1,
      ruleKey: "CASCADE_RISK_CRITICAL",
    });
  }

  for (const candidate of candidates) {
    const hyp = await createHypothesisIfAbsent(db, candidate);
    if (hyp) created.push(hyp);
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 7 — Hypothesis resolution
// ─────────────────────────────────────────────────────────────────────────

async function resolveMetric(
  db: Database,
  metricToCheck: string,
  orchestratorResult: OrchestratorResult,
  beliefs: BeliefFabricResult,
): Promise<{ actual: number; direction: "gte" | "lte" }> {
  if (metricToCheck === "person.status") {
    return { actual: 0, direction: "gte" }; // overridden by caller (needs entityId)
  }
  if (metricToCheck.startsWith("belief.")) {
    const node = metricToCheck.slice("belief.".length) as LatentNodeId;
    return { actual: beliefs.posteriors[node]?.p ?? 0, direction: "gte" };
  }
  if (metricToCheck.startsWith("domain.score.")) {
    const domain = metricToCheck.slice("domain.score.".length);
    return { actual: orchestratorResult.domainHealth[domain]?.score ?? 0, direction: "gte" };
  }
  if (metricToCheck.startsWith("finding.sev4.")) {
    const domain = metricToCheck.slice("finding.sev4.".length);
    const count = orchestratorResult.findings.filter((f) => f.domain === domain && f.severity >= 4).length;
    return { actual: count > 0 ? 1 : 0, direction: "gte" };
  }
  if (metricToCheck === "finding.sev5.cascade") {
    const domainsHit = new Set(orchestratorResult.findings.filter((f) => f.severity >= 5).map((f) => f.domain));
    return { actual: domainsHit.size >= 2 ? 1 : 0, direction: "gte" };
  }
  if (metricToCheck.startsWith("project.delivery.")) {
    const projectId = Number(metricToCheck.slice("project.delivery.".length));
    const project = orchestratorResult.projects.find((p) => p.id === projectId);
    return { actual: project?.deliveryConfidence ?? 100, direction: "lte" };
  }
  void db;
  return { actual: 0, direction: "gte" };
}

async function resolveHypotheses(
  db: Database,
  now: Date,
  orchestratorResult: OrchestratorResult,
  beliefs: BeliefFabricResult,
): Promise<{ resolutions: HypothesisResolution[]; calibrations: RuleCalibrationRecord[] }> {
  const resolutions: HypothesisResolution[] = [];
  const calibrations: RuleCalibrationRecord[] = [];

  const pastDue = await getOpenHypothesesPastDue(db, now);

  for (const hyp of pastDue) {
    const threshold = hyp.threshold ?? 0;
    let realActual: number;
    let confirmed: boolean;

    if (hyp.metricToCheck === "person.status") {
      const personId = Number(hyp.entityId);
      const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, personId)).limit(1);
      realActual = person?.status === "departed" ? 1 : 0;
      confirmed = realActual >= threshold;
    } else {
      const { actual, direction } = await resolveMetric(db, hyp.metricToCheck ?? "", orchestratorResult, beliefs);
      realActual = actual;
      // "gte" metrics confirm when actual crosses up through the threshold;
      // "lte" metrics (e.g. delivery confidence staying low) confirm when
      // actual stays at/under the threshold.
      confirmed = direction === "lte" ? actual <= threshold : actual >= threshold;
    }

    const status = confirmed ? "confirmed" : "refuted";
    const outcomeNote = confirmed
      ? `Confirmed: actual value ${realActual} vs threshold ${threshold}`
      : `Refuted: actual value ${realActual}, threshold ${threshold} was not crossed`;

    await resolveHypothesis(db, hyp.id, status, outcomeNote, realActual, now);

    resolutions.push({
      hypothesisId: hyp.id,
      key: hyp.key,
      status,
      outcomeNote,
      actualValue: realActual,
      threshold,
      ruleKey: hyp.ruleKey ?? null,
    });

    if (hyp.ruleKey) {
      const rule = await getRuleByKey(db, hyp.ruleKey);
      if (rule) {
        const factor = confirmed ? 1.1 : 0.9;
        const newWeight = nudgeWeight(rule.weight, factor);
        await updateRuleWeight(db, rule.key, newWeight);
        calibrations.push({
          ruleKey: rule.key,
          oldWeight: rule.weight,
          newWeight,
          reason: confirmed ? "hypothesis_confirmed" : "hypothesis_refuted",
          hypothesisId: hyp.id,
        });
      }
    }
  }

  return { resolutions, calibrations };
}

async function runMorningCalibrationAudit(db: Database): Promise<RuleCalibrationRecord[]> {
  const reports = await auditRuleAccuracy(db, 90);
  const calibrations: RuleCalibrationRecord[] = [];

  for (const report of reports) {
    if (report.recommendedWeightAdjustment === "none") continue;
    const rule = await getRuleByKey(db, report.ruleKey);
    if (!rule) continue;
    const factor = report.recommendedWeightAdjustment === "increase" ? 1.1 : 0.9;
    const newWeight = nudgeWeight(rule.weight, factor);
    await updateRuleWeight(db, rule.key, newWeight);
    calibrations.push({
      ruleKey: rule.key,
      oldWeight: rule.weight,
      newWeight,
      reason: "brier_audit",
    });
  }

  return calibrations;
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 8 — Morning briefing
// ─────────────────────────────────────────────────────────────────────────

function isMorningWindow(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= 6 && hour <= 8;
}

async function buildMorningBriefing(
  db: Database,
  now: Date,
  orchestratorResult: OrchestratorResult,
  delta: CycleDelta,
  drifts: BeliefDrift[],
  uncertaintyFlags: UncertaintyFlag[],
): Promise<WeeklyBriefing> {
  const overallScore = Math.round(
    Object.values(orchestratorResult.domainHealth).reduce((acc, d) => acc + d.score, 0) /
      Math.max(1, Object.values(orchestratorResult.domainHealth).length),
  );
  const trendWord = overallScore >= 70 ? "stable" : overallScore >= 50 ? "softening" : "deteriorating";

  const top3Priorities = [...delta.newCritical].sort((a, b) => b.severity - a.severity).slice(0, 3);
  const top3Risks = [...drifts].sort((a, b) => b.ratePerDay - a.ratePerDay).slice(0, 3);

  const dominantRiskSentence = top3Priorities[0]
    ? `The dominant risk is "${top3Priorities[0].title}" in the ${top3Priorities[0].domain} domain.`
    : `The dominant risk is ${orchestratorResult.beliefs.dominantRisk} at ${Math.round(
        orchestratorResult.beliefs.posteriors[orchestratorResult.beliefs.dominantRisk].p * 100,
      )}% posterior probability.`;

  const actionSentence = top3Priorities[0]
    ? `The most important action is to confirm the auto-triggered playbook response for "${top3Priorities[0].title}" is staffed within 48 hours.`
    : `The most important action is to review open hypotheses and close the highest-confidence gaps identified below.`;

  const executiveSummary = [
    `Overall organizational health is ${overallScore}/100 and ${trendWord}.`,
    dominantRiskSentence,
    actionSentence,
  ].join(" ");

  assertExactSentenceCount(executiveSummary, 3, "executiveSummary");

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const decisionsNeeded = orchestratorResult.decisions.filter(
    (d) =>
      d.status === "open" &&
      d.confidence < 40 &&
      d.deadline !== null &&
      daysBetween(now, d.deadline) < 7,
  );
  const playbooksActive = await countPlaybooksTriggeredSince(db, sevenDaysAgo);
  const hypothesesPending = await countOpenHypotheses(db);

  let uncertaintyStatement = "The system has 0 open hypotheses and is well-calibrated across all tracked domains.";
  if (uncertaintyFlags.length > 0) {
    const worst = [...uncertaintyFlags].sort((a, b) => a.confidence - b.confidence)[0];
    const domain = worst.node === "cascadeRisk" ? "strategy" : LATENT_NODE_DOMAIN[worst.node];
    const signalType = worst.missingSignals[0] ?? "event";
    uncertaintyStatement = `The system has ${hypothesesPending} open hypotheses and is most uncertain about ${domain}. Collecting more ${signalType} data would reduce uncertainty most.`;
  }

  const briefing: WeeklyBriefing = {
    briefingDate: now.toISOString().slice(0, 10),
    executiveSummary,
    top3Priorities,
    top3Risks,
    decisionsNeeded,
    playbooksActive,
    hypothesesPending,
    uncertaintyStatement,
  };

  await db
    .insert(weeklyBriefings)
    .values({
      briefingDate: briefing.briefingDate,
      executiveSummary: briefing.executiveSummary,
      top3Priorities: briefing.top3Priorities,
      top3Risks: briefing.top3Risks,
      decisionsNeeded: briefing.decisionsNeeded,
      playbooksActive: briefing.playbooksActive,
      hypothesesPending: briefing.hypothesesPending,
      uncertaintyStatement: briefing.uncertaintyStatement,
    });

  return briefing;
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 9 — Uncertainty flagging
// ─────────────────────────────────────────────────────────────────────────

function computeUncertaintyFlags(beliefs: BeliefFabricResult, events: LeadosEvent[], now: Date): UncertaintyFlag[] {
  const flags: UncertaintyFlag[] = [];

  for (const node of LATENT_NODES) {
    const marginal = beliefs.posteriors[node];
    if (marginal.confidence >= 0.5) continue;

    const observableParents = node === "cascadeRisk" ? [] : LATENT_NODE_OBSERVABLES[node];
    const missingSignals = observableParents.filter(
      (obs) => countRecentEventsForObservable(events, obs, now, 30) < 3,
    );

    const recommendation =
      missingSignals.length > 0
        ? `Log more ${missingSignals[0]} data (3+ recent events) to improve ${node} confidence.`
        : `Collect more direct observation events for ${node}; current confidence is ${Math.round(
            marginal.confidence * 100,
          )}%.`;

    flags.push({ node, confidence: marginal.confidence, missingSignals, recommendation });
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────
// Main cycle
// ─────────────────────────────────────────────────────────────────────────

export async function runAgentCycle(input: AgentCycleInput): Promise<AgentCycleResult> {
  const db = input.db as Database;
  const now = input.now;
  const cycleId = randomUUID();
  const startedAt = new Date();

  const stepTimingsMs: Record<string, number> = {};
  const warnings: string[] = [];

  // ---- STEP 1: Belief fabric ----
  const { beliefResult, priority, events: datasetEvents } = await timeStep(
    "step1_beliefFabric",
    stepTimingsMs,
    warnings,
    async () => {
      const { events, people, metrics } = await loadDataset(db, now);
      const beliefResult = runBeliefFabric(events, people, metrics, now);
      await persistBeliefSnapshot(beliefResult, db);

      const priority: AgentPriority =
        beliefResult.cascadeRisk.p > CRITICAL_CASCADE_THRESHOLD
          ? "critical"
          : beliefResult.cascadeRisk.p > 0.4
            ? "elevated"
            : "normal";

      await setSetting(db, "agent.priority", priority);
      await setSetting(db, "agent.next_interval_ms", priority === "critical" ? "600000" : "1800000");

      return { beliefResult, priority, events };
    },
  );

  // ---- STEP 2: Belief drift detection ----
  const { drifts, findings: driftFindings } = await timeStep(
    "step2_driftDetection",
    stepTimingsMs,
    warnings,
    () => detectAllDrifts(db, now),
  );

  // ---- STEP 3: Full orchestration ----
  const orchestratorResult = await timeStep("step3_orchestration", stepTimingsMs, warnings, () =>
    runFullOrchestration(db, beliefResult, now, cycleId),
  );

  // ---- STEP 4: Delta computation ----
  const delta = await timeStep("step4_delta", stepTimingsMs, warnings, async () =>
    computeDelta(orchestratorResult, driftFindings, input.previousCycle),
  );

  // ---- STEP 5: Playbook auto-trigger ----
  const { triggered: playbooksTriggered } = await timeStep(
    "step5_playbooks",
    stepTimingsMs,
    warnings,
    () => triggerPlaybooks(db, delta),
  );

  // ---- STEP 6: Hypothesis generation ----
  const hypothesesCreated = await timeStep("step6_hypotheses", stepTimingsMs, warnings, () =>
    generateHypotheses(db, cycleId, now, beliefResult, orchestratorResult, drifts, delta.scoreDrop),
  );

  // ---- STEP 7: Hypothesis resolution (+ morning-only Brier audit) ----
  const { resolutions: hypothesesResolved, calibrations: hypothesisCalibrations } = await timeStep(
    "step7_hypothesisResolution",
    stepTimingsMs,
    warnings,
    () => resolveHypotheses(db, now, orchestratorResult, beliefResult),
  );

  let rulesCalibrated = [...hypothesisCalibrations];
  const morning = isMorningWindow(now);
  if (morning) {
    const auditCalibrations = await timeStep("step7b_morningAudit", stepTimingsMs, warnings, () =>
      runMorningCalibrationAudit(db),
    );
    rulesCalibrated = [...rulesCalibrated, ...auditCalibrations];
  }

  // ---- Uncertainty flags (reuses STEP 1's event dataset; conceptually
  // this is STEP 9's output, computed ahead of STEP 8 so the briefing can
  // reference it). ----
  const uncertaintyFlags = computeUncertaintyFlags(beliefResult, datasetEvents, now);

  // ---- STEP 8: Morning briefing ----
  let briefingUpdated = false;
  if (morning) {
    await timeStep("step8_morningBriefing", stepTimingsMs, warnings, async () => {
      await buildMorningBriefing(db, now, orchestratorResult, delta, drifts, uncertaintyFlags);
      briefingUpdated = true;
    });
  }

  const completedAt = new Date();

  const result: AgentCycleResult = {
    cycleId,
    startedAt,
    completedAt,
    priority,
    beliefResult,
    orchestratorResult,
    driftsDetected: drifts,
    playbooksTriggered,
    hypothesesCreated,
    hypothesesResolved,
    rulesCalibrated,
    briefingUpdated,
    uncertaintyFlags,
    deltaVsPrevious: delta,
    stepTimingsMs,
    warnings,
  };

  const totalMs = completedAt.getTime() - startedAt.getTime();
  if (totalMs > 15000) {
    warnings.push(`WARNING: full cycle took ${totalMs}ms (> 15000ms target for a 100-person org)`);
    console.warn(`[agentCore] cycle ${cycleId} exceeded 15s budget: ${totalMs}ms`);
  }

  return result;
}

export async function loadPreviousCycleFromDb(db: Database): Promise<AgentCycleResult | null> {
  const rows = await db.select().from(agentCycles).orderBy(desc(agentCycles.startedAt)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const parsed = row.cycleResult as AgentCycleResult;
  return {
    ...parsed,
    startedAt: new Date(row.startedAt),
    completedAt: new Date(row.completedAt),
  };
}

export async function persistCycleResult(db: Database, result: AgentCycleResult): Promise<void> {
  await db.insert(agentCycles).values({
    id: result.cycleId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    cascadeRisk: result.beliefResult.cascadeRisk.p,
    priority: result.priority,
    findingsDelta: result.deltaVsPrevious?.newCritical.length ?? 0,
    playbooksTriggered: result.playbooksTriggered.length,
    hypothesesCreated: result.hypothesesCreated.length,
    hypothesesResolved: result.hypothesesResolved.length,
    cycleResult: result,
  });
}
