// src/lib/institutionalMemory.ts
//
// Institutional memory (mission §B): structured retrospectives
// (situation -> decision -> outcome -> lesson -> playbook impact), created
// automatically from Part 10's decision retrospectives
// (`createFromDecisionRetrospective`, wired to the `decision_retrospectives`
// seam table — see schema.ts) and manually via the UI/API
// (`recordRetrospective`). Strength decays per mission's
// s(t) = s0*exp(-Δt/τ) + Σreactivations formula (memory.ts), with a
// documented half-life per memory class. Nothing is ever deleted.
//
// Contract note: this module's exported function names
// (listTimeline/recallOnThisDay/recallThisQuarter/recordRetrospective/
// reinforceRetrospective/memorySummaryByCategory/findSimilarRetrospectives)
// match `src/app/api/memory/route.ts` as already shipped on the upstream
// `main` branch — see the disclosure at the top of schema.ts for why an
// earlier, incompatible `institutionalMemory.ts` (createMemoryNote/
// listMemoryNotes) was replaced rather than kept.
import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { retrospectives, memoryReactivations, decisionRetrospectivesLegacy } from "@/db/schema";
import { ageDays, halfLifeForClass, jaccard, memoryStrength } from "@/lib/memory";

export type OutcomeValence = "positive" | "neutral" | "negative";

export interface RetrospectiveInput {
  title: string;
  situation: string;
  decision: string;
  outcome: string;
  outcomeValence?: OutcomeValence;
  lesson: string;
  playbookUpdate?: string;
  tags?: string[];
  entityIds?: string[];
  memoryClass?: string;
  occurredAt: string; // ISO date
  sourceDecisionRetrospectiveId?: number;
}

export async function recordRetrospective(input: RetrospectiveInput) {
  const [row] = await db
    .insert(retrospectives)
    .values({
      title: input.title,
      situation: input.situation,
      decision: input.decision,
      outcome: input.outcome,
      outcomeValence: input.outcomeValence ?? "neutral",
      lesson: input.lesson,
      playbookUpdate: input.playbookUpdate ?? null,
      tags: input.tags ?? [],
      entityIds: input.entityIds ?? [],
      memoryClass: input.memoryClass ?? "decision",
      occurredAt: input.occurredAt,
      sourceDecisionRetrospectiveId: input.sourceDecisionRetrospectiveId ?? null,
    })
    .returning();
  return row;
}

/** Nightly/manual: scan decision_retrospectives for newly-completed ones and mint an institutional-memory record for each, idempotently. */
export async function createFromDecisionRetrospective(decisionRetroId: number) {
  const [existing] = await db
    .select()
    .from(retrospectives)
    .where(eq(retrospectives.sourceDecisionRetrospectiveId, decisionRetroId))
    .limit(1);
  if (existing) return existing; // idempotent — never double-mint a memory for the same source

  const [source] = await db
    .select()
    .from(decisionRetrospectivesLegacy)
    .where(eq(decisionRetrospectivesLegacy.id, decisionRetroId))
    .limit(1);
  if (!source || !source.completedAt) return null;

  const predicted = source.predicted as Record<string, unknown>;
  const actual = (source.actual ?? {}) as Record<string, unknown>;
  const valence: OutcomeValence = source.calibrationErrorNotes.toLowerCase().includes("worse")
    ? "negative"
    : source.calibrationErrorNotes
    ? "neutral"
    : "positive";

  return recordRetrospective({
    title: `Retro: decision #${source.decisionId}`,
    situation: `Decision #${source.decisionId} was due for review on ${source.dueAt}.`,
    decision: JSON.stringify(predicted),
    outcome: JSON.stringify(actual),
    outcomeValence: valence,
    lesson: source.lessons || "No explicit lesson captured.",
    playbookUpdate: source.lessons && source.lessons.length > 0 ? source.lessons : undefined,
    tags: ["auto-generated", `decision-${source.decisionId}`],
    memoryClass: "decision",
    occurredAt: new Date(source.completedAt).toISOString().slice(0, 10),
    sourceDecisionRetrospectiveId: source.id,
  });
}

/** Every citation/reuse strengthens a memory (mission §B "strengthened by reuse/citation"). The row itself is never edited, only its reactivation log grows. */
export async function reinforceRetrospective(id: number, reason?: string, citedBy?: string, weight = 1) {
  await db.insert(memoryReactivations).values({ retrospectiveId: id, reason: reason ?? null, citedBy: citedBy ?? null, weight: weight.toFixed(3) });
  const [row] = await db
    .update(retrospectives)
    .set({ reactivationCount: sql`${retrospectives.reactivationCount} + 1`, lastReinforcedAt: new Date() })
    .where(eq(retrospectives.id, id))
    .returning();
  return row;
}

export type RetrospectiveWithStrength = typeof retrospectives.$inferSelect & { strength: number; halfLifeDays: number };

async function withStrength(rows: (typeof retrospectives.$inferSelect)[]): Promise<RetrospectiveWithStrength[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const allReactivations = await db.select().from(memoryReactivations);
  const reactivationsById = new Map<number, typeof allReactivations>();
  for (const r of allReactivations) {
    if (!ids.includes(r.retrospectiveId)) continue;
    const list = reactivationsById.get(r.retrospectiveId) ?? [];
    list.push(r);
    reactivationsById.set(r.retrospectiveId, list);
  }
  const now = new Date();
  return rows.map((row) => {
    const halfLifeDays = halfLifeForClass(row.memoryClass);
    const reactivations = (reactivationsById.get(row.id) ?? []).map((r) => ({
      ageDays: ageDays(r.reactivatedAt, now),
      weight: Number(r.weight),
    }));
    const strength = memoryStrength({
      baseStrength: Number(row.baseStrength),
      ageDaysSinceCreation: ageDays(row.createdAt, now),
      halfLifeDays,
      reactivations,
    });
    return { ...row, strength, halfLifeDays };
  });
}

export async function listTimeline(limit = 100): Promise<RetrospectiveWithStrength[]> {
  const rows = await db.select().from(retrospectives).orderBy(desc(retrospectives.occurredAt)).limit(limit);
  return withStrength(rows);
}

/** "On this day" recall: retrospectives whose occurredAt shares today's month+day in any prior year. */
export async function recallOnThisDay(today: Date = new Date()): Promise<RetrospectiveWithStrength[]> {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const rows = await db.execute(sql`
    select * from retrospectives
    where extract(month from occurred_at) = ${month} and extract(day from occurred_at) = ${day}
    order by occurred_at desc
  `);
  return withStrength(rows.rows as unknown as (typeof retrospectives.$inferSelect)[]);
}

/** "On this quarter" recall: retrospectives from the same calendar quarter in any prior year. */
export async function recallThisQuarter(today: Date = new Date()): Promise<RetrospectiveWithStrength[]> {
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  const rows = await db.execute(sql`
    select * from retrospectives
    where extract(quarter from occurred_at) = ${quarter}
    order by occurred_at desc
  `);
  return withStrength(rows.rows as unknown as (typeof retrospectives.$inferSelect)[]);
}

export async function memorySummaryByCategory() {
  const rows = await listTimeline(1000);
  const byClass = new Map<string, { count: number; meanStrength: number; strengths: number[] }>();
  for (const r of rows) {
    const bucket = byClass.get(r.memoryClass) ?? { count: 0, meanStrength: 0, strengths: [] };
    bucket.count += 1;
    bucket.strengths.push(r.strength);
    byClass.set(r.memoryClass, bucket);
  }
  return Array.from(byClass.entries()).map(([memoryClass, bucket]) => ({
    memoryClass,
    count: bucket.count,
    halfLifeDays: halfLifeForClass(memoryClass),
    meanStrength: bucket.strengths.reduce((s, v) => s + v, 0) / bucket.strengths.length,
  }));
}

/**
 * "We faced this before" — similarity surfacing via tag Jaccard overlap
 * against a candidate retrospective's situation tags. Deterministic, no
 * embeddings: this is a keyword/tag primitive, consistent with the rest of
 * this module's refusal to fabricate model-generated similarity claims.
 */
export async function findSimilarRetrospectives(candidate: { tags?: string[]; title?: string }, threshold = 0.25, limit = 5) {
  const candidateTags = new Set(candidate.tags ?? []);
  const all = await db.select().from(retrospectives);
  const scored = all
    .map((r) => ({ row: r, score: jaccard(candidateTags, new Set((r.tags as string[]) ?? [])) }))
    .filter((s) => s.score >= threshold || (candidate.title && s.row.title.toLowerCase().includes(candidate.title.toLowerCase())))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const withStr = await withStrength(scored.map((s) => s.row));
  return withStr.map((row, i) => ({ ...row, similarity: scored[i].score }));
}

export async function listRetrospectivesSince(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db.select().from(retrospectives).where(gte(retrospectives.occurredAt, since.toISOString().slice(0, 10)));
}
