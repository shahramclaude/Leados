// agentLoop.ts — THE MASTER AUTONOMOUS AGENT
//
// Implements the 10-step intelligence cycle described in the Part 4 spec:
//   1. Full brain projection        6. Playbook auto-trigger
//   2. Belief state update          7. Morning briefing
//   3. Hypothesis generation        8. Uncertainty mapping
//   4. Hypothesis resolution        9. Delta broadcast
//   5. Rule calibration            10. Cycle audit
//
// Every step is wrapped so a failure in one step does not prevent the rest
// of the cycle from attempting to run (status becomes "partial"). Step 1 is
// the only hard dependency — if it fails there is no projection to drive the
// rest of the cycle, so the cycle short-circuits as "failed".

import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, like, lt } from "drizzle-orm";
import {
  agentCycles,
  agentDelta,
  beliefSnapshots,
  briefings,
  events as eventsTable,
  hypotheses as hypothesesTable,
  hypothesisResolutions,
  notifications,
  playbookInstances,
  settings,
} from "@/db/schema";
import * as eventBrain from "./eventBrain";
import * as causalInference from "./causalInference";
import {
  DOMAIN_SIGNAL_EVENT_TYPES,
  RULES,
  RULES_BY_ID,
  severityFromScore,
} from "./ruleEngine";
import {
  DOMAINS,
  type AgentConfig,
  type AgentCycleInput,
  type AgentCycleResult,
  type AgentError,
  type BeliefUpdate,
  type BrainFindings,
  type CausalCascade,
  type Decision,
  type Domain,
  type DriftAlert,
  type DrizzleDB,
  type EventRecord,
  type Finding,
  type Hypothesis,
  type HypothesisResolution,
  type MorningBriefing,
  type Priority,
  type Projection,
  type Risk,
  type RuleCalibration,
  type StepResult,
  type TriggeredPlaybook,
  type UncertaintyFlag,
} from "./types";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  normalIntervalMs: 30 * 60 * 1000,
  criticalIntervalMs: 10 * 60 * 1000,
  morningBriefingHour: 7,
  hypothesisLookbackDays: 90,
  calibrationLookbackDays: 30,
  maxPlaybookAutoTriggers: 3,
};

// ─────────────────────────────────────────────────────────────────────────
// small helpers
// ─────────────────────────────────────────────────────────────────────────

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

async function timeStep<T>(
  step: string,
  fn: () => Promise<{ data: T; summary: string; status?: StepResult["status"] }>,
): Promise<{ data: T | null; stepResult: StepResult; error: AgentError | null }> {
  const t0 = Date.now();
  try {
    const { data, summary, status } = await fn();
    return {
      data,
      stepResult: {
        step,
        status: status ?? "success",
        durationMs: Date.now() - t0,
        summary,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      stepResult: {
        step,
        status: "failed",
        durationMs: Date.now() - t0,
        summary: `${step} failed: ${message}`,
        error: message,
      },
      error: { step, message },
    };
  }
}

async function getSetting(db: DrizzleDB, key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(db: DrizzleDB, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function getRuleWeights(db: DrizzleDB): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(settings)
    .where(like(settings.key, "rule.weight.%"));
  const weights: Record<string, number> = {};
  for (const row of rows) {
    const ruleId = row.key.replace("rule.weight.", "");
    const parsed = Number(row.value);
    weights[ruleId] = Number.isFinite(parsed) ? parsed : 1;
  }
  return weights;
}

function dbEventToRecord(row: typeof eventsTable.$inferSelect): EventRecord {
  return {
    id: row.id,
    type: row.type,
    domain: row.domain,
    personId: row.personId,
    entityId: row.entityId,
    entityType: row.entityType,
    severity: row.severity,
    title: row.title,
    payload: row.payload ?? null,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 1 — FULL BRAIN PROJECTION
// ─────────────────────────────────────────────────────────────────────────

interface Step1Output {
  P: Projection;
  brainFindings: BrainFindings;
  cascadesDetected: CausalCascade[];
}

async function step1BrainProjection(
  db: DrizzleDB,
  now: Date,
  config: AgentConfig,
): Promise<{ data: Step1Output; summary: string }> {
  const cutoff = addDays(now, -(config.hypothesisLookbackDays + 14));
  const rows = await db
    .select()
    .from(eventsTable)
    .where(gte(eventsTable.occurredAt, cutoff))
    .orderBy(asc(eventsTable.occurredAt));

  const records = rows.map(dbEventToRecord);
  const ruleWeights = await getRuleWeights(db);

  const P = eventBrain.project(records, now, config.hypothesisLookbackDays);
  const brainFindings = eventBrain.run(P, now, ruleWeights);
  const cascadesDetected = causalInference.detectAll(P, brainFindings);

  return {
    data: { P, brainFindings, cascadesDetected },
    summary: `Projected ${records.length} events across ${DOMAINS.length} domains — org health ${brainFindings.orgHealthScore}, ${brainFindings.findings.length} findings, ${cascadesDetected.length} cascades.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 2 — BELIEF STATE UPDATE
// ─────────────────────────────────────────────────────────────────────────

function olsSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

interface Step2Output {
  beliefsUpdated: BeliefUpdate[];
  driftsDetected: DriftAlert[];
}

async function step2BeliefUpdate(
  db: DrizzleDB,
  now: Date,
  brainFindings: BrainFindings,
  cascadesDetected: CausalCascade[],
): Promise<{ data: Step2Output; summary: string }> {
  const beliefsUpdated: BeliefUpdate[] = [];
  const driftsDetected: DriftAlert[] = [];

  // amplify posteriors of "to" domains for active cascades
  const amplification: Record<string, number> = {};
  for (const domain of DOMAINS) amplification[domain] = 1;
  for (const cascade of cascadesDetected) {
    amplification[cascade.to] = (amplification[cascade.to] ?? 1) * cascade.amplificationFactor;
  }

  const fourteenDaysAgo = addDays(now, -14);

  for (const domain of DOMAINS) {
    const dm = brainFindings.domainMetrics[domain];
    const history = await db
      .select()
      .from(beliefSnapshots)
      .where(and(eq(beliefSnapshots.domain, domain), gte(beliefSnapshots.snapshotAt, fourteenDaysAgo)))
      .orderBy(asc(beliefSnapshots.snapshotAt));

    const previousPosterior = history.length ? history[history.length - 1].posterior : null;

    // drift detection via OLS slope on posterior over time
    if (history.length >= 2) {
      const t0 = history[0].snapshotAt.getTime();
      const points = history.map((h) => ({
        x: (h.snapshotAt.getTime() - t0) / 86400000,
        y: h.posterior,
      }));
      const slope = olsSlope(points);
      const projectedChange14d = slope * 14;
      if (projectedChange14d > 0.15) {
        const current = previousPosterior ?? dm.posterior;
        let projectedAt: Date | null = null;
        if (slope > 0 && current < 0.7) {
          const daysToThreshold = (0.7 - current) / slope;
          if (Number.isFinite(daysToThreshold) && daysToThreshold >= 0) {
            projectedAt = addDays(now, daysToThreshold);
          }
        }
        driftsDetected.push({ domain, slope, projectedChange14d, projectedAt });
      }
    }

    const amplifiedBy = amplification[domain] ?? 1;
    const newPosterior = clamp(dm.posterior * amplifiedBy, 0, 1);

    beliefsUpdated.push({ domain, previousPosterior, newPosterior, amplifiedBy });

    await db.insert(beliefSnapshots).values({
      snapshotAt: now,
      domain,
      score: dm.score,
      velocity: dm.velocity,
      posterior: newPosterior,
      eventCount: dm.eventCount,
    });
  }

  return {
    data: { beliefsUpdated, driftsDetected },
    summary: `Updated belief snapshots for ${DOMAINS.length} domains, detected ${driftsDetected.length} drift alert(s).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 3 — HYPOTHESIS GENERATION
// ─────────────────────────────────────────────────────────────────────────

async function hasOpenHypothesis(db: DrizzleDB, key: string): Promise<boolean> {
  const rows = await db
    .select({ id: hypothesesTable.id })
    .from(hypothesesTable)
    .where(and(eq(hypothesesTable.key, key), eq(hypothesesTable.status, "open")))
    .limit(1);
  return rows.length > 0;
}

async function createHypothesis(
  db: DrizzleDB,
  now: Date,
  h: Omit<Hypothesis, "id" | "status" | "outcomeNote" | "predictedAt"> & { predictedAt?: Date },
): Promise<Hypothesis> {
  const id = `hyp_${randomUUID()}`;
  const predictedAt = h.predictedAt ?? now;
  await db.insert(hypothesesTable).values({
    id,
    key: h.key,
    entityId: h.entityId,
    entityType: h.entityType,
    ruleId: h.ruleId,
    domain: h.domain,
    claim: h.claim,
    predictedAt,
    resolveBy: h.resolveBy,
    threshold: h.threshold,
    metricToCheck: h.metricToCheck,
    status: "open",
    createdAt: now,
  });
  return {
    id,
    key: h.key,
    entityId: h.entityId,
    entityType: h.entityType,
    ruleId: h.ruleId,
    domain: h.domain,
    claim: h.claim,
    predictedAt,
    resolveBy: h.resolveBy,
    threshold: h.threshold,
    metricToCheck: h.metricToCheck,
    status: "open",
    outcomeNote: null,
  };
}

async function step3HypothesisGeneration(
  db: DrizzleDB,
  now: Date,
  P: Projection,
  brainFindings: BrainFindings,
  cascadesDetected: CausalCascade[],
): Promise<{ data: Hypothesis[]; summary: string }> {
  const created: Hypothesis[] = [];

  // H_FLIGHT_RISK
  for (const person of Object.values(P.people)) {
    if (person.flightRiskCount < 3) continue;
    const key = `FLIGHT:${person.personId}`;
    if (await hasOpenHypothesis(db, key)) continue;
    created.push(
      await createHypothesis(db, now, {
        key,
        entityId: person.personId,
        entityType: "person",
        ruleId: "P02",
        domain: "attrition",
        claim: `${person.name} will leave within 30 days`,
        resolveBy: addDays(now, 30),
        threshold: null,
        metricToCheck: "flightRiskResolved",
      }),
    );
  }

  // H_RUNWAY_CRITICAL
  const runwayFinding = brainFindings.findings.find((f) => f.ruleId === "F01" && f.severity >= 4);
  if (runwayFinding) {
    const period = now.toISOString().slice(0, 7); // YYYY-MM
    const key = `RUNWAY_CRITICAL:${period}`;
    if (!(await hasOpenHypothesis(db, key))) {
      created.push(
        await createHypothesis(db, now, {
          key,
          entityId: null,
          entityType: null,
          ruleId: "F01",
          domain: "financial",
          claim:
            "Organization will require new funding within 60 days or reduce headcount",
          resolveBy: addDays(now, 60),
          threshold: 4,
          metricToCheck: "financialScore",
        }),
      );
    }
  }

  // H_CASCADE_MATERIALIZES
  for (const cascade of cascadesDetected) {
    if (cascade.confidence <= 0.6) continue;
    const key = `CASCADE:${cascade.from}:${cascade.to}`;
    if (await hasOpenHypothesis(db, key)) continue;
    const toRuleName = cascade.toRuleId
      ? (RULES_BY_ID[cascade.toRuleId]?.name ?? cascade.toRuleId)
      : `${cascade.to} findings`;
    const fromRuleName = cascade.fromRuleId
      ? (RULES_BY_ID[cascade.fromRuleId]?.name ?? cascade.fromRuleId)
      : `${cascade.from} findings`;
    created.push(
      await createHypothesis(db, now, {
        key,
        entityId: null,
        entityType: null,
        ruleId: cascade.toRuleId,
        domain: cascade.to,
        claim: `Finding ${toRuleName} will escalate to sev>=4 within ${cascade.lagDays.max} days due to cascade from ${fromRuleName}`,
        resolveBy: addDays(now, cascade.lagDays.max),
        threshold: 4,
        metricToCheck: "toDomainSeverity",
      }),
    );
  }

  // H_DOMAIN_RECOVERY
  for (const domain of DOMAINS) {
    const dm = brainFindings.domainMetrics[domain];
    if (dm.velocity >= -0.05) continue;
    const key = `RECOVERY:${domain}`;
    if (await hasOpenHypothesis(db, key)) continue;
    created.push(
      await createHypothesis(db, now, {
        key,
        entityId: null,
        entityType: null,
        ruleId: null,
        domain,
        claim: `${domain} domain will recover to above 6.0 score within 21 days`,
        resolveBy: addDays(now, 21),
        threshold: 6.0,
        metricToCheck: "score",
      }),
    );
  }

  // H_MORALE_INTERVENTION — P03 firing for 7+ consecutive days
  const moraleEvents = P.domains.morale.events;
  let consecutiveDays = 0;
  for (let d = 0; d < 7; d++) {
    const asOf = addDays(now, -d);
    const eventsUpToDay = moraleEvents.filter((e) => e.occurredAt <= asOf);
    const scoreAsOf = eventBrain.project(eventsUpToDay, asOf, 90).domains.morale.score;
    if (severityFromScore(scoreAsOf) >= 3) {
      consecutiveDays++;
    } else {
      break;
    }
  }
  if (consecutiveDays >= 7) {
    const period = now.toISOString().slice(0, 10);
    const key = `MORALE:${period}`;
    if (!(await hasOpenHypothesis(db, key))) {
      created.push(
        await createHypothesis(db, now, {
          key,
          entityId: null,
          entityType: null,
          ruleId: "P03",
          domain: "morale",
          claim:
            "Morale intervention will prevent P02 (flight risk) from firing within 30 days if 1:1 cadence is restored",
          resolveBy: addDays(now, 30),
          threshold: 0,
          metricToCheck: "flightRiskFindingCount",
        }),
      );
    }
  }

  return {
    data: created,
    summary: `Generated ${created.length} new hypothesis(es).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 4 — HYPOTHESIS RESOLUTION
// ─────────────────────────────────────────────────────────────────────────

interface ResolutionVerdict {
  met: boolean;
  actualValue: number | null;
}

function resolveCriterion(
  h: typeof hypothesesTable.$inferSelect,
  P: Projection,
  brainFindings: BrainFindings,
): ResolutionVerdict {
  if (h.key.startsWith("FLIGHT:")) {
    const personId = h.entityId ?? "";
    const departed = P.people[personId] === undefined
      ? true // no recent events at all for this person — treat as departed/resolved signal
      : P.people[personId].events.some((e) => e.type === "employee_departed");
    return { met: departed, actualValue: departed ? 1 : 0 };
  }

  if (h.key.startsWith("RUNWAY_CRITICAL:")) {
    const financial = brainFindings.domainMetrics.financial;
    const resolvedAction = P.domains.financial.events.some(
      (e) => e.type === "funding_round_closed" || e.type === "headcount_reduction",
    );
    const met = resolvedAction || financial.score < (h.threshold ?? 4);
    return { met, actualValue: financial.score };
  }

  if (h.key.startsWith("CASCADE:")) {
    const toRuleId = h.ruleId;
    const toFinding = toRuleId
      ? brainFindings.findings.find((f) => f.ruleId === toRuleId && f.severity >= (h.threshold ?? 4))
      : undefined;
    return { met: Boolean(toFinding), actualValue: toFinding ? toFinding.severity : 0 };
  }

  if (h.key.startsWith("RECOVERY:")) {
    const domain = h.domain as Domain | null;
    const score = domain ? brainFindings.domainMetrics[domain]?.score ?? 0 : 0;
    return { met: score > (h.threshold ?? 6), actualValue: score };
  }

  if (h.key.startsWith("MORALE:")) {
    const flightFindings = brainFindings.findings.filter((f) => f.ruleId === "P02");
    const cadenceRestored = P.domains.morale.events.some((e) => e.type === "one_on_one_held");
    const met = cadenceRestored && flightFindings.length === 0;
    return { met, actualValue: flightFindings.length };
  }

  return { met: false, actualValue: null };
}

async function step4HypothesisResolution(
  db: DrizzleDB,
  now: Date,
  P: Projection,
  brainFindings: BrainFindings,
): Promise<{ data: HypothesisResolution[]; summary: string }> {
  const horizon = addMs(now, 24 * 60 * 60 * 1000);
  const dueSoon = await db
    .select()
    .from(hypothesesTable)
    .where(and(eq(hypothesesTable.status, "open"), lt(hypothesesTable.resolveBy, horizon)));

  const resolutions: HypothesisResolution[] = [];

  for (const h of dueSoon) {
    const verdict = resolveCriterion(h, P, brainFindings);
    const expired = now >= h.resolveBy;
    if (!verdict.met && !expired) continue; // not due yet and criterion not met — stays open

    const outcome: "confirmed" | "refuted" = verdict.met ? "confirmed" : "refuted";
    const ruleId = h.ruleId;
    const rule = ruleId ? RULES_BY_ID[ruleId] : undefined;

    let weightBefore = 1;
    let confidenceAtPrediction: number | null = null;
    if (ruleId) {
      const stored = await getSetting(db, `rule.weight.${ruleId}`);
      weightBefore = stored ? Number(stored) : 1;
      confidenceAtPrediction = rule ? clamp(rule.baseConfidence * weightBefore, 0, 1) : null;
    }

    // DESIGN PARAMETER: calibration nudges, ±10% max per cycle (actually +8%/-7%)
    let weightAfter = weightBefore;
    if (ruleId) {
      weightAfter =
        outcome === "confirmed"
          ? Math.min(2.5, weightBefore * 1.08)
          : Math.max(0.1, weightBefore * 0.93);
      await setSetting(db, `rule.weight.${ruleId}`, String(weightAfter));
    }

    const outcomeValue = outcome === "confirmed" ? 1 : 0;
    const brierContribution =
      confidenceAtPrediction !== null ? (confidenceAtPrediction - outcomeValue) ** 2 : null;

    await db.insert(hypothesisResolutions).values({
      hypothesisId: h.id,
      ruleId,
      outcome,
      confidenceAtPrediction,
      actualValue: verdict.actualValue,
      threshold: h.threshold,
      brierContribution,
      weightBefore,
      weightAfter,
      resolvedAt: now,
    });

    await db
      .update(hypothesesTable)
      .set({
        status: outcome,
        resolvedAt: now,
        outcomeNote: `Resolved as ${outcome} at ${now.toISOString()} (actual=${verdict.actualValue ?? "n/a"})`,
      })
      .where(eq(hypothesesTable.id, h.id));

    resolutions.push({
      hypothesisId: h.id,
      ruleId,
      outcome,
      confidenceAtPrediction,
      actualValue: verdict.actualValue,
      threshold: h.threshold,
      brierContribution,
      weightBefore,
      weightAfter,
    });
  }

  return {
    data: resolutions,
    summary: `Resolved ${resolutions.length} hypothesis(es) of ${dueSoon.length} due for review.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 5 — RULE CALIBRATION
// ─────────────────────────────────────────────────────────────────────────

// B = (1/N) * Σ(p_i - o_i)²  [Brier, 1950]
// p_i = rule confidence at prediction time
// o_i = 1 if confirmed, 0 if refuted
// Lower B = better calibrated predictions
// Threshold B > 0.25 = poorly calibrated [DESIGN PARAMETER]
function brierScore(contributions: number[]): number {
  if (contributions.length === 0) return 0;
  return contributions.reduce((a, b) => a + b, 0) / contributions.length;
}

const CALIBRATION_WINDOW_DAYS = 90; // DESIGN PARAMETER — matches spec "last 90d"
const MIN_RESOLUTIONS_FOR_CALIBRATION = 5; // DESIGN PARAMETER
const POORLY_CALIBRATED_BRIER = 0.25; // DESIGN PARAMETER [Brier, 1950]
const MOSTLY_REFUTED_RATIO = 0.7; // DESIGN PARAMETER
const MOSTLY_CONFIRMED_RATIO = 0.7; // DESIGN PARAMETER
const OVER_SENSITIVE_THRESHOLD_BUMP = 0.9; // DESIGN PARAMETER (-10% weight => fires less)

async function step5RuleCalibration(
  db: DrizzleDB,
  now: Date,
): Promise<{ data: RuleCalibration[]; summary: string }> {
  const cutoff = addDays(now, -CALIBRATION_WINDOW_DAYS);
  const calibrations: RuleCalibration[] = [];

  for (const rule of RULES) {
    const rows = await db
      .select()
      .from(hypothesisResolutions)
      .where(
        and(
          eq(hypothesisResolutions.ruleId, rule.id),
          gte(hypothesisResolutions.resolvedAt, cutoff),
        ),
      );

    if (rows.length < MIN_RESOLUTIONS_FOR_CALIBRATION) continue;

    const confirmed = rows.filter((r) => r.outcome === "confirmed").length;
    const refuted = rows.filter((r) => r.outcome === "refuted").length;
    const total = rows.length;
    const brier = brierScore(rows.map((r) => r.brierContribution ?? 0));

    const oldWeightStr = await getSetting(db, `rule.weight.${rule.id}`);
    const oldWeight = oldWeightStr ? Number(oldWeightStr) : 1;
    let newWeight = oldWeight;
    let action: RuleCalibration["action"] = "no_adjustment";

    if (brier > POORLY_CALIBRATED_BRIER) {
      const refutedRatio = refuted / total;
      const confirmedRatio = confirmed / total;
      if (refutedRatio >= MOSTLY_REFUTED_RATIO) {
        newWeight = Math.max(0.1, oldWeight * OVER_SENSITIVE_THRESHOLD_BUMP);
        action = "increased_threshold";
      } else if (confirmedRatio >= MOSTLY_CONFIRMED_RATIO) {
        action = "well_calibrated";
      } else {
        action = "no_adjustment";
      }
    } else {
      action = "well_calibrated";
    }

    if (newWeight !== oldWeight) {
      await setSetting(db, `rule.weight.${rule.id}`, String(newWeight));
    }

    calibrations.push({
      ruleId: rule.id,
      oldWeight,
      newWeight,
      brierScore: brier,
      confirmed,
      refuted,
      action,
    });
  }

  return {
    data: calibrations,
    summary: `Calibrated ${calibrations.length} rule(s) with sufficient resolution history.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 6 — PLAYBOOK AUTO-TRIGGER
// ─────────────────────────────────────────────────────────────────────────

async function step6PlaybookAutoTrigger(
  db: DrizzleDB,
  now: Date,
  brainFindings: BrainFindings,
  config: AgentConfig,
): Promise<{ data: TriggeredPlaybook[]; summary: string; status?: StepResult["status"] }> {
  const triggered: TriggeredPlaybook[] = [];
  let hitLimit = false;

  for (const finding of brainFindings.novelFindings) {
    if (triggered.length >= config.maxPlaybookAutoTriggers) {
      hitLimit = true;
      break;
    }
    const rule = RULES_BY_ID[finding.ruleId];
    const playbook = rule?.suggestedPlaybook;
    if (!playbook) continue;

    const active = await db
      .select({ id: playbookInstances.id })
      .from(playbookInstances)
      .where(and(eq(playbookInstances.ruleId, finding.ruleId), eq(playbookInstances.status, "active")))
      .limit(1);
    if (active.length > 0) continue;

    await db.insert(playbookInstances).values({
      ruleId: finding.ruleId,
      playbookId: playbook.id,
      status: "active",
      source: "autonomous_agent",
      triggeredAt: now,
      assignedDomain: finding.domain,
    });

    await db.insert(notifications).values({
      severity: finding.severity,
      title: `Auto-triggered: ${playbook.name}`,
      message: `${finding.title} detected. Playbook '${playbook.name}' has been activated automatically.`,
      domain: finding.domain,
      ruleId: finding.ruleId,
      createdAt: now,
    });

    triggered.push({
      ruleId: finding.ruleId,
      playbookId: playbook.id,
      playbookName: playbook.name,
      domain: finding.domain,
      severity: finding.severity,
      findingTitle: finding.title,
    });
  }

  return {
    data: triggered,
    summary: hitLimit
      ? `Triggered ${triggered.length} playbook(s) — hit maxPlaybookAutoTriggers (${config.maxPlaybookAutoTriggers}), stopping early.`
      : `Triggered ${triggered.length} playbook(s) for new critical findings.`,
    status: hitLimit ? "partial" : "success",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 7 — MORNING BRIEFING
// ─────────────────────────────────────────────────────────────────────────

async function morningBriefingExists(db: DrizzleDB, dateStr: string): Promise<boolean> {
  const rows = await db.select({ id: briefings.id }).from(briefings).where(eq(briefings.date, dateStr)).limit(1);
  return rows.length > 0;
}

async function step7MorningBriefing(
  db: DrizzleDB,
  now: Date,
  config: AgentConfig,
  brainFindings: BrainFindings,
  cascadesDetected: CausalCascade[],
): Promise<{ data: boolean; summary: string; status?: StepResult["status"] }> {
  const hour = now.getUTCHours();
  const windowStart = 6; // 06:00 UTC
  const windowEnd = 8; // 08:00 UTC (exclusive)
  if (hour < windowStart || hour >= windowEnd) {
    return { data: false, summary: "Outside 06:00-08:00 UTC window — skipped.", status: "skipped" };
  }

  const dateStr = now.toISOString().slice(0, 10);
  if (await morningBriefingExists(db, dateStr)) {
    return { data: false, summary: `Briefing for ${dateStr} already exists — skipped.`, status: "skipped" };
  }

  const criticalFindings = brainFindings.findings.filter((f) => f.severity >= 4);
  const top = brainFindings.topFinding;
  const topCascade = cascadesDetected[0];

  const s1 = `${brainFindings.orgHealthScore} health score, ${brainFindings.riskProfile} profile. ${Object.keys(brainFindings.domainMetrics).length} domains active, ${criticalFindings.length} critical findings require immediate attention.`;
  const s2 = top
    ? `The most urgent signal is ${top.title} (${top.domain}, sev ${top.severity}), with basis: ${top.basis}`
    : "No findings required escalation this cycle.";
  const s3 =
    topCascade && topCascade.confidence > 0.3
      ? `A causal cascade is active: ${topCascade.from} → ${topCascade.to}, amplifying risk by ${topCascade.amplificationFactor.toFixed(1)}×.`
      : "No cross-domain cascades detected.";
  const s4 = brainFindings.physicsSummary;
  const executiveSummary = `${s1} ${s2} ${s3} ${s4}`;

  const sortedFindings = [...brainFindings.findings].sort((a, b) => b.severity - a.severity);

  const top3Priorities: Priority[] = sortedFindings.slice(0, 3).map((f) => ({
    title: f.title,
    domain: f.domain,
    rationale: f.basis,
  }));

  const top3Risks: Risk[] = sortedFindings.slice(0, 3).map((f) => ({
    title: f.title,
    domain: f.domain,
    severity: f.severity,
    basis: f.basis,
  }));

  const decisionsNeeding48hAction: Decision[] = sortedFindings
    .filter((f) => f.severity >= 4)
    .slice(0, 3)
    .map((f) => ({
      title: `Review and respond to: ${f.title}`,
      domain: f.domain,
      deadline: "within 48 hours",
      rationale: f.basis,
    }));

  const lowEventDomains = Object.values(brainFindings.domainMetrics).filter((d) => d.eventCount < 5);
  const uncertaintyStatement =
    lowEventDomains.length > 0
      ? `${lowEventDomains.length} domain(s) (${lowEventDomains.map((d) => d.domain).join(", ")}) have fewer than 5 events in the lookback window, so confidence in those findings is low.`
      : "All domains have sufficient event volume for high-confidence findings.";

  const openHypothesesRows = await db
    .select({ id: hypothesesTable.id })
    .from(hypothesesTable)
    .where(eq(hypothesesTable.status, "open"));

  const weekAgo = addDays(now, -7);
  const confirmedThisWeekRows = await db
    .select({ id: hypothesisResolutions.id })
    .from(hypothesisResolutions)
    .where(and(eq(hypothesisResolutions.outcome, "confirmed"), gte(hypothesisResolutions.resolvedAt, weekAgo)));

  const briefing: MorningBriefing = {
    date: dateStr,
    orgHealthScore: brainFindings.orgHealthScore,
    riskProfile: brainFindings.riskProfile,
    executiveSummary,
    top3Priorities,
    top3Risks,
    decisionsNeeding48hAction,
    physicsStatement: s4,
    uncertaintyStatement,
    hypothesesOpen: openHypothesesRows.length,
    hypothesesConfirmedThisWeek: confirmedThisWeekRows.length,
  };

  await db.insert(briefings).values({
    date: briefing.date,
    orgHealthScore: briefing.orgHealthScore,
    riskProfile: briefing.riskProfile,
    executiveSummary: briefing.executiveSummary,
    top3Priorities: briefing.top3Priorities,
    top3Risks: briefing.top3Risks,
    decisionsNeeding48hAction: briefing.decisionsNeeding48hAction,
    physicsStatement: briefing.physicsStatement,
    uncertaintyStatement: briefing.uncertaintyStatement,
    hypothesesOpen: briefing.hypothesesOpen,
    hypothesesConfirmedThisWeek: briefing.hypothesesConfirmedThisWeek,
    createdAt: now,
  });

  return { data: true, summary: `Generated morning briefing for ${dateStr}.` };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 8 — UNCERTAINTY MAPPING
// ─────────────────────────────────────────────────────────────────────────

async function step8UncertaintyMapping(
  brainFindings: BrainFindings,
): Promise<{ data: UncertaintyFlag[]; summary: string }> {
  const flags: UncertaintyFlag[] = [];

  for (const domain of DOMAINS) {
    const dm = brainFindings.domainMetrics[domain];
    if (dm.eventCount < 5) {
      flags.push({
        domain,
        eventCount: dm.eventCount,
        confidenceLevel: "low",
        message: `${domain} has only ${dm.eventCount} events in 90 days — confidence in ${domain} findings is LOW. Log more ${domain} events to improve accuracy.`,
        missingEventTypes: DOMAIN_SIGNAL_EVENT_TYPES[domain].slice(0, 3),
      });
    }
  }

  const lowConfidenceFindings = brainFindings.findings.filter((f) => f.confidence < 0.5);
  if (brainFindings.findings.length > 0 && lowConfidenceFindings.length / brainFindings.findings.length > 0.5) {
    flags.push({
      domain: "system",
      eventCount: brainFindings.findings.length,
      confidenceLevel: "low",
      message: `${lowConfidenceFindings.length} of ${brainFindings.findings.length} findings (>50%) have confidence below 0.5 — treat this cycle's conclusions with caution.`,
      missingEventTypes: [],
    });
  }

  return { data: flags, summary: `Flagged ${flags.length} uncertainty condition(s).` };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 9 — DELTA BROADCAST
// ─────────────────────────────────────────────────────────────────────────

interface ScoreChange {
  domain: Domain;
  previousScore: number;
  newScore: number;
  delta: number;
}

interface DeltaPayload {
  newCritical: Finding[];
  recovered: Finding[];
  scoreChanges: ScoreChange[];
}

function findingKey(f: Finding): string {
  return `${f.ruleId}:${f.entityId ?? ""}`;
}

async function step9DeltaBroadcast(
  db: DrizzleDB,
  now: Date,
  cycleId: string,
  brainFindings: BrainFindings,
  previousResult: AgentCycleResult | null,
): Promise<{ data: DeltaPayload; summary: string }> {
  const prevCritical = previousResult?.brainFindings.novelFindings ?? [];
  const currCritical = brainFindings.novelFindings;

  const prevKeys = new Set(prevCritical.map(findingKey));
  const currKeys = new Set(currCritical.map(findingKey));

  const newCritical = currCritical.filter((f) => !prevKeys.has(findingKey(f)));
  const recovered = prevCritical.filter((f) => !currKeys.has(findingKey(f)));

  const scoreChanges: ScoreChange[] = [];
  if (previousResult) {
    for (const domain of DOMAINS) {
      const prevScore = previousResult.brainFindings.domainMetrics[domain]?.score;
      const newScore = brainFindings.domainMetrics[domain]?.score;
      if (prevScore === undefined || newScore === undefined) continue;
      const delta = newScore - prevScore;
      if (Math.abs(delta) > 1.0) {
        scoreChanges.push({ domain, previousScore: prevScore, newScore, delta });
      }
    }
  }

  const payload: DeltaPayload = { newCritical, recovered, scoreChanges };

  await db.insert(agentDelta).values({
    cycleId,
    createdAt: now,
    delta: payload as unknown as Record<string, unknown>,
    consumed: false,
  });

  for (const finding of newCritical) {
    await db.insert(notifications).values({
      severity: finding.severity,
      title: `New critical finding: ${finding.title}`,
      message: finding.basis,
      domain: finding.domain,
      ruleId: finding.ruleId,
      createdAt: now,
    });
  }

  return {
    data: payload,
    summary: `Delta: ${newCritical.length} new critical, ${recovered.length} recovered, ${scoreChanges.length} domain score shift(s) > 1.0.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MASTER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────

/**
 * Reconstruct a minimal-but-interface-complete `AgentCycleResult` from the
 * last persisted agent_cycles row. Each invocation of POST /api/autonomous/run
 * is a fresh serverless call with no in-memory state, so `previousResult`
 * must always be rehydrated from Postgres.
 */
export async function loadPreviousResult(db: DrizzleDB): Promise<AgentCycleResult | null> {
  const rows = await db.select().from(agentCycles).orderBy(desc(agentCycles.startedAt)).limit(1);
  const last = rows[0];
  if (!last) return null;

  const domainScores = (last.domainScoresSnapshot ?? {}) as Record<string, number>;
  const domainMetrics = {} as BrainFindings["domainMetrics"];
  for (const domain of DOMAINS) {
    const score = domainScores[domain] ?? 5;
    domainMetrics[domain] = {
      domain,
      events: [],
      eventCount: 0,
      score,
      velocity: 0,
      posterior: clamp((10 - score) / 10, 0, 1),
      lastEventAt: null,
    };
  }

  const brainFindings: BrainFindings = {
    generatedAt: last.completedAt ?? last.startedAt,
    orgHealthScore: last.orgHealthScore ?? 0,
    riskProfile: (last.riskProfile as BrainFindings["riskProfile"]) ?? "moderate",
    domainMetrics,
    findings: [],
    novelFindings: ((last.novelFindingsSnapshot ?? []) as Finding[]).map((f) => ({
      ...f,
      createdAt: new Date(f.createdAt),
    })),
    topFinding: null,
    physicsSummary: "",
  };

  return {
    cycleId: last.id,
    startedAt: last.startedAt,
    completedAt: last.completedAt,
    status: (last.status as AgentCycleResult["status"]) ?? "complete",
    stepResults: (last.stepResults as StepResult[]) ?? [],
    brainFindings,
    cascadesDetected: [],
    beliefsUpdated: [],
    driftsDetected: [],
    playbooksTriggered: [],
    hypothesesCreated: [],
    hypothesesResolved: [],
    rulesCalibrated: [],
    briefingGenerated: false,
    uncertaintyFlags: [],
    totalDurationMs: last.totalDurationMs ?? 0,
    stepDurations: (last.stepDurations as Record<string, number>) ?? {},
    errors: (last.errors as AgentError[]) ?? [],
    nextCycleAt: last.completedAt
      ? addMs(last.completedAt, DEFAULT_AGENT_CONFIG.normalIntervalMs)
      : addMs(last.startedAt, DEFAULT_AGENT_CONFIG.normalIntervalMs),
    adaptedInterval: last.adaptedInterval ?? false,
  };
}

const SLOW_CYCLE_THRESHOLD_MS = 15000; // DESIGN PARAMETER

export async function runAgentCycle(input: AgentCycleInput): Promise<AgentCycleResult> {
  const { db, now, previousResult } = input;
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...input.config };

  const cycleId = `cyc_${now.getTime()}_${randomUUID().slice(0, 8)}`;
  const stepResults: StepResult[] = [];
  const stepDurations: Record<string, number> = {};
  const errors: AgentError[] = [];

  const record = (sr: StepResult, err: AgentError | null) => {
    stepResults.push(sr);
    stepDurations[sr.step] = sr.durationMs;
    if (err) errors.push(err);
  };

  // STEP 1 — full brain projection
  const s1 = await timeStep("brain_projection", () => step1BrainProjection(db, now, config));
  record(s1.stepResult, s1.error);

  if (!s1.data) {
    // fatal — nothing downstream can run without a projection
    const emptyFindings: BrainFindings = {
      generatedAt: now,
      orgHealthScore: previousResult?.brainFindings.orgHealthScore ?? 0,
      riskProfile: previousResult?.brainFindings.riskProfile ?? "critical",
      domainMetrics: previousResult?.brainFindings.domainMetrics ?? ({} as BrainFindings["domainMetrics"]),
      findings: [],
      novelFindings: [],
      topFinding: null,
      physicsSummary: "Brain projection failed this cycle.",
    };
    const totalDurationMs = stepResults.reduce((a, s) => a + s.durationMs, 0);
    const nextCycleAt = addMs(now, config.normalIntervalMs);

    await db.insert(agentCycles).values({
      id: cycleId,
      startedAt: now,
      completedAt: new Date(),
      status: "failed",
      orgHealthScore: emptyFindings.orgHealthScore,
      riskProfile: emptyFindings.riskProfile,
      criticalCount: 0,
      cascadeCount: 0,
      playbooksTriggered: 0,
      hypothesesCreated: 0,
      hypothesesResolved: 0,
      adaptedInterval: false,
      totalDurationMs,
      stepDurations,
      errors,
      stepResults,
      novelFindingsSnapshot: [],
      domainScoresSnapshot: previousResult
        ? Object.fromEntries(
            Object.entries(previousResult.brainFindings.domainMetrics).map(([d, m]) => [d, m.score]),
          )
        : {},
    });

    return {
      cycleId,
      startedAt: now,
      completedAt: new Date(),
      status: "failed",
      stepResults,
      brainFindings: emptyFindings,
      cascadesDetected: [],
      beliefsUpdated: [],
      driftsDetected: [],
      playbooksTriggered: [],
      hypothesesCreated: [],
      hypothesesResolved: [],
      rulesCalibrated: [],
      briefingGenerated: false,
      uncertaintyFlags: [],
      totalDurationMs,
      stepDurations,
      errors,
      nextCycleAt,
      adaptedInterval: false,
    };
  }

  const { P, brainFindings, cascadesDetected } = s1.data;

  // Adaptive interval: accelerate cycle if org health dropped sharply
  let adaptedInterval = false;
  let nextIntervalMs = config.normalIntervalMs;
  const previousHealth = previousResult?.brainFindings.orgHealthScore;
  if (previousHealth !== undefined) {
    const delta = previousHealth - brainFindings.orgHealthScore;
    if (delta > 10) {
      adaptedInterval = true;
      nextIntervalMs = config.criticalIntervalMs;
      // eslint-disable-next-line no-console
      console.warn(
        `[agentLoop] Org health dropped ${delta} points — accelerating cycle to ${config.criticalIntervalMs / 60000} min`,
      );
    }
  }

  // STEP 2 — belief state update
  const s2 = await timeStep("belief_update", () => step2BeliefUpdate(db, now, brainFindings, cascadesDetected));
  record(s2.stepResult, s2.error);
  const beliefsUpdated = s2.data?.beliefsUpdated ?? [];
  const driftsDetected = s2.data?.driftsDetected ?? [];

  // STEP 3 — hypothesis generation
  const s3 = await timeStep("hypothesis_generation", () =>
    step3HypothesisGeneration(db, now, P, brainFindings, cascadesDetected),
  );
  record(s3.stepResult, s3.error);
  const hypothesesCreated = s3.data ?? [];

  // STEP 4 — hypothesis resolution
  const s4 = await timeStep("hypothesis_resolution", () => step4HypothesisResolution(db, now, P, brainFindings));
  record(s4.stepResult, s4.error);
  const hypothesesResolved = s4.data ?? [];

  // STEP 5 — rule calibration
  const s5 = await timeStep("rule_calibration", () => step5RuleCalibration(db, now));
  record(s5.stepResult, s5.error);
  const rulesCalibrated = s5.data ?? [];

  // STEP 6 — playbook auto-trigger
  const s6 = await timeStep("playbook_auto_trigger", () =>
    step6PlaybookAutoTrigger(db, now, brainFindings, config),
  );
  record(s6.stepResult, s6.error);
  const playbooksTriggered = s6.data ?? [];

  // STEP 7 — morning briefing
  const s7 = await timeStep("morning_briefing", () =>
    step7MorningBriefing(db, now, config, brainFindings, cascadesDetected),
  );
  record(s7.stepResult, s7.error);
  const briefingGenerated = s7.data ?? false;

  // STEP 8 — uncertainty mapping
  const s8 = await timeStep("uncertainty_mapping", () => step8UncertaintyMapping(brainFindings));
  record(s8.stepResult, s8.error);
  const uncertaintyFlags = s8.data ?? [];

  // STEP 9 — delta broadcast
  const s9 = await timeStep("delta_broadcast", () =>
    step9DeltaBroadcast(db, now, cycleId, brainFindings, previousResult),
  );
  record(s9.stepResult, s9.error);

  // STEP 10 — cycle audit
  const completedAt = new Date();
  const totalDurationMs = stepResults.reduce((a, s) => a + s.durationMs, 0);

  if (totalDurationMs > SLOW_CYCLE_THRESHOLD_MS) {
    const slowest = [...stepResults].sort((a, b) => b.durationMs - a.durationMs)[0];
    // eslint-disable-next-line no-console
    console.warn(
      `[agentLoop] Cycle ${cycleId} took ${totalDurationMs}ms (> ${SLOW_CYCLE_THRESHOLD_MS}ms) — slowest step: ${slowest?.step} (${slowest?.durationMs}ms)`,
    );
  }

  // NOTE: a "skipped" step (e.g. morning briefing outside its 06:00-08:00 UTC
  // window, or because today's briefing already exists) is expected/healthy
  // behaviour and does not by itself degrade the cycle to "partial".
  const anyFailed = stepResults.some((s) => s.status === "failed");
  const anyPartial = stepResults.some((s) => s.status === "partial");
  const status: AgentCycleResult["status"] = anyFailed || anyPartial ? "partial" : "complete";

  await setSetting(db, "agent.lastRunAt", now.toISOString());

  const nextCycleAt = addMs(now, nextIntervalMs);

  await db.insert(agentCycles).values({
    id: cycleId,
    startedAt: now,
    completedAt,
    status,
    orgHealthScore: brainFindings.orgHealthScore,
    riskProfile: brainFindings.riskProfile,
    criticalCount: brainFindings.novelFindings.length,
    cascadeCount: cascadesDetected.length,
    playbooksTriggered: playbooksTriggered.length,
    hypothesesCreated: hypothesesCreated.length,
    hypothesesResolved: hypothesesResolved.length,
    adaptedInterval,
    totalDurationMs,
    stepDurations,
    errors,
    stepResults,
    novelFindingsSnapshot: brainFindings.novelFindings,
    domainScoresSnapshot: Object.fromEntries(
      Object.entries(brainFindings.domainMetrics).map(([d, m]) => [d, m.score]),
    ),
  });

  return {
    cycleId,
    startedAt: now,
    completedAt,
    status,
    stepResults,
    brainFindings,
    cascadesDetected,
    beliefsUpdated,
    driftsDetected,
    playbooksTriggered,
    hypothesesCreated,
    hypothesesResolved,
    rulesCalibrated,
    briefingGenerated,
    uncertaintyFlags,
    totalDurationMs,
    stepDurations,
    errors,
    nextCycleAt,
    adaptedInterval,
  };
}

export default runAgentCycle;
