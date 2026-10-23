// Pre-read tracking: who opened/acknowledged the pack, aggregated into a
// board-level governance metric (never a public per-director shaming list —
// the raw rows exist for audit, but the default surface is the aggregate).

import { db } from "@/db";
import { preReadTracking } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function recordPackOpened(packId: number, userId: number, when: Date = new Date()) {
  const existing = await db
    .select()
    .from(preReadTracking)
    .where(and(eq(preReadTracking.packId, packId), eq(preReadTracking.userId, userId)));

  if (existing.length > 0) {
    const [row] = await db
      .update(preReadTracking)
      .set({ openedAt: existing[0].openedAt ?? when })
      .where(eq(preReadTracking.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(preReadTracking)
    .values({ packId, userId, openedAt: when })
    .returning();
  return row;
}

export async function recordPackAcknowledged(
  packId: number,
  userId: number,
  timeSpentSeconds: number,
  when: Date = new Date(),
) {
  const existing = await db
    .select()
    .from(preReadTracking)
    .where(and(eq(preReadTracking.packId, packId), eq(preReadTracking.userId, userId)));

  if (existing.length === 0) {
    const [row] = await db
      .insert(preReadTracking)
      .values({
        packId,
        userId,
        openedAt: when,
        acknowledgedAt: when,
        timeSpentSeconds,
      })
      .returning();
    return row;
  }

  const [row] = await db
    .update(preReadTracking)
    .set({ acknowledgedAt: when, timeSpentSeconds })
    .where(eq(preReadTracking.id, existing[0].id))
    .returning();
  return row;
}

/** Board-level aggregate only: fraction of expected readers who
 * acknowledged, and mean time spent. No per-director breakdown here. */
export async function aggregatePreReadMetric(packId: number, expectedReaderCount: number) {
  const rows = await db
    .select()
    .from(preReadTracking)
    .where(eq(preReadTracking.packId, packId));

  const acknowledged = rows.filter((r) => r.acknowledgedAt !== null);
  const avgSeconds =
    acknowledged.length > 0
      ? acknowledged.reduce((sum, r) => sum + r.timeSpentSeconds, 0) / acknowledged.length
      : 0;

  return {
    packId,
    expectedReaderCount,
    openedCount: rows.filter((r) => r.openedAt !== null).length,
    acknowledgedCount: acknowledged.length,
    completionRate:
      expectedReaderCount > 0 ? acknowledged.length / expectedReaderCount : 0,
    averageTimeSpentSeconds: Math.round(avgSeconds),
  };
}
