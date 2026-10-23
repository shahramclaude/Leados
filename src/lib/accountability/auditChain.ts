// LEADOS — Part 56: audit chain (Part 19 stand-in).
// Simple hash-linked append-only log: hash_n = sha256(prevHash + systemKey +
// action + JSON(payload) + createdAt). Lets conformity export include a
// tamper-evidence slice and lets `verifyChain` prove integrity on demand.
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditChainEntries } from "@/db/schema";

const GENESIS_HASH = "0".repeat(64);

/**
 * Postgres JSONB does not preserve object key insertion order (and may
 * reformat numbers), so hashing `JSON.stringify(payloadFromDb)` as read back
 * from the database would NOT reproduce the hash computed at insert time
 * from the original JS object. Canonicalizing (recursively sorting object
 * keys) before hashing makes the digest stable across that round-trip.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
}

function computeHash(params: {
  prevHash: string;
  systemKey: string;
  action: string;
  payload: Record<string, unknown>;
  createdAtIso: string;
}): string {
  return createHash("sha256")
    .update(params.prevHash)
    .update(params.systemKey)
    .update(params.action)
    .update(canonicalStringify(params.payload))
    .update(params.createdAtIso)
    .digest("hex");
}

export async function appendAuditEntry(params: {
  systemKey: string;
  actorId: string;
  action: string;
  payload: Record<string, unknown>;
}) {
  const existing = await db
    .select()
    .from(auditChainEntries)
    .where(eq(auditChainEntries.systemKey, params.systemKey))
    .orderBy(asc(auditChainEntries.seq));

  const last = existing[existing.length - 1];
  const prevHash = last ? last.hash : GENESIS_HASH;
  const seq = last ? last.seq + 1 : 1;
  const createdAt = new Date();
  const hash = computeHash({
    prevHash,
    systemKey: params.systemKey,
    action: params.action,
    payload: params.payload,
    createdAtIso: createdAt.toISOString(),
  });

  const [row] = await db
    .insert(auditChainEntries)
    .values({
      seq,
      systemKey: params.systemKey,
      actorId: params.actorId,
      action: params.action,
      payload: params.payload,
      prevHash,
      hash,
      createdAt,
    })
    .returning();

  return row;
}

export async function getChain(systemKey: string) {
  return db
    .select()
    .from(auditChainEntries)
    .where(eq(auditChainEntries.systemKey, systemKey))
    .orderBy(asc(auditChainEntries.seq));
}

export interface ChainVerificationResult {
  systemKey: string;
  entryCount: number;
  valid: boolean;
  brokenAtSeq: number | null;
}

export async function verifyChain(systemKey: string): Promise<ChainVerificationResult> {
  const entries = await getChain(systemKey);
  let expectedPrev = GENESIS_HASH;

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return { systemKey, entryCount: entries.length, valid: false, brokenAtSeq: entry.seq };
    }
    const recomputed = computeHash({
      prevHash: entry.prevHash,
      systemKey: entry.systemKey,
      action: entry.action,
      payload: entry.payload,
      createdAtIso: entry.createdAt.toISOString(),
    });
    if (recomputed !== entry.hash) {
      return { systemKey, entryCount: entries.length, valid: false, brokenAtSeq: entry.seq };
    }
    expectedPrev = entry.hash;
  }

  return { systemKey, entryCount: entries.length, valid: true, brokenAtSeq: null };
}
