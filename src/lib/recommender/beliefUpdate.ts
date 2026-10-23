/**
 * Part 51 — outcome -> belief update loop.
 *
 * Design rule (anti-manipulation, Phase 1): beliefs in `rec_context_effects`
 * may ONLY be permanently updated by verified outcomes — a measured
 * commitment follow-through (Part 48 stand-in) or an experiment result
 * (Part 30 stand-in). Raw engagement (accept/reject clicks) never reaches
 * this file. Self-reports are logged for audit but do not move beliefs.
 *
 * Decay rule (Phase 1 / Gate 5): evidence decays toward the uninformative
 * prior over time. Decay is always applied *at read time* for scoring
 * (`getDecayedContextEffect`), so stale evidence is instantly reflected in
 * rankings. It is only *persisted* (with a belief-log entry) when
 * `decayStaleBeliefs()` runs, to avoid constant write churn from every read.
 */

import { randomUUID } from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { recBeliefLog, recContextEffects, recInterventions, recOutcomes } from "@/db/schema";
import {
  credibleInterval,
  decayPosterior,
  effectiveSampleSize,
  evidenceClassForSample,
  posteriorMean,
  updatePosterior,
  type BetaPosterior,
} from "@/lib/effects/estimators";
import { EVIDENCE_CLASS_RANK, type EvidenceClass, type Explain } from "./types";

export interface ContextEffectRow {
  id: string;
  interventionId: string;
  contextKey: string;
  alpha: number;
  beta: number;
  sampleSize: number;
  evidenceClass: EvidenceClass;
  sourceType: string;
  halfLifeDays: number;
  lastUpdated: Date;
}

async function fetchRow(interventionId: string, contextKey: string): Promise<ContextEffectRow | undefined> {
  const rows = await db
    .select()
    .from(recContextEffects)
    .where(and(eq(recContextEffects.interventionId, interventionId), eq(recContextEffects.contextKey, contextKey)))
    .limit(1);
  if (!rows[0]) return undefined;
  const r = rows[0];
  return {
    id: r.id,
    interventionId: r.interventionId,
    contextKey: r.contextKey,
    alpha: r.alpha,
    beta: r.beta,
    sampleSize: r.sampleSize,
    evidenceClass: r.evidenceClass as EvidenceClass,
    sourceType: r.sourceType,
    halfLifeDays: r.halfLifeDays,
    lastUpdated: r.lastUpdated,
  };
}

async function initRow(
  interventionId: string,
  contextKey: string,
  priorEvidenceClass: EvidenceClass,
): Promise<ContextEffectRow> {
  const id = randomUUID();
  const now = new Date();
  await db
    .insert(recContextEffects)
    .values({
      id,
      interventionId,
      contextKey,
      alpha: 1,
      beta: 1,
      sampleSize: 0,
      evidenceClass: priorEvidenceClass,
      sourceType: "prior",
      halfLifeDays: 30,
      lastUpdated: now,
    })
    .onConflictDoNothing();
  const row = await fetchRow(interventionId, contextKey);
  if (row) return row;
  // Extremely unlikely race fallback.
  return {
    id,
    interventionId,
    contextKey,
    alpha: 1,
    beta: 1,
    sampleSize: 0,
    evidenceClass: priorEvidenceClass,
    sourceType: "prior",
    halfLifeDays: 30,
    lastUpdated: now,
  };
}

/** Get (creating if needed) the raw stored row — no decay applied. */
export async function getOrInitContextEffect(
  interventionId: string,
  contextKey: string,
  priorEvidenceClass: EvidenceClass,
): Promise<ContextEffectRow> {
  const existing = await fetchRow(interventionId, contextKey);
  if (existing) return existing;
  return initRow(interventionId, contextKey, priorEvidenceClass);
}

function daysSince(date: Date): number {
  return Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
}

/**
 * Read-time decayed view of a context-effect row, used for scoring. Does
 * NOT write to the database.
 */
export function decayedView(row: ContextEffectRow): {
  posterior: BetaPosterior;
  effect: Explain<number>;
  daysSinceUpdate: number;
} {
  const daysSinceUpdate = daysSince(row.lastUpdated);
  const posterior =
    row.sourceType === "prior"
      ? { alpha: row.alpha, beta: row.beta }
      : decayPosterior({ alpha: row.alpha, beta: row.beta }, daysSinceUpdate, row.halfLifeDays);

  const mean = posteriorMean(posterior);
  const interval = credibleInterval(posterior);

  return {
    posterior,
    daysSinceUpdate,
    effect: {
      value: mean,
      interval,
      evidenceClass: row.evidenceClass,
      // Raw count of verified outcome events ever recorded — a historical
      // fact that does not shrink with decay. Decay instead widens the
      // interval / pulls the mean toward the prior via `posterior` above, so
      // stale evidence is still visibly less trustworthy without lying about
      // how many times it was actually measured.
      sampleSize: row.sourceType === "prior" ? 0 : row.sampleSize,
      assumptions: [],
      lastUpdated: row.lastUpdated.toISOString(),
    },
  };
}

export interface VerifiedOutcomeInput {
  interventionId: string;
  contextKey: string;
  priorEvidenceClass: EvidenceClass;
  source: "commitment_followthrough" | "experiment_result";
  success: boolean;
  magnitude?: number;
  commitmentId?: string;
  experimentId?: string;
  recommendationId?: string;
}

/**
 * Records a VERIFIED outcome and permanently updates the belief. This is the
 * only function in the codebase that is allowed to write to
 * `rec_context_effects` with a non-decay reason.
 */
export async function recordVerifiedOutcome(input: VerifiedOutcomeInput): Promise<ContextEffectRow> {
  const row = await getOrInitContextEffect(input.interventionId, input.contextKey, input.priorEvidenceClass);
  const { posterior: decayedBefore } = decayedView(row);

  const magnitude = Math.max(0, Math.min(1, input.magnitude ?? 1));
  const updated = updatePosterior(decayedBefore, input.success, magnitude);
  const newSampleSize = row.sampleSize + 1;
  const proposedClass = evidenceClassForSample(input.priorEvidenceClass, newSampleSize, input.source);
  const newEvidenceClass: EvidenceClass =
    EVIDENCE_CLASS_RANK[proposedClass] > EVIDENCE_CLASS_RANK[row.evidenceClass] ? proposedClass : row.evidenceClass;
  const newHalfLife = input.source === "experiment_result" ? 60 : 30;
  const now = new Date();

  await db
    .update(recContextEffects)
    .set({
      alpha: updated.alpha,
      beta: updated.beta,
      sampleSize: newSampleSize,
      evidenceClass: newEvidenceClass,
      sourceType: input.source,
      halfLifeDays: newHalfLife,
      lastUpdated: now,
    })
    .where(eq(recContextEffects.id, row.id));

  await db.insert(recBeliefLog).values({
    id: randomUUID(),
    interventionId: input.interventionId,
    contextKey: input.contextKey,
    beforeAlpha: row.alpha,
    beforeBeta: row.beta,
    afterAlpha: updated.alpha,
    afterBeta: updated.beta,
    evidenceClassBefore: row.evidenceClass,
    evidenceClassAfter: newEvidenceClass,
    reason: `${input.source}:${input.commitmentId ?? input.experimentId ?? "n/a"}`,
  });

  await db.insert(recOutcomes).values({
    id: randomUUID(),
    recommendationId: input.recommendationId ?? null,
    interventionId: input.interventionId,
    contextKey: input.contextKey,
    source: input.source,
    commitmentId: input.commitmentId ?? null,
    experimentId: input.experimentId ?? null,
    success: input.success,
    magnitude,
    verified: true,
  });

  const refreshed = await fetchRow(input.interventionId, input.contextKey);
  return refreshed ?? row;
}

/**
 * Logs a self-report (e.g. a user just says "this worked") WITHOUT touching
 * beliefs. This is the anti-manipulation / honesty boundary: unverified
 * claims are recorded for audit but never move the marketplace's effect
 * estimates.
 */
export async function recordSelfReport(input: {
  interventionId: string;
  contextKey: string;
  success: boolean;
  recommendationId?: string;
}): Promise<void> {
  await db.insert(recOutcomes).values({
    id: randomUUID(),
    recommendationId: input.recommendationId ?? null,
    interventionId: input.interventionId,
    contextKey: input.contextKey,
    source: "self_report",
    success: input.success,
    magnitude: 1,
    verified: false,
  });
}

/**
 * Batch job: persist decay for any row whose stored evidence has aged. Also
 * downgrades evidenceClass when decayed effective sample size falls below
 * the threshold that justified the current class. Returns number of rows
 * materially changed.
 */
export async function decayStaleBeliefs(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .select()
    .from(recContextEffects)
    .where(and(lt(recContextEffects.lastUpdated, cutoff), sql`${recContextEffects.sourceType} <> 'prior'`));

  let changed = 0;
  for (const r of rows) {
    const row: ContextEffectRow = {
      id: r.id,
      interventionId: r.interventionId,
      contextKey: r.contextKey,
      alpha: r.alpha,
      beta: r.beta,
      sampleSize: r.sampleSize,
      evidenceClass: r.evidenceClass as EvidenceClass,
      sourceType: r.sourceType,
      halfLifeDays: r.halfLifeDays,
      lastUpdated: r.lastUpdated,
    };
    const { posterior } = decayedView(row);
    if (Math.abs(posterior.alpha - row.alpha) < 0.01 && Math.abs(posterior.beta - row.beta) < 0.01) continue;

    const decayedSampleSize = effectiveSampleSize(posterior);
    let newClass = row.evidenceClass;
    if (decayedSampleSize < 2 && EVIDENCE_CLASS_RANK[newClass] > EVIDENCE_CLASS_RANK.correlational) {
      newClass = "correlational";
    }
    if (decayedSampleSize < 0.5 && EVIDENCE_CLASS_RANK[newClass] > EVIDENCE_CLASS_RANK.anecdotal) {
      newClass = "anecdotal";
    }

    await db
      .update(recContextEffects)
      .set({ alpha: posterior.alpha, beta: posterior.beta, evidenceClass: newClass, lastUpdated: new Date() })
      .where(eq(recContextEffects.id, row.id));

    await db.insert(recBeliefLog).values({
      id: randomUUID(),
      interventionId: row.interventionId,
      contextKey: row.contextKey,
      beforeAlpha: row.alpha,
      beforeBeta: row.beta,
      afterAlpha: posterior.alpha,
      afterBeta: posterior.beta,
      evidenceClassBefore: row.evidenceClass,
      evidenceClassAfter: newClass,
      reason: "decay:halflife-exceeded",
    });
    changed += 1;
  }
  return changed;
}

export async function getInterventionPriorEvidenceClass(interventionId: string): Promise<EvidenceClass> {
  const rows = await db
    .select({ priorEvidenceClass: recInterventions.priorEvidenceClass })
    .from(recInterventions)
    .where(eq(recInterventions.id, interventionId))
    .limit(1);
  return (rows[0]?.priorEvidenceClass as EvidenceClass) ?? "anecdotal";
}
