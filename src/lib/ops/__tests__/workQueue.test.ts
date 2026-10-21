// Injects a failure into the queue directly (mission: "runbooks tested via
// injection") — proves a job that always fails ends up dead-lettered after
// maxAttempts, not stuck retrying forever or silently lost.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { claimDueJobs, deadLetterCount, enqueue, markFailed } from "../workQueue";
import { runWithContext } from "@/lib/obs/context";

const ctx = { correlationId: "wq-test", traceId: "t", spanId: "s", route: "test" };

describe("work queue dead-letter behavior (injected failure)", () => {
  beforeAll(async () => {
    await db.execute(sql`delete from work_queue where job_type = 'test.always_fails'`);
  });
  afterAll(async () => pool.end());

  it("retries with backoff then moves to dead-letter after maxAttempts", async () => {
    const job = await runWithContext(ctx, () => enqueue("test.always_fails", {}, { maxAttempts: 2 }));

    // Attempt 1: claim + fail -> should be requeued (attempts 0 -> 1 < 2)
    let claimed = await claimDueJobs(10);
    const mine = claimed.find((j) => j.id === job.id)!;
    expect(mine).toBeDefined();
    await markFailed(mine.id, mine.attempts, mine.maxAttempts, "injected failure #1");

    const [afterFirstFailure] = await db.execute(sql`select status, attempts, available_at from work_queue where id = ${job.id}`).then((r) => r.rows as { status: string; attempts: number; available_at: Date }[]);
    expect(afterFirstFailure.status).toBe("queued");
    expect(afterFirstFailure.attempts).toBe(1);

    // Force available_at into the past so the backoff doesn't block the test.
    await db.execute(sql`update work_queue set available_at = now() - interval '1 minute' where id = ${job.id}`);

    // Attempt 2: claim + fail -> attempts 1 -> 2 >= maxAttempts(2) -> dead
    claimed = await claimDueJobs(10);
    const mine2 = claimed.find((j) => j.id === job.id)!;
    expect(mine2).toBeDefined();
    await markFailed(mine2.id, mine2.attempts, mine2.maxAttempts, "injected failure #2");

    const [finalRow] = await db.execute(sql`select status from work_queue where id = ${job.id}`).then((r) => r.rows as { status: string }[]);
    expect(finalRow.status).toBe("dead");
    expect(await deadLetterCount()).toBeGreaterThanOrEqual(1);
  });
});
