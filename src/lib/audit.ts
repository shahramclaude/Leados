// LEADOS — Part 38 / Part 19 compatibility shim: hash-chained audit log.
//
// Every assurance action (check run with a breach, remediation applied or
// reverted, feature flag degraded/restored, nightly report generated) is
// appended here. The chain is a simple linked hash (like a mini blockchain)
// so `npm run audit:verify` can prove the sequence has not been silently
// edited after the fact. This is deliberately NOT a cryptographic proof of
// the *original* truthfulness of an entry (see Blind Spots) — only of
// non-tampering after it was written.

import crypto from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const GENESIS_HASH = "0".repeat(64);

// Postgres `jsonb` columns do NOT preserve key insertion order on round-trip
// (it normalizes storage), so hashing `JSON.stringify(x)` directly would make
// the *same logical value* hash differently depending on whether it was just
// inserted (JS object, original key order) or re-read from the DB (jsonb,
// normalized order). We canonicalize (recursively sort object keys) before
// hashing so the hash is a pure function of the *value*, not its encoding.
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function computeHash(input: {
  seq: number;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: unknown;
  afterState: unknown;
  prevHash: string;
}): string {
  const payload = canonicalStringify({
    seq: input.seq,
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    prevHash: input.prevHash,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function appendAudit(entry: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  const [last] = await db
    .select({ seq: auditLog.seq, hash: auditLog.hash })
    .from(auditLog)
    .orderBy(desc(auditLog.seq))
    .limit(1);

  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const hash = computeHash({
    seq,
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeState: entry.beforeState,
    afterState: entry.afterState,
    prevHash,
  });

  const [row] = await db
    .insert(auditLog)
    .values({
      seq,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeState: entry.beforeState ?? null,
      afterState: entry.afterState ?? null,
      prevHash,
      hash,
    })
    .returning();

  return row;
}

export interface AuditVerifyResult {
  ok: boolean;
  entriesChecked: number;
  brokenAtSeq: number | null;
  reason: string | null;
}

/** Recomputes the whole chain and reports the first break, if any. */
export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const rows = await db.select().from(auditLog).orderBy(auditLog.seq);
  let expectedPrev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        ok: false,
        entriesChecked: rows.length,
        brokenAtSeq: row.seq,
        reason: `prevHash mismatch at seq ${row.seq}: expected ${expectedPrev}, found ${row.prevHash}`,
      };
    }
    const recomputed = computeHash({
      seq: row.seq,
      actor: row.actor,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeState: row.beforeState,
      afterState: row.afterState,
      prevHash: row.prevHash,
    });
    if (recomputed !== row.hash) {
      return {
        ok: false,
        entriesChecked: rows.length,
        brokenAtSeq: row.seq,
        reason: `hash mismatch at seq ${row.seq}: stored row content does not match its recorded hash`,
      };
    }
    expectedPrev = row.hash;
  }
  return { ok: true, entriesChecked: rows.length, brokenAtSeq: null, reason: null };
}

export async function getAuditTrailFor(entityType: string, entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityType, entityType))
    .then((rows) => rows.filter((r) => r.entityId === entityId).sort((a, b) => a.seq - b.seq));
}
