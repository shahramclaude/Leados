// Postgres-backed durable work queue (the Part 07 kernel lineage):
// enqueue -> claim with `FOR UPDATE SKIP LOCKED` -> succeed/fail with
// exponential backoff -> dead-letter after maxAttempts.
import { db } from "@/db";
import { workQueue } from "@/db/schema";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { withDbSpan } from "@/lib/obs/tracing";
import { getContext } from "@/lib/obs/context";
import { logger } from "@/lib/obs/logger";

export interface QueuedJob {
  id: string;
  jobType: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  correlationId: string | null;
}

export async function enqueue(jobType: string, payload: Record<string, unknown> = {}, opts: { availableAt?: Date; maxAttempts?: number } = {}) {
  const ctx = getContext();
  return withDbSpan(`workQueue.enqueue(${jobType})`, async () => {
    const [row] = await db
      .insert(workQueue)
      .values({
        jobType,
        payload,
        availableAt: opts.availableAt ?? new Date(),
        maxAttempts: opts.maxAttempts ?? 5,
        correlationId: ctx.correlationId,
      })
      .returning();
    logger.info("queue.enqueued", { jobType, id: row.id });
    return row;
  });
}

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Claim up to `limit` due jobs atomically, marking them `running`. Uses
 * `SKIP LOCKED` so multiple workers (or a future multi-replica deployment)
 * never double-process the same row — documented single-instance caveat:
 * there is exactly one scheduler loop per process in this deployment, this
 * is defense-in-depth, not a distributed-lock substitute for N replicas. */
export async function claimDueJobs(limit = 5): Promise<QueuedJob[]> {
  return withDbSpan("workQueue.claim", () =>
    db.transaction(async (tx) => {
      const due = await tx.execute(sql`
        select id from work_queue
        where status = 'queued' and available_at <= now()
        order by available_at asc
        limit ${limit}
        for update skip locked
      `);
      const ids = (due.rows as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) return [];
      const claimed = await tx
        .update(workQueue)
        .set({ status: "running", lockedAt: new Date(), lockedBy: WORKER_ID, updatedAt: new Date() })
        .where(sql`id = any(${ids})`)
        .returning();
      return claimed.map((r) => ({
        id: r.id,
        jobType: r.jobType,
        payload: r.payload,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        correlationId: r.correlationId,
      }));
    }),
  );
}

export async function markSucceeded(id: string) {
  await db.update(workQueue).set({ status: "succeeded", updatedAt: new Date() }).where(eq(workQueue.id, id));
}

/** Fail a job: retry with exponential backoff (2^attempts seconds, capped at
 * 10 minutes) until maxAttempts, then move to the dead-letter state. */
export async function markFailed(id: string, attempts: number, maxAttempts: number, error: string) {
  const nextAttempts = attempts + 1;
  if (nextAttempts >= maxAttempts) {
    await db
      .update(workQueue)
      .set({ status: "dead", attempts: nextAttempts, lastError: error, updatedAt: new Date() })
      .where(eq(workQueue.id, id));
    logger.error("queue.dead_letter", { id, attempts: nextAttempts, error });
    return;
  }
  const backoffSeconds = Math.min(2 ** nextAttempts, 600);
  await db
    .update(workQueue)
    .set({
      status: "queued",
      attempts: nextAttempts,
      lastError: error,
      availableAt: new Date(Date.now() + backoffSeconds * 1000),
      updatedAt: new Date(),
    })
    .where(eq(workQueue.id, id));
  logger.warn("queue.retry_scheduled", { id, attempts: nextAttempts, backoffSeconds, error });
}

export async function requeueDeadLetter(id: string) {
  await db
    .update(workQueue)
    .set({ status: "queued", attempts: 0, lastError: null, availableAt: new Date(), updatedAt: new Date() })
    .where(and(eq(workQueue.id, id), eq(workQueue.status, "dead")));
}

export async function queueDepthByStatus() {
  const rows = await withDbSpan("workQueue.depth", () =>
    db.execute(sql`select status, count(*)::int as count from work_queue group by status`),
  );
  return rows.rows as { status: string; count: number }[];
}

export async function oldestAgeSecondsByStatus(status: "queued" | "running") {
  const rows = await db.execute(sql`
    select extract(epoch from (now() - min(available_at)))::float as age
    from work_queue where status = ${status}
  `);
  return (rows.rows[0] as { age: number | null } | undefined)?.age ?? null;
}

export async function deadLetterRows(limit = 50) {
  return db.select().from(workQueue).where(eq(workQueue.status, "dead")).orderBy(asc(workQueue.updatedAt)).limit(limit);
}

export async function deadLetterCount(): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as count from work_queue where status = 'dead'`);
  return (rows.rows[0] as { count: number }).count;
}

export async function staleRunningJobs(olderThanMs: number) {
  const cutoff = new Date(Date.now() - olderThanMs);
  return db.select().from(workQueue).where(and(eq(workQueue.status, "running"), lt(workQueue.lockedAt, cutoff)));
}
