// Autonomous agent loop. This is what turns the on-demand orchestrator into
// a system that genuinely runs on a schedule, calibrates its own rules, and
// generates/resolves testable hypotheses without manual intervention.

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { agentAuditLog, domains, people } from "@/db/schema";
import { runFullOrchestration, type OrchestratorResult } from "./orchestrator";
import { calibrateRules, applyHypothesisResolutionNudge, type RuleCalibrationOutcome } from "./selfImprove";
import {
  createHypothesis,
  listOpenHypotheses,
  resolveHypothesisRow,
  type HypothesisRow,
} from "./hypothesis";

type Database = typeof defaultDb;

export interface AgentAuditEntry {
  runId: string;
  startedAt: string;
  durationMs: number;
  stagesCompleted: string[];
  findingsDelta: number;
  rulesCalibrated: number;
  hypothesesGenerated: number;
  hypothesesResolved: number;
}

export interface AgentCycleResult {
  orchestration: OrchestratorResult;
  calibration: RuleCalibrationOutcome[];
  hypothesesGenerated: HypothesisRow[];
  hypothesesResolved: Array<{ id: number; status: "confirmed" | "refuted" }>;
  audit: AgentAuditEntry;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hypothesis generation
// ---------------------------------------------------------------------------

/**
 * Inspects an OrchestratorResult for anomalies/signals and auto-inserts
 * testable hypotheses (deduplicated by key+entity via createHypothesis).
 * Implements the three generation rules from the task spec exactly.
 */
export async function generateHypotheses(
  result: OrchestratorResult,
  db: Database = defaultDb,
): Promise<HypothesisRow[]> {
  const created: HypothesisRow[] = [];
  const now = new Date();

  // Rule 1: elevated flight risk (> 0.6) -> person may leave within 30 days.
  for (const person of result.findings.flightRisks) {
    if (person.flightRiskScore <= 0.6) continue;

    const key = `FLIGHT_RISK_ELEVATED:${person.personId}`;
    const row = await createHypothesis(db, {
      key,
      entityId: String(person.personId),
      entityType: "person",
      claim: `${person.name} will leave within 30 days`,
      ruleKey: "FLIGHT_RISK_THRESHOLD",
      predictedBy: now,
      resolveBy: new Date(now.getTime() + THIRTY_DAYS_MS),
      context: { flightRiskScoreAtCreation: person.flightRiskScore },
    });
    if (row) created.push(row);
  }

  // Rule 2: domain health score drops > 15 points vs prior run -> recovery hypothesis.
  for (const domainFinding of result.findings.domainHealth) {
    if (domainFinding.delta >= -15) continue;

    const key = `DOMAIN_HEALTH_DROP:${domainFinding.domainId}`;
    const row = await createHypothesis(db, {
      key,
      entityId: String(domainFinding.domainId),
      entityType: "domain",
      claim: `${domainFinding.name} domain score will recover above prior baseline within 30 days`,
      ruleKey: "DOMAIN_HEALTH_DROP",
      predictedBy: now,
      resolveBy: new Date(now.getTime() + THIRTY_DAYS_MS),
      context: { baselineHealth: domainFinding.priorHealthScore, droppedToHealth: domainFinding.healthScore },
    });
    if (row) created.push(row);
  }

  // Rule 3: cross-domain causal chain with confidence > 0.7 -> cascade hypothesis.
  for (const chain of result.findings.causalChains) {
    if (chain.confidence <= 0.7) continue;
    if (chain.cause.domainId === chain.effect.domainId) continue; // must be cross-domain

    const key = `CROSS_DOMAIN_CASCADE:${chain.id}`;
    // Capture the effect domain's health at creation time as the baseline the
    // cascade would need to worsen from in order to "materialize".
    const effectDomainRow = result.findings.domainHealth.find((d) => d.domainId === chain.effect.domainId);
    const row = await createHypothesis(db, {
      key,
      entityId: String(chain.id),
      entityType: "causal_chain",
      claim: `Cross-domain cascade from ${chain.cause.domain} to ${chain.effect.domain} will materialize within 14 days`,
      ruleKey: "CAUSAL_CHAIN_CONFIDENCE",
      predictedBy: now,
      resolveBy: new Date(now.getTime() + FOURTEEN_DAYS_MS),
      context: {
        effectDomainId: chain.effect.domainId,
        baselineEffectHealth: effectDomainRow?.healthScore ?? null,
      },
    });
    if (row) created.push(row);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Hypothesis resolution
// ---------------------------------------------------------------------------

interface HypothesisContext {
  flightRiskScoreAtCreation?: number;
  baselineHealth?: number;
  droppedToHealth?: number;
  effectDomainId?: number;
  baselineEffectHealth?: number | null;
}

/**
 * Resolves every open hypothesis whose resolve_by has passed, using current
 * metric/event data as the ground truth. Nudges the associated rule's
 * weight in the direction of confirmation via selfImprove.ts.
 */
export async function resolveHypotheses(
  db: Database = defaultDb,
  now: Date = new Date(),
): Promise<Array<{ id: number; status: "confirmed" | "refuted" }>> {
  const open = await listOpenHypotheses(db);
  const due = open.filter((h) => h.resolveBy.getTime() <= now.getTime());
  const resolved: Array<{ id: number; status: "confirmed" | "refuted" }> = [];

  for (const hypothesis of due) {
    const context = (hypothesis.context ?? {}) as HypothesisContext;
    let confirmed = false;
    let outcomeValue: Record<string, unknown> = {};

    if (hypothesis.entityType === "person") {
      const personId = Number(hypothesis.entityId);
      const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
      if (!person) {
        // Person record no longer present — treat as having left (confirmed).
        confirmed = true;
        outcomeValue = { reason: "person_record_missing" };
      } else {
        // Proxy for "left": flight risk never subsided below the threshold.
        confirmed = person.flightRiskScore > 0.6;
        outcomeValue = {
          flightRiskScoreAtCreation: context.flightRiskScoreAtCreation ?? null,
          flightRiskScoreAtResolution: person.flightRiskScore,
        };
      }
    } else if (hypothesis.entityType === "domain") {
      const domainId = Number(hypothesis.entityId);
      const [domainRow] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
      const baseline = context.baselineHealth ?? 100;
      const currentHealth = domainRow?.healthScore ?? 0;
      confirmed = currentHealth > baseline;
      outcomeValue = { baselineHealth: baseline, healthAtResolution: currentHealth };
    } else if (hypothesis.entityType === "causal_chain") {
      const effectDomainId = context.effectDomainId;
      const baselineEffectHealth = context.baselineEffectHealth ?? null;
      if (effectDomainId != null && baselineEffectHealth != null) {
        const [effectDomainRow] = await db.select().from(domains).where(eq(domains.id, effectDomainId)).limit(1);
        const currentEffectHealth = effectDomainRow?.healthScore ?? baselineEffectHealth;
        // Cascade "materializes" if the effect domain's health worsened
        // meaningfully (>10 pts) relative to its baseline at prediction time.
        // UNVERIFIED: threshold not given by the task spec; chosen to mirror
        // the >15-point domain-health-drop threshold used elsewhere, scaled
        // down slightly for the shorter 14-day resolution window.
        confirmed = currentEffectHealth <= baselineEffectHealth - 10;
        outcomeValue = { baselineEffectHealth, effectHealthAtResolution: currentEffectHealth };
      } else {
        confirmed = false;
        outcomeValue = { reason: "missing_context" };
      }
    }

    const status = confirmed ? "confirmed" : "refuted";
    await resolveHypothesisRow(db, hypothesis.id, status, outcomeValue);
    await applyHypothesisResolutionNudge(db, hypothesis.ruleKey, confirmed);
    resolved.push({ id: hypothesis.id, status });
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Agent cycle + scheduling
// ---------------------------------------------------------------------------

async function getPreviousFindingsCount(db: Database, excludeRunId: string): Promise<number | null> {
  const rows = await db
    .select()
    .from(agentAuditLog)
    .orderBy(agentAuditLog.createdAt)
    .limit(1000);
  const previous = rows
    .filter((r) => r.runId !== excludeRunId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!previous) return null;
  const payload = previous.payload as { findingsCountSnapshot?: number } | null;
  return payload?.findingsCountSnapshot ?? null;
}

/**
 * Runs one full agent cycle: orchestration -> rule calibration -> hypothesis
 * generation -> hypothesis resolution -> structured audit log entry.
 */
export async function runAgentCycle(db: Database = defaultDb): Promise<AgentCycleResult> {
  const cycleStart = Date.now();

  const orchestration = await runFullOrchestration(db);
  const previousFindingsCount = await getPreviousFindingsCount(db, orchestration.runId);
  const findingsDelta =
    previousFindingsCount === null ? 0 : orchestration.findingsCount - previousFindingsCount;

  const calibration = await calibrateRules(orchestration, db);
  const hypothesesGenerated = await generateHypotheses(orchestration, db);
  const hypothesesResolved = await resolveHypotheses(db, new Date());

  const audit: AgentAuditEntry = {
    runId: orchestration.runId,
    startedAt: orchestration.startedAt,
    durationMs: Date.now() - cycleStart,
    stagesCompleted: orchestration.stagesCompleted,
    findingsDelta,
    rulesCalibrated: calibration.filter((c) => c.calibrated).length,
    hypothesesGenerated: hypothesesGenerated.length,
    hypothesesResolved: hypothesesResolved.length,
  };

  await db.insert(agentAuditLog).values({
    runId: orchestration.runId,
    payload: { ...audit, findingsCountSnapshot: orchestration.findingsCount } as never,
  });

  return { orchestration, calibration, hypothesesGenerated, hypothesesResolved, audit };
}

/**
 * Starts a true interval-based schedule for the agent loop (as opposed to
 * relying solely on an on-demand POST from a browser poller). Returns a
 * cleanup function that stops the loop.
 */
export function scheduleLoop(intervalMs: number, db: Database = defaultDb): () => void {
  let running = false;

  const tick = () => {
    if (running) return; // avoid overlapping runs if a cycle takes longer than the interval
    running = true;
    runAgentCycle(db)
      .catch((err) => {
        console.error("[autonomousAgent] cycle failed", err);
      })
      .finally(() => {
        running = false;
      });
  };

  const handle = setInterval(tick, intervalMs);
  // Kick off an immediate run so the schedule doesn't wait a full interval
  // before producing its first result.
  tick();

  return () => clearInterval(handle);
}
