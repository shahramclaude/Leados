// src/lib/hypotheses.ts
//
// Hypotheses as living bets (mission §C): register -> evidence accumulation
// (Bayesian log-odds update, shared engine in memory.ts) -> resolution
// (auto, where an outcome event objectively settles the bet, or manual
// adjudication otherwise, with disputes recorded) -> forecaster scoring
// (Brier score + calibration curve per owner).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { hypotheses, hypothesisEvidence, hypothesisDisputes } from "@/db/schema";
import { applyLikelihoodRatio, brierScore, meanBrierScore, calibrationCurve, type CalibrationBucket } from "@/lib/memory";
import { getLatestMetric } from "@/lib/narrativeIntel";

export type HypothesisStatus = "open" | "resolved_true" | "resolved_false" | "retired" | "disputed";

export interface RegisterHypothesisInput {
  key: string;
  title: string;
  description?: string;
  ownerName: string;
  category?: string;
  priorProbability?: number; // defaults to 0.5
  resolutionDate?: string; // ISO date
  /** Auto-resolution rule — documented, objective: `{ metricName, entityId?, operator, threshold }`. */
  autoResolveRule?: { metricName: string; entityId?: string; operator: "gte" | "lte"; threshold: number };
}

export async function registerHypothesis(input: RegisterHypothesisInput) {
  const prior = input.priorProbability ?? 0.5;
  const [row] = await db
    .insert(hypotheses)
    .values({
      key: input.key,
      title: input.title,
      description: input.description ?? null,
      ownerName: input.ownerName,
      category: input.category ?? null,
      priorProbability: prior.toFixed(5),
      currentProbability: prior.toFixed(5),
      resolutionDate: input.resolutionDate ?? null,
      autoResolveRule: input.autoResolveRule ?? null,
      status: "open",
    })
    .returning();
  return row;
}

export interface AddEvidenceInput {
  hypothesisId: number;
  description: string;
  direction: "supports" | "against";
  likelihoodRatio: number; // > 1 for supporting evidence (direction inferred/validated against this)
  source?: string;
}

/**
 * Accumulate a piece of evidence against a hypothesis using a Bayesian
 * log-odds update. `likelihoodRatio` should already reflect `direction`
 * (i.e. <= 1 for "against" evidence) — we validate consistency.
 */
export async function addEvidence(input: AddEvidenceInput) {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, input.hypothesisId)).limit(1);
  if (!h) throw new Error(`Hypothesis ${input.hypothesisId} not found`);
  if (h.status !== "open") throw new Error(`Hypothesis ${input.hypothesisId} is not open (status=${h.status})`);

  const lr = input.likelihoodRatio;
  if (input.direction === "supports" && lr < 1) throw new Error("Supporting evidence must have likelihoodRatio >= 1");
  if (input.direction === "against" && lr > 1) throw new Error("Against evidence must have likelihoodRatio <= 1");

  const before = Number(h.currentProbability);
  const after = applyLikelihoodRatio(before, lr);

  const [evidenceRow] = await db
    .insert(hypothesisEvidence)
    .values({
      hypothesisId: input.hypothesisId,
      description: input.description,
      direction: input.direction,
      likelihoodRatio: lr.toFixed(4),
      probabilityBefore: before.toFixed(5),
      probabilityAfter: after.toFixed(5),
      source: input.source ?? null,
    })
    .returning();

  const [updated] = await db
    .update(hypotheses)
    .set({ currentProbability: after.toFixed(5), updatedAt: new Date() })
    .where(eq(hypotheses.id, input.hypothesisId))
    .returning();

  return { hypothesis: updated, evidence: evidenceRow };
}

export async function resolveHypothesis(id: number, outcome: boolean, method: "auto" | "manual" = "manual") {
  const [row] = await db
    .update(hypotheses)
    .set({
      status: outcome ? "resolved_true" : "resolved_false",
      outcome,
      resolutionMethod: method,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hypotheses.id, id))
    .returning();
  return row;
}

export async function retireHypothesis(id: number) {
  const [row] = await db.update(hypotheses).set({ status: "retired", updatedAt: new Date() }).where(eq(hypotheses.id, id)).returning();
  return row;
}

/**
 * Auto-resolution rule (mission §C "Auto-resolution where an outcome event
 * objectively settles the bet (rules documented)"): if a hypothesis carries
 * an `autoResolveRule`, compare the latest value of the named metric against
 * the documented operator/threshold. This is deliberately restricted to a
 * single metric comparison — anything requiring judgment must go through
 * `resolveHypothesis(..., "manual")` instead.
 */
export async function tryAutoResolve(id: number): Promise<{ resolved: boolean; row: typeof hypotheses.$inferSelect | null }> {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!h || h.status !== "open" || !h.autoResolveRule) return { resolved: false, row: h ?? null };
  const rule = h.autoResolveRule as { metricName: string; entityId?: string; operator: "gte" | "lte"; threshold: number };
  const latest = await getLatestMetric(rule.metricName, rule.entityId);
  if (!latest) return { resolved: false, row: h };
  const value = Number(latest.value);
  const outcome = rule.operator === "gte" ? value >= rule.threshold : value <= rule.threshold;
  const row = await resolveHypothesis(id, outcome, "auto");
  return { resolved: true, row };
}

/** Scan every open hypothesis with an auto-resolve rule — called by the nightly consolidation capability. */
export async function runAutoResolution(): Promise<{ id: number; resolved: boolean }[]> {
  const open = await db.select().from(hypotheses).where(eq(hypotheses.status, "open"));
  const candidates = open.filter((h) => h.autoResolveRule);
  const results: { id: number; resolved: boolean }[] = [];
  for (const h of candidates) {
    const { resolved } = await tryAutoResolve(h.id);
    results.push({ id: h.id, resolved });
  }
  return results;
}

/** Neglected hypotheses flagged past resolution date without being resolved — used by the nightly consolidation job. */
export async function listOverdueHypotheses(today: Date = new Date()) {
  const open = await db.select().from(hypotheses).where(eq(hypotheses.status, "open"));
  return open.filter((h) => h.resolutionDate && new Date(h.resolutionDate) < today);
}

export async function raiseDispute(hypothesisId: number, raisedBy: string, reason: string) {
  await db.update(hypotheses).set({ status: "disputed", updatedAt: new Date() }).where(eq(hypotheses.id, hypothesisId));
  const [row] = await db.insert(hypothesisDisputes).values({ hypothesisId, raisedBy, reason, status: "open" }).returning();
  return row;
}

/** Manual adjudication of a dispute: either upheld (hypothesis stays open/reverts) or overturned (a prior resolution/evidence stands). */
export async function adjudicateDispute(disputeId: number, outcome: "upheld" | "overturned", resolutionNote: string) {
  const [dispute] = await db.update(hypothesisDisputes).set({ status: outcome, resolutionNote, resolvedAt: new Date() }).where(eq(hypothesisDisputes.id, disputeId)).returning();
  if (dispute && outcome === "upheld") {
    await db.update(hypotheses).set({ status: "open", updatedAt: new Date() }).where(eq(hypotheses.id, dispute.hypothesisId));
  }
  return dispute;
}

export async function getHypothesisWithEvidence(id: number) {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!h) return null;
  const evidence = await db.select().from(hypothesisEvidence).where(eq(hypothesisEvidence.hypothesisId, id)).orderBy(hypothesisEvidence.createdAt);
  const disputes = await db.select().from(hypothesisDisputes).where(eq(hypothesisDisputes.hypothesisId, id)).orderBy(desc(hypothesisDisputes.createdAt));
  const brier = h.outcome === null || h.outcome === undefined ? null : brierScore(Number(h.currentProbability), h.outcome);
  return { ...h, evidence, disputes, brierScore: brier };
}

export async function listHypotheses(status?: HypothesisStatus) {
  return status
    ? db.select().from(hypotheses).where(eq(hypotheses.status, status)).orderBy(desc(hypotheses.updatedAt))
    : db.select().from(hypotheses).orderBy(desc(hypotheses.updatedAt));
}

export interface ForecasterScore {
  ownerName: string;
  resolvedCount: number;
  brierScore: number | null; // lower is better; null if no resolutions yet
  openCount: number;
  calibration: CalibrationBucket[];
}

/** Brier score + calibration curve per forecaster (hypothesis owner), computed across all their resolved hypotheses. */
export async function scoreForecasters(): Promise<ForecasterScore[]> {
  const rows = await db.select().from(hypotheses);
  const byOwner = new Map<string, { resolved: { probability: number; outcome: boolean }[]; open: number }>();
  for (const h of rows) {
    const bucket = byOwner.get(h.ownerName) ?? { resolved: [], open: 0 };
    if (h.status === "open") {
      bucket.open += 1;
    } else if ((h.status === "resolved_true" || h.status === "resolved_false") && h.outcome !== null) {
      bucket.resolved.push({ probability: Number(h.currentProbability), outcome: h.outcome });
    }
    byOwner.set(h.ownerName, bucket);
  }
  return [...byOwner.entries()]
    .map(([ownerName, bucket]) => ({
      ownerName,
      resolvedCount: bucket.resolved.length,
      brierScore: meanBrierScore(bucket.resolved.map((r) => brierScore(r.probability, r.outcome))),
      openCount: bucket.open,
      calibration: calibrationCurve(bucket.resolved),
    }))
    .sort((a, b) => (a.brierScore ?? 1) - (b.brierScore ?? 1));
}
