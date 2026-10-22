// Hash-chained audit log writer (stand-in for Part 19's audit chain, which
// does not exist in this checkout — see Phase 0 findings). Each row's hash
// commits to the previous row's hash plus its own content, so a gap or
// tamper is detectable by recomputing the chain.
import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCorrelationId } from "./context";
import { redact } from "./redact";

const GENESIS_HASH = "0".repeat(64);

function computeHash(prevHash: string, actor: string, action: string, payload: unknown, createdAt: string): string {
  const h = createHash("sha256");
  h.update(prevHash);
  h.update("|");
  h.update(actor);
  h.update("|");
  h.update(action);
  h.update("|");
  h.update(JSON.stringify(payload));
  h.update("|");
  h.update(createdAt);
  return h.digest("hex");
}

export async function appendAuditEvent(actor: string, action: string, payload: unknown = {}) {
  const [last] = await db
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.seq))
    .limit(1);
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  const safePayload = redact(payload);
  const hash = computeHash(prevHash, actor, action, safePayload, createdAt.toISOString());

  const [row] = await db
    .insert(auditEvents)
    .values({
      actor,
      action,
      payload: safePayload as object,
      correlationId: getCorrelationId(),
      prevHash,
      hash,
      createdAt,
    })
    .returning();
  return row;
}

export interface ChainVerificationResult {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
}

/** Recompute the chain from genesis and confirm no gaps/tamper — used by the
 * audit-investigation-export runbook. */
export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    const expected = computeHash(prevHash, row.actor, row.action, row.payload, row.createdAt.toISOString());
    if (expected !== row.hash || row.prevHash !== prevHash) {
      return { ok: false, checked: rows.length, brokenAtSeq: row.seq };
    }
    prevHash = row.hash;
  }
  return { ok: true, checked: rows.length, brokenAtSeq: null };
}
