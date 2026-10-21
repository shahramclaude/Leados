// Tamper-evident, hash-chained audit log (Part 17-E).
//
// Every sensitive read of people data, every write, every export, every
// agent action, and every permission change calls `recordAuditEvent()`.
// Each row stores `prevHash` (the hash of the previous row in `seq` order)
// and `hash` (sha256 over the row's own canonical content + `prevHash`), so
// altering or deleting a historical row breaks the chain from that point
// forward. `verifyAuditChain()` recomputes the whole chain and reports the
// first broken link; `npm run audit:verify` wraps it as a CLI/CI check.
//
// Concurrency: all chain mutations take a single Postgres advisory lock
// (`pg_advisory_xact_lock`) for the duration of the transaction so two
// concurrent writers cannot both read the same "last hash" and fork the
// chain.
//
// NOTE: this module intentionally does NOT import "server-only" (unlike
// most of src/lib/*) because it must be importable from plain Node scripts
// (scripts/audit-verify.mjs) and the Vitest test suite, neither of which go
// through Next's client/server bundle split. `src/lib/audit.ts` re-exports
// everything from here behind a "server-only" guard for use inside the
// Next.js app itself — always import from `@/lib/audit` in app code, and
// from `@/lib/auditCore` only in standalone scripts/tests.
import { createHash, randomUUID } from "node:crypto";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export const AUDIT_CHAIN_LOCK_KEY = 727_501_001;
export const GENESIS_HASH = createHash("sha256").update("LEADOS-AUDIT-GENESIS-V1").digest("hex");

export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.lockout"
  | "people.read"
  | "people.list"
  | "people.create"
  | "people.update"
  | "people.delete"
  | "people.export"
  | "people.import"
  | "users.invite"
  | "users.role_change"
  | "webhooks.create"
  | "webhooks.list"
  | "agent.run"
  | "audit.read"
  | "audit.export";

export type AuditEventInput = {
  orgId: string | null;
  actorUserId: string | null;
  actorRole?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  correlationId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

function computeHash(row: {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  correlationId: string;
  metadata: unknown;
  createdAt: string;
  prevHash: string;
}): string {
  return createHash("sha256").update(canonicalize(row)).digest("hex");
}

export async function recordAuditEvent(input: AuditEventInput): Promise<{ id: string; seq: number; hash: string }> {
  const correlationId = input.correlationId ?? randomUUID();
  const createdAt = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);

    const [last] = await tx
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .orderBy(sql`${auditLog.seq} desc`)
      .limit(1);
    const prevHash = last?.hash ?? GENESIS_HASH;

    const id = randomUUID();
    const metadata = input.metadata ?? {};
    const hash = computeHash({
      id,
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      reason: input.reason ?? null,
      correlationId,
      metadata,
      createdAt: createdAt.toISOString(),
      prevHash,
    });

    const [row] = await tx
      .insert(auditLog)
      .values({
        id,
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        reason: input.reason ?? null,
        correlationId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata,
        prevHash,
        hash,
        createdAt,
      })
      .returning({ id: auditLog.id, seq: auditLog.seq });

    return { id: row.id, seq: row.seq, hash };
  });
}

export type ChainVerificationResult =
  | { ok: true; recordsChecked: number }
  | { ok: false; recordsChecked: number; brokenAtSeq: number; reason: string };

/** Recomputes the entire hash chain from scratch. Used by `npm run audit:verify`. */
export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.seq));

  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    checked++;
    if (row.prevHash !== expectedPrev) {
      return {
        ok: false,
        recordsChecked: checked,
        brokenAtSeq: row.seq,
        reason: `prevHash mismatch: expected ${expectedPrev}, found ${row.prevHash}`,
      };
    }
    const recomputed = computeHash({
      id: row.id,
      orgId: row.orgId,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      reason: row.reason,
      correlationId: row.correlationId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      prevHash: row.prevHash,
    });
    if (recomputed !== row.hash) {
      return {
        ok: false,
        recordsChecked: checked,
        brokenAtSeq: row.seq,
        reason: `hash mismatch: row content does not match its stored hash (tampered)`,
      };
    }
    expectedPrev = row.hash;
  }

  return { ok: true, recordsChecked: checked };
}
