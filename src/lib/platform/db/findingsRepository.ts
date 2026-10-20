import { db } from "@/db";
import { findings } from "@/db/schema";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Finding, Page } from "@/lib/domain/types";
import { decodeCursor, encodeCursor, parseLimit } from "../pagination";

function toRecord(row: typeof findings.$inferSelect): Finding {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    confidence: row.confidence,
    effort: row.effort,
    score: Number(row.score),
    status: row.status as Finding["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function insertFinding(input: {
  title: string;
  summary: string;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
}): Promise<Finding> {
  const [row] = await db
    .insert(findings)
    .values({
      title: input.title,
      summary: input.summary,
      impact: input.impact,
      confidence: input.confidence,
      effort: input.effort,
      score: input.score.toString(),
    })
    .returning();
  return toRecord(row);
}

export async function getFindingById(id: number): Promise<Finding | null> {
  const [row] = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function listFindingsPage(searchParams: URLSearchParams): Promise<Page<Finding>> {
  const limit = parseLimit(searchParams);
  const cursor = decodeCursor(searchParams.get("cursor"));
  const where = cursor ? lt(findings.id, cursor.id) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(findings)
      .where(where ? and(where) : undefined)
      .orderBy(desc(findings.id))
      .limit(limit + 1),
    db.select({ value: count() }).from(findings),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toRecord);
  const nextCursor = hasMore ? encodeCursor({ id: items[items.length - 1].id }) : null;

  return { items, nextCursor, total: totalRow[0]?.value ?? 0 };
}

export async function listTopFindings(n: number): Promise<Finding[]> {
  const rows = await db.select().from(findings).orderBy(desc(findings.score)).limit(n);
  return rows.map(toRecord);
}

export async function countFindings(status?: Finding["status"]): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(findings)
    .where(status ? eq(findings.status, status) : undefined);
  return row?.value ?? 0;
}

export async function truncateFindings(): Promise<void> {
  await db.delete(findings);
}
