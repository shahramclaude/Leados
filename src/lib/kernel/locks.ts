// Entity locks — mitigation for two concurrent runs conflicting on the same
// entity. Any step whose `input`/metadata carries an `entityKey` must hold a
// short-TTL advisory lock on that key for the duration of execute()+verify().
// A second run trying to touch the same entity gets a `transient` failure
// (lock_contention) and is retried with backoff rather than racing the first
// run's write + compensation logic.
import { db } from "@/db";
import { kernelLocks } from "@/db/schema";
import { eq, lt } from "drizzle-orm";

const DEFAULT_TTL_MS = 10_000;

export class LockContentionError extends Error {
  constructor(entityKey: string, heldByRunId: string) {
    super(`entity "${entityKey}" is locked by run ${heldByRunId}`);
    this.name = "LockContentionError";
  }
}

export async function acquireLock(entityKey: string, runId: string, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  // Clear expired locks first so a crashed holder doesn't block forever.
  await db.delete(kernelLocks).where(lt(kernelLocks.expiresAt, new Date()));

  const [existing] = await db.select().from(kernelLocks).where(eq(kernelLocks.entityKey, entityKey)).limit(1);
  if (existing && existing.runId !== runId) {
    throw new LockContentionError(entityKey, existing.runId);
  }
  if (existing && existing.runId === runId) {
    // Re-entrant within the same run: extend the lease.
    await db
      .update(kernelLocks)
      .set({ expiresAt: new Date(Date.now() + ttlMs) })
      .where(eq(kernelLocks.entityKey, entityKey));
    return;
  }
  await db.insert(kernelLocks).values({ entityKey, runId, expiresAt: new Date(Date.now() + ttlMs) });
}

export async function releaseLock(entityKey: string, runId: string): Promise<void> {
  const [existing] = await db.select().from(kernelLocks).where(eq(kernelLocks.entityKey, entityKey)).limit(1);
  if (existing && existing.runId === runId) {
    await db.delete(kernelLocks).where(eq(kernelLocks.entityKey, entityKey));
  }
}
