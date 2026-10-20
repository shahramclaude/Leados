import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { and, count, desc, lt } from "drizzle-orm";
import type { AutomationRun, Page } from "@/lib/domain/types";
import { decodeCursor, encodeCursor, parseLimit } from "../pagination";

function toRecord(row: typeof automationRuns.$inferSelect): AutomationRun {
  return {
    id: row.id,
    kind: row.kind,
    seed: row.seed,
    trials: row.trials,
    input: row.input,
    result: row.result,
    status: row.status as AutomationRun["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertRun(input: {
  kind: string;
  seed: number;
  trials: number;
  input: unknown;
  result: unknown;
}): Promise<AutomationRun> {
  const [row] = await db
    .insert(automationRuns)
    .values({
      kind: input.kind,
      seed: input.seed,
      trials: input.trials,
      input: input.input,
      result: input.result,
    })
    .returning();
  return toRecord(row);
}

export async function listRunsPage(searchParams: URLSearchParams): Promise<Page<AutomationRun>> {
  const limit = parseLimit(searchParams);
  const cursor = decodeCursor(searchParams.get("cursor"));
  const where = cursor ? lt(automationRuns.id, cursor.id) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(automationRuns)
      .where(where ? and(where) : undefined)
      .orderBy(desc(automationRuns.id))
      .limit(limit + 1),
    db.select({ value: count() }).from(automationRuns),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toRecord);
  const nextCursor = hasMore ? encodeCursor({ id: items[items.length - 1].id }) : null;

  return { items, nextCursor, total: totalRow[0]?.value ?? 0 };
}

export async function countRuns(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(automationRuns);
  return row?.value ?? 0;
}

export async function truncateRuns(): Promise<void> {
  await db.delete(automationRuns);
}
