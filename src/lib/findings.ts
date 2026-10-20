// src/lib/findings.ts — paginated, indexed findings access.
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { decodeCursor, encodeCursor, parseLimit, type Page } from "./pagination";

export interface FindingRecord {
  id: number;
  title: string;
  summary: string;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
  status: string;
  createdAt: string;
}

function toRecord(row: typeof findings.$inferSelect): FindingRecord {
  return { ...row, score: Number(row.score), createdAt: row.createdAt.toISOString() };
}

export async function listFindings(searchParams: URLSearchParams): Promise<Page<FindingRecord>> {
  const limit = parseLimit(searchParams);
  const status = searchParams.get("status");
  const cursor = decodeCursor(searchParams.get("cursor"));

  const conditions = [];
  if (status) conditions.push(eq(findings.status, status));
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(lt(findings.createdAt, cursorDate), and(eq(findings.createdAt, cursorDate), lt(findings.id, cursor.id))),
    );
  }

  const rows = await db
    .select()
    .from(findings)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(findings.createdAt), desc(findings.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toRecord),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

export async function countOpenFindings(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(findings)
    .where(eq(findings.status, "open"));
  return row?.count ?? 0;
}

export class ValidationError extends Error {}

export async function createFinding(input: {
  title: string;
  summary?: string;
  impact: number;
  confidence: number;
  effort: number;
}): Promise<FindingRecord> {
  if (!input.title.trim()) throw new ValidationError("title is required");
  if (![input.impact, input.confidence, input.effort].every((n) => Number.isFinite(n) && n >= 0 && n <= 10)) {
    throw new ValidationError("impact, confidence and effort must be numbers between 0 and 10");
  }
  const score = (input.impact * input.confidence) / Math.max(1, input.effort);
  const [row] = await db
    .insert(findings)
    .values({
      title: input.title,
      summary: input.summary ?? "",
      impact: input.impact,
      confidence: input.confidence,
      effort: input.effort,
      score: score.toFixed(4),
    })
    .returning();
  return toRecord(row);
}
