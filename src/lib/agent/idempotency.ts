// LEADOS Agent Kernel — idempotency guard.
//
// Every write-capable tool call is keyed by `${runId}:${nodeId}:${attempt==1
// marker}` -> in practice we use `${runId}:${nodeId}` so that retries of the
// SAME node (same attempt lineage) can never double-execute, even if the
// executor crashes mid-step and the queue worker re-picks the run. This is
// enforced with a real Postgres UNIQUE constraint
// (`idempotency_keys_key_uidx`), not an in-memory set, so it survives
// process restarts.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";

export function idempotencyKeyFor(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

export interface IdempotencyClaim {
  claimed: boolean; // true if this call won the race and should execute
  key: string;
}

// Attempts to claim the key. Returns claimed=true exactly once per key,
// ever — subsequent calls (retries, duplicate worker picks) return
// claimed=false and MUST NOT re-run the tool's side effect.
export async function claimIdempotencyKey(
  runId: string,
  nodeId: string
): Promise<IdempotencyClaim> {
  const key = idempotencyKeyFor(runId, nodeId);
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ key, runId, nodeId })
    .onConflictDoNothing({ target: idempotencyKeys.key })
    .returning({ id: idempotencyKeys.id });
  return { claimed: inserted.length === 1, key };
}

export async function recordIdempotentResult(key: string, resultHash: string): Promise<void> {
  await db.execute(
    sql`update idempotency_keys set result_hash = ${resultHash} where key = ${key}`
  );
}

export async function releaseIdempotencyKey(key: string): Promise<void> {
  // Used only when a step fails before producing any side effect, so a
  // legitimate retry can re-claim the same key instead of being starved.
  await db.execute(sql`delete from idempotency_keys where key = ${key} and result_hash is null`);
}
