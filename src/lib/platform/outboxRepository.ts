// LEADOS Part 01 — outbox repository.
//
// The outbox ROW is written by src/lib/platform/eventRepository.ts
// (insertEvent), in the same transaction as the triggering event, for any
// event type the catalog marks `notify: true`. This module is the consumer
// side of that contract: drain/ack operations a future realtime/notification
// worker (Part 12) will call. No such worker exists yet in Part 01 — see
// AI-SESSION-LOG.md for the explicit assumptions Part 12 should check.

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { outbox } from "@/db/schema";

export type OutboxRow = typeof outbox.$inferSelect;

/** Fetch up to `limit` pending rows whose availableAt has passed, oldest
 * first. A real worker would call this in a loop with a short poll interval
 * or (better, left for Part 12) LISTEN/NOTIFY on insert. */
export async function listPendingOutbox(limit = 100): Promise<OutboxRow[]> {
  return db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "pending"), lte(outbox.availableAt, new Date())))
    .orderBy(asc(outbox.availableAt))
    .limit(limit);
}

export async function markOutboxSent(id: string): Promise<void> {
  await db.update(outbox).set({ status: "sent", updatedAt: new Date() }).where(eq(outbox.id, id));
}

/** Mark failed with exponential-ish backoff (2^attempts minutes, capped).
 * After 10 attempts the row is marked `dead` so it stops being retried but
 * is still inspectable. */
export async function markOutboxFailed(id: string, error: string): Promise<void> {
  const [row] = await db.select().from(outbox).where(eq(outbox.id, id)).limit(1);
  if (!row) return;
  const attempts = row.attempts + 1;
  const backoffMinutes = Math.min(2 ** attempts, 60 * 24);
  const availableAt = new Date(Date.now() + backoffMinutes * 60_000);
  await db
    .update(outbox)
    .set({
      status: attempts >= 10 ? "dead" : "pending",
      attempts,
      lastError: error.slice(0, 2000),
      availableAt,
      updatedAt: new Date(),
    })
    .where(eq(outbox.id, id));
}

export async function countOutboxByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: outbox.status, count: sql<number>`count(*)::int` })
    .from(outbox)
    .groupBy(outbox.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.count;
  return out;
}
