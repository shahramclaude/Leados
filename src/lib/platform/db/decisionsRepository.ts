import { db } from "@/db";
import { decisions } from "@/db/schema";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Decision, Page } from "@/lib/domain/types";
import { betaMean } from "@/lib/domain/bayesian";
import { decodeCursor, encodeCursor, parseLimit } from "../pagination";

function toRecord(row: typeof decisions.$inferSelect): Decision {
  const posteriorAlpha = Number(row.posteriorAlpha);
  const posteriorBeta = Number(row.posteriorBeta);
  return {
    id: row.id,
    title: row.title,
    context: row.context,
    priorAlpha: Number(row.priorAlpha),
    priorBeta: Number(row.priorBeta),
    posteriorAlpha,
    posteriorBeta,
    beliefMean: betaMean({ alpha: posteriorAlpha, beta: posteriorBeta }),
    status: row.status as Decision["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function insertDecision(input: {
  title: string;
  context: string;
  priorAlpha: number;
  priorBeta: number;
}): Promise<Decision> {
  const [row] = await db
    .insert(decisions)
    .values({
      title: input.title,
      context: input.context,
      priorAlpha: input.priorAlpha.toString(),
      priorBeta: input.priorBeta.toString(),
      posteriorAlpha: input.priorAlpha.toString(),
      posteriorBeta: input.priorBeta.toString(),
    })
    .returning();
  return toRecord(row);
}

export async function getDecisionById(id: number): Promise<Decision | null> {
  const [row] = await db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function updateDecisionPosterior(
  id: number,
  posterior: { alpha: number; beta: number },
  status?: Decision["status"],
): Promise<Decision | null> {
  const [row] = await db
    .update(decisions)
    .set({
      posteriorAlpha: posterior.alpha.toString(),
      posteriorBeta: posterior.beta.toString(),
      status: status ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, id))
    .returning();
  return row ? toRecord(row) : null;
}

export async function listDecisionsPage(searchParams: URLSearchParams): Promise<Page<Decision>> {
  const limit = parseLimit(searchParams);
  const cursor = decodeCursor(searchParams.get("cursor"));
  const where = cursor ? lt(decisions.id, cursor.id) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(decisions)
      .where(where ? and(where) : undefined)
      .orderBy(desc(decisions.id))
      .limit(limit + 1),
    db.select({ value: count() }).from(decisions),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toRecord);
  const nextCursor = hasMore ? encodeCursor({ id: items[items.length - 1].id }) : null;

  return { items, nextCursor, total: totalRow[0]?.value ?? 0 };
}

export async function listRecentDecisions(n: number): Promise<Decision[]> {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.id)).limit(n);
  return rows.map(toRecord);
}

export async function countDecisions(status?: Decision["status"]): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(decisions)
    .where(status ? eq(decisions.status, status) : undefined);
  return row?.value ?? 0;
}

export async function truncateDecisions(): Promise<void> {
  await db.delete(decisions);
}
