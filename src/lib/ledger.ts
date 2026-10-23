import { createHash } from "crypto";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export const GENESIS_HASH = "0".repeat(64);

export interface AppendDecisionInput {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: unknown;
  rationale: string;
}

/**
 * PostgreSQL's `jsonb` column type normalizes object key order on storage,
 * so a payload re-read from the database can produce a *different*
 * `JSON.stringify` output than the exact object that was written — even
 * though no bytes were tampered with. To keep hashes stable across a
 * write -> read round-trip, every value is serialized through this
 * recursive, sorted-key canonical form before hashing, both when a record
 * is appended and when the chain is later verified.
 */
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`,
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeHash(params: {
  tenantId: string;
  sequence: number;
  entityType: string;
  entityId: string;
  action: string;
  payload: unknown;
  rationale: string;
  prevHash: string;
}): string {
  const canonical = canonicalStringify({
    tenantId: params.tenantId,
    sequence: params.sequence,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    payload: params.payload,
    rationale: params.rationale,
    prevHash: params.prevHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Appends a record to the per-tenant, hash-chained evidence ledger. This is
 * intentionally simple (no row-level locking beyond a transaction + ordered
 * read of the latest row) which is sufficient for a single-process demo but
 * is not a hardened concurrency guarantee under heavy concurrent writers.
 */
export async function appendDecision(input: AppendDecisionInput) {
  return db.transaction(async (tx) => {
    const latestRows = await tx
      .select()
      .from(decisions)
      .where(eq(decisions.tenantId, input.tenantId));

    const sequence =
      latestRows.length > 0
        ? Math.max(...latestRows.map((r) => r.sequence)) + 1
        : 1;

    const prevHash =
      latestRows.length > 0
        ? latestRows.find((r) => r.sequence === sequence - 1)?.hash ?? GENESIS_HASH
        : GENESIS_HASH;

    const hash = computeHash({
      tenantId: input.tenantId,
      sequence,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      rationale: input.rationale,
      prevHash,
    });

    const [row] = await tx
      .insert(decisions)
      .values({
        tenantId: input.tenantId,
        sequence,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        payload: input.payload as object,
        rationale: input.rationale,
        prevHash,
        hash,
      })
      .returning();

    return row;
  });
}

export interface VerifyChainResult {
  ok: boolean;
  checked: number;
  brokenAtSequence: number | null;
  reason: string | null;
}

export async function verifyChain(tenantId: string): Promise<VerifyChainResult> {
  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenantId))
    .orderBy(asc(decisions.sequence));

  let expectedPrevHash = GENESIS_HASH;

  for (const row of rows) {
    if (row.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        checked: rows.length,
        brokenAtSequence: row.sequence,
        reason: `Expected prevHash ${expectedPrevHash} but row stores ${row.prevHash}.`,
      };
    }

    const recomputed = computeHash({
      tenantId: row.tenantId,
      sequence: row.sequence,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      payload: row.payload,
      rationale: row.rationale,
      prevHash: row.prevHash,
    });

    if (recomputed !== row.hash) {
      return {
        ok: false,
        checked: rows.length,
        brokenAtSequence: row.sequence,
        reason: `Recomputed hash ${recomputed} does not match stored hash ${row.hash}.`,
      };
    }

    expectedPrevHash = row.hash;
  }

  return { ok: true, checked: rows.length, brokenAtSequence: null, reason: null };
}

export async function listDecisions(tenantId: string) {
  return db
    .select()
    .from(decisions)
    .where(and(eq(decisions.tenantId, tenantId)))
    .orderBy(asc(decisions.sequence));
}
