// Hash-chained audit log (Part 17 lineage): append-only, each row commits to
// sha256(prevHash + seq + actor + action + resource + payload). Any gap or
// tamper is detectable by replaying the chain and recomputing hashes.
import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getContext } from "@/lib/obs/context";
import { withDbSpan } from "@/lib/obs/tracing";

export const GENESIS_HASH = "0".repeat(64);

function computeHash(prevHash: string, seq: number | string, actor: string, action: string, resource: string, payload: unknown): string {
  const h = createHash("sha256");
  h.update(prevHash);
  h.update(String(seq));
  h.update(actor);
  h.update(action);
  h.update(resource);
  h.update(JSON.stringify(payload));
  return h.digest("hex");
}

export async function appendAudit(actor: string, action: string, resource: string, payload: Record<string, unknown> = {}) {
  const ctx = getContext();
  return withDbSpan("auditLog.append", () =>
    db.transaction(async (tx) => {
      const [last] = await tx.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
      const prevHash = last?.hash ?? GENESIS_HASH;
      // seq is bigserial; compute hash against the *next* seq deterministically
      // by inserting first, then updating the hash with the real seq value.
      const [inserted] = await tx
        .insert(auditLog)
        .values({ actor, action, resource, payload, correlationId: ctx.correlationId, prevHash, hash: "" })
        .returning();
      const hash = computeHash(prevHash, inserted.seq, actor, action, resource, payload);
      const [finalRow] = await tx
        .update(auditLog)
        .set({ hash })
        .where(eq(auditLog.seq, inserted.seq))
        .returning();
      return finalRow;
    }),
  );
}

export interface ChainVerification {
  ok: boolean;
  rowsChecked: number;
  firstBrokenSeq: number | null;
  reason: string | null;
}

/** Replay the whole chain (or a slice) and verify every hash link. Used by
 * `/api/audit/verify` and the backup-restore drill to prove the restored
 * database's audit trail wasn't corrupted in transit. */
export async function verifyChain(limit?: number): Promise<ChainVerification> {
  const rows = await db.select().from(auditLog).orderBy(auditLog.seq).limit(limit ?? 1_000_000);
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    const expected = computeHash(prevHash, row.seq, row.actor, row.action, row.resource, row.payload);
    if (row.prevHash !== prevHash || row.hash !== expected) {
      return { ok: false, rowsChecked: rows.length, firstBrokenSeq: row.seq, reason: row.prevHash !== prevHash ? "prev_hash_mismatch" : "hash_mismatch" };
    }
    prevHash = row.hash;
  }
  return { ok: true, rowsChecked: rows.length, firstBrokenSeq: null, reason: null };
}

export async function exportSlice(fromSeq: number, toSeq: number) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(gte(auditLog.seq, fromSeq), lte(auditLog.seq, toSeq)))
    .orderBy(auditLog.seq);
  const verification = await verifyChain();
  return { rows, verification, exportedAt: new Date().toISOString() };
}
