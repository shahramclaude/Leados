// src/lib/institutionalMemory.ts
//
// Every significant outcome becomes a structured retrospective:
// situation -> decision -> outcome -> lesson -> (optional) playbook update.
// Repeated evidence (another retrospective touching the same entities/tags)
// strengthens confidence; time without reinforcement decays it toward a
// floor — but the record itself is never deleted.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { retrospectives } from "@/db/schema";
import { decayedConfidenceAt, reinforce } from "@/lib/memory";
import { jaccard } from "@/lib/knowledgeGraph";
import { indexDocument } from "@/lib/search";

export type OutcomeValence = "positive" | "negative" | "neutral";

export interface RetrospectiveInput {
  title: string;
  situation: string;
  decision: string;
  outcome: string;
  lesson: string;
  playbookUpdate?: string;
  tags?: string[];
  entityIds?: number[];
  outcomeValence?: OutcomeValence;
  occurredAt: string; // ISO date, e.g. "2026-01-15"
  baseConfidence?: number;
}

export async function recordRetrospective(input: RetrospectiveInput) {
  const [row] = await db
    .insert(retrospectives)
    .values({
      title: input.title,
      situation: input.situation,
      decision: input.decision,
      outcome: input.outcome,
      lesson: input.lesson,
      playbookUpdate: input.playbookUpdate ?? null,
      tags: input.tags ?? [],
      entityIds: input.entityIds ?? [],
      outcomeValence: input.outcomeValence ?? "neutral",
      occurredAt: input.occurredAt,
      baseConfidence: input.baseConfidence ?? 0.6,
      evidenceCount: 1,
    })
    .returning();
  await indexRetrospective(row);
  return row;
}

/** A piece of corroborating evidence arrives for an existing retrospective: strengthen it. */
export async function reinforceRetrospective(id: number) {
  const [existing] = await db.select().from(retrospectives).where(eq(retrospectives.id, id)).limit(1);
  if (!existing) throw new Error(`Retrospective ${id} not found`);
  const newBase = reinforce(existing.baseConfidence);
  const [row] = await db
    .update(retrospectives)
    .set({ baseConfidence: newBase, evidenceCount: existing.evidenceCount + 1, lastReinforcedAt: new Date(), updatedAt: new Date() })
    .where(eq(retrospectives.id, id))
    .returning();
  await indexRetrospective(row);
  return row;
}

export interface RetrospectiveWithConfidence {
  id: number;
  title: string;
  situation: string;
  decision: string;
  outcome: string;
  lesson: string;
  playbookUpdate: string | null;
  tags: string[];
  entityIds: number[];
  outcomeValence: string;
  occurredAt: string;
  evidenceCount: number;
  baseConfidence: number;
  currentConfidence: number;
}

function withDecayedConfidence(row: typeof retrospectives.$inferSelect, now = new Date()): RetrospectiveWithConfidence {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    decision: row.decision,
    outcome: row.outcome,
    lesson: row.lesson,
    playbookUpdate: row.playbookUpdate,
    tags: (row.tags as string[]) ?? [],
    entityIds: (row.entityIds as number[]) ?? [],
    outcomeValence: row.outcomeValence,
    occurredAt: String(row.occurredAt),
    evidenceCount: row.evidenceCount,
    baseConfidence: row.baseConfidence,
    currentConfidence: decayedConfidenceAt(row.baseConfidence, row.lastReinforcedAt, now),
  };
}

export async function listTimeline(limit = 100): Promise<RetrospectiveWithConfidence[]> {
  const rows = await db.select().from(retrospectives).orderBy(desc(retrospectives.occurredAt)).limit(limit);
  return rows.map((r) => withDecayedConfidence(r));
}

/** "On this day" / "on this quarter" recall: retrospectives whose occurredAt matches today's month/day (any year), or same quarter. */
export async function recallOnThisDay(today: Date = new Date()): Promise<RetrospectiveWithConfidence[]> {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const rows = await db
    .select()
    .from(retrospectives)
    .where(sql`extract(month from ${retrospectives.occurredAt}) = ${month} and extract(day from ${retrospectives.occurredAt}) = ${day}`)
    .orderBy(desc(retrospectives.occurredAt));
  return rows.map((r) => withDecayedConfidence(r));
}

export async function recallThisQuarter(today: Date = new Date()): Promise<RetrospectiveWithConfidence[]> {
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  const rows = await db
    .select()
    .from(retrospectives)
    .where(sql`ceil(extract(month from ${retrospectives.occurredAt}) / 3.0) = ${quarter}`)
    .orderBy(desc(retrospectives.occurredAt));
  return rows.map((r) => withDecayedConfidence(r));
}

/** Find past retrospectives similar to a candidate (shared tags + shared entities), for recognizing recurring patterns. */
export async function findSimilarRetrospectives(
  candidate: { tags?: string[]; entityIds?: number[] },
  limit = 5
): Promise<{ retrospective: RetrospectiveWithConfidence; similarity: number }[]> {
  const all = await listTimeline(500);
  const candidateTags = new Set(candidate.tags ?? []);
  const candidateEntities = new Set(candidate.entityIds ?? []);
  return all
    .map((r) => {
      const tagSim = jaccard(candidateTags, new Set(r.tags));
      const entitySim = jaccard(candidateEntities, new Set(r.entityIds));
      return { retrospective: r, similarity: tagSim * 0.5 + entitySim * 0.5 };
    })
    .filter((x) => x.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function memorySummaryByCategory(): Promise<{ valence: string; count: number; avgConfidence: number }[]> {
  const all = await listTimeline(1000);
  const groups = new Map<string, { count: number; confSum: number }>();
  for (const r of all) {
    const g = groups.get(r.outcomeValence) ?? { count: 0, confSum: 0 };
    g.count += 1;
    g.confSum += r.currentConfidence;
    groups.set(r.outcomeValence, g);
  }
  return [...groups.entries()].map(([valence, g]) => ({ valence, count: g.count, avgConfidence: g.confSum / g.count }));
}

async function indexRetrospective(row: typeof retrospectives.$inferSelect) {
  await indexDocument({
    sourceType: "retrospective",
    sourceId: row.id,
    title: row.title,
    body: [row.situation, row.decision, row.outcome, row.lesson, row.playbookUpdate ?? ""].join("\n"),
    tags: (row.tags as string[]) ?? [],
    recencyAt: new Date(row.occurredAt),
  });
}
