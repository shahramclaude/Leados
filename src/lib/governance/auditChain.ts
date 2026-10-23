// Part 19 audit chain — append-only, hash-linked log of every governance
// action. Each entry's hash = sha256(prevHash + canonical(payload)). Any
// retroactive edit breaks the chain and is detectable by verifyChain().

import crypto from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc, asc } from "drizzle-orm";

export type AuditEntryInput = {
  actorId?: number | null;
  actorTier?: string | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  payload?: Record<string, unknown>;
};

/** Deep, key-order-independent canonical JSON (recursively sorts object
 * keys at every nesting level so hashing is sensitive to all content,
 * including nested payload fields, regardless of insertion order). */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value instanceof Date) {
    // Normalise to the same representation Postgres jsonb round-trips to,
    // so hashing is identical whether computed from a fresh JS Date or
    // from a value read back out of the database.
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function computeHash(prevHash: string | null, entry: AuditEntryInput): string {
  const body = canonicalize({
    prevHash: prevHash ?? "GENESIS",
    actorId: entry.actorId ?? null,
    actorTier: entry.actorTier ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: entry.payload ?? {},
  });
  return crypto.createHash("sha256").update(body).digest("hex");
}

export async function appendAuditEntry(entry: AuditEntryInput) {
  const [last] = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(1);

  const prevHash = last?.hash ?? null;
  const hash = computeHash(prevHash, entry);

  const [row] = await db
    .insert(auditLog)
    .values({
      actorId: entry.actorId ?? null,
      actorTier: entry.actorTier ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      payload: entry.payload ?? {},
      prevHash,
      hash,
    })
    .returning();

  return row;
}

/** Walks the whole chain in insertion order and recomputes hashes to detect
 * tampering or gaps. Used by verification and by the governance dashboard. */
export async function verifyChain(): Promise<{
  ok: boolean;
  brokenAt?: number;
  length: number;
}> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.id));
  let prevHash: string | null = null;
  for (const row of rows) {
    const expected = computeHash(prevHash, {
      actorId: row.actorId,
      actorTier: row.actorTier,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: (row.payload as Record<string, unknown>) ?? {},
    });
    if (expected !== row.hash || (row.prevHash ?? null) !== prevHash) {
      return { ok: false, brokenAt: row.id, length: rows.length };
    }
    prevHash = row.hash;
  }
  return { ok: true, length: rows.length };
}
