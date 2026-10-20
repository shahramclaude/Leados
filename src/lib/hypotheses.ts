// src/lib/hypotheses.ts
//
// Hypotheses as living bets: register -> evidence accumulation (Bayesian
// log-odds update, shared engine in memory.ts) -> resolve -> score the
// forecaster (Brier score). Backs the prediction-market-style Hypotheses
// page: open bets, current probability, evidence log, resolution date,
// Brier score per owner.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { hypotheses, hypothesisEvidence } from "@/db/schema";
import { applyLikelihoodRatio, brierScore, meanBrierScore } from "@/lib/memory";
import { indexDocument } from "@/lib/search";

export type HypothesisStatus = "open" | "resolved_true" | "resolved_false" | "retired";

export interface RegisterHypothesisInput {
  key: string;
  title: string;
  description?: string;
  ownerName: string;
  category?: string;
  priorProbability?: number; // defaults to 0.5
  resolutionDate?: string; // ISO date
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
      priorProbability: prior,
      currentProbability: prior,
      resolutionDate: input.resolutionDate ?? null,
      status: "open",
    })
    .returning();
  await indexHypothesis(row);
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
 * (i.e. < 1 for "against" evidence) — we validate consistency.
 */
export async function addEvidence(input: AddEvidenceInput) {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, input.hypothesisId)).limit(1);
  if (!h) throw new Error(`Hypothesis ${input.hypothesisId} not found`);
  if (h.status !== "open") throw new Error(`Hypothesis ${input.hypothesisId} is not open (status=${h.status})`);

  const lr = input.likelihoodRatio;
  if (input.direction === "supports" && lr < 1) throw new Error("Supporting evidence must have likelihoodRatio >= 1");
  if (input.direction === "against" && lr > 1) throw new Error("Against evidence must have likelihoodRatio <= 1");

  const before = h.currentProbability;
  const after = applyLikelihoodRatio(before, lr);

  const [evidenceRow] = await db
    .insert(hypothesisEvidence)
    .values({
      hypothesisId: input.hypothesisId,
      description: input.description,
      direction: input.direction,
      likelihoodRatio: lr,
      probabilityBefore: before,
      probabilityAfter: after,
      source: input.source ?? null,
    })
    .returning();

  const [updated] = await db
    .update(hypotheses)
    .set({ currentProbability: after, updatedAt: new Date() })
    .where(eq(hypotheses.id, input.hypothesisId))
    .returning();

  await indexHypothesis(updated);
  return { hypothesis: updated, evidence: evidenceRow };
}

export async function resolveHypothesis(id: number, outcome: boolean) {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!h) throw new Error(`Hypothesis ${id} not found`);
  const [row] = await db
    .update(hypotheses)
    .set({
      status: outcome ? "resolved_true" : "resolved_false",
      outcome,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hypotheses.id, id))
    .returning();
  await indexHypothesis(row);
  return row;
}

export async function retireHypothesis(id: number) {
  const [row] = await db
    .update(hypotheses)
    .set({ status: "retired", updatedAt: new Date() })
    .where(eq(hypotheses.id, id))
    .returning();
  await indexHypothesis(row);
  return row;
}

export async function getHypothesisWithEvidence(id: number) {
  const [h] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!h) return null;
  const evidence = await db
    .select()
    .from(hypothesisEvidence)
    .where(eq(hypothesisEvidence.hypothesisId, id))
    .orderBy(hypothesisEvidence.createdAt);
  const brier = h.outcome === null || h.outcome === undefined ? null : brierScore(h.currentProbability, h.outcome);
  return { ...h, evidence, brierScore: brier };
}

export async function listHypotheses(status?: HypothesisStatus) {
  const rows = status
    ? await db.select().from(hypotheses).where(eq(hypotheses.status, status)).orderBy(desc(hypotheses.updatedAt))
    : await db.select().from(hypotheses).orderBy(desc(hypotheses.updatedAt));
  return rows;
}

export interface ForecasterScore {
  ownerName: string;
  resolvedCount: number;
  brierScore: number | null; // lower is better; null if no resolutions yet
  openCount: number;
}

/** Brier score per forecaster (hypothesis owner), computed across all their resolved hypotheses. */
export async function scoreForecasters(): Promise<ForecasterScore[]> {
  const rows = await db.select().from(hypotheses);
  const byOwner = new Map<string, { resolved: number[]; open: number }>();
  for (const h of rows) {
    const bucket = byOwner.get(h.ownerName) ?? { resolved: [], open: 0 };
    if (h.status === "open") {
      bucket.open += 1;
    } else if ((h.status === "resolved_true" || h.status === "resolved_false") && h.outcome !== null) {
      bucket.resolved.push(brierScore(h.currentProbability, h.outcome));
    }
    byOwner.set(h.ownerName, bucket);
  }
  return [...byOwner.entries()]
    .map(([ownerName, bucket]) => ({
      ownerName,
      resolvedCount: bucket.resolved.length,
      brierScore: meanBrierScore(bucket.resolved),
      openCount: bucket.open,
    }))
    .sort((a, b) => (a.brierScore ?? 1) - (b.brierScore ?? 1));
}

async function indexHypothesis(row: typeof hypotheses.$inferSelect) {
  await indexDocument({
    sourceType: "hypothesis",
    sourceId: row.id,
    title: row.title,
    body: `${row.description ?? ""} owner:${row.ownerName} status:${row.status} p=${row.currentProbability.toFixed(2)}`,
    tags: row.category ? [row.category] : [],
    recencyAt: row.updatedAt,
  });
}
