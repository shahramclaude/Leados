// Tamper-evident, hash-chained audit log.
//
// Every sensitive read, write, export, agent/automation action, and
// permission change calls `recordAuditEvent()`. Each row stores `prevHash`
// (the previous row's hash, scoped per-organization so tenants cannot
// observe or corrupt one another's chain) and `hash` (sha256 over the row's
// canonical content + prevHash). Altering or deleting a historical row
// breaks the chain from that point forward; `verifyAuditChain()` recomputes
// it and reports the first broken link. `npm run audit:verify` wraps this as
// a CLI check (scripts/audit-verify.ts); `tests/security/audit-chain.test.ts`
// proves deliberate tamper is detected.
//
// Concurrency: all chain mutations take a single Postgres advisory lock
// (`pg_advisory_xact_lock`, keyed per org) for the duration of the
// transaction so two concurrent writers for the same org cannot both read
// the same "last hash" and fork the chain. Different orgs use different lock
// keys and can write concurrently.
import "server-only";
import { createHash } from "node:crypto";
import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export const GENESIS_HASH = createHash("sha256").update("LEADOS-AUDIT-GENESIS-V1").digest("hex");

// Known action vocabulary for documentation/autocomplete, but the column is
// `text` and the type below intentionally also accepts any string — a
// closed union would force every new sensitive action through a one-line
// code review of this file, which is good, but must never become a reason a
// *new* sensitive action silently skips auditing because the union didn't
// include it yet. New actions should still be added below.
export type KnownAuditAction =
  | "auth.register"
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.login.locked"
  | "auth.logout"
  | "session.revoke"
  | "people.read"
  | "people.list"
  | "people.create"
  | "people.update"
  | "people.delete"
  | "people.export"
  | "people.search"
  | "people.import.submit"
  | "people.import.approve"
  | "people.import.reject"
  | "users.role_change"
  | "settings.incident_banner_change"
  | "audit.read"
  | "audit.verify"
  | "privacy.self_read"
  | "security.ssrf_blocked"
  | "security.rate_limited"
  | "security.forbidden";

export type AuditAction = KnownAuditAction | (string & { __brand?: never });

export interface AuditEventInput {
  orgId: string | null;
  actorUserId: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  correlationId: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

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

interface HashableRow {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  correlationId: string;
  metadata: unknown;
  createdAt: string;
  prevHash: string;
}

function computeHash(row: HashableRow): string {
  return createHash("sha256").update(canonicalize(row)).digest("hex");
}

/** Stable 32-bit-ish lock key derived from the org id (or a fixed key for the
 * system/null-org chain) so concurrent writers for different orgs don't
 * serialize behind one global lock. */
function lockKeyFor(orgId: string | null): number {
  if (!orgId) return 727_501_000;
  const hash = createHash("sha256").update(orgId).digest();
  return hash.readInt32BE(0);
}

export async function recordAuditEvent(input: AuditEventInput): Promise<{ id: string; seq: number; hash: string }> {
  const createdAt = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKeyFor(input.orgId)})`);

    const orgFilter = input.orgId ? eq(auditLog.orgId, input.orgId) : isNull(auditLog.orgId);
    const [last] = await tx
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .where(orgFilter)
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const prevHash = last?.hash ?? GENESIS_HASH;

    const metadata = input.metadata ?? {};
    const [inserted] = await tx
      .insert(auditLog)
      .values({
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        reason: input.reason ?? null,
        correlationId: input.correlationId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata,
        prevHash,
        hash: "", // filled in below once we know the row's own id/createdAt
        createdAt,
      })
      .returning({ id: auditLog.id, seq: auditLog.seq, createdAt: auditLog.createdAt });

    const hash = computeHash({
      id: inserted.id,
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      reason: input.reason ?? null,
      correlationId: input.correlationId,
      metadata,
      createdAt: inserted.createdAt.toISOString(),
      prevHash,
    });

    await tx.update(auditLog).set({ hash }).where(eq(auditLog.id, inserted.id));

    return { id: inserted.id, seq: inserted.seq, hash };
  });
}

export type ChainVerificationResult =
  | { valid: true; checked: number }
  | { valid: false; checked: number; brokenAtSeq: number; reason: string };

/** Recomputes the hash chain for one organization (or the system chain when
 * `orgId` is null) from scratch. Used by `/api/audit/verify` and
 * `npm run audit:verify`. */
export async function verifyAuditChain(orgId: string | null): Promise<ChainVerificationResult> {
  const orgFilter = orgId ? eq(auditLog.orgId, orgId) : isNull(auditLog.orgId);
  const rows = await db.select().from(auditLog).where(orgFilter).orderBy(asc(auditLog.seq));

  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    checked++;
    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        checked,
        brokenAtSeq: row.seq,
        reason: `prevHash mismatch at seq ${row.seq}: expected ${expectedPrev}, found ${row.prevHash} (a row was likely deleted or reordered)`,
      };
    }
    const recomputed = computeHash({
      id: row.id,
      orgId: row.orgId,
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
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
        valid: false,
        checked,
        brokenAtSeq: row.seq,
        reason: `hash mismatch at seq ${row.seq}: stored content does not match its stored hash (tampered)`,
      };
    }
    expectedPrev = row.hash;
  }

  return { valid: true, checked };
}

/** CSV export with CWE-1236 (formula injection) mitigation: any field
 * starting with =, +, -, @, tab, or CR is prefixed with a single quote so
 * spreadsheet software never treats exported data as a formula, and all
 * fields are quoted/escaped per RFC 4180. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: unknown): string => {
    let str = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}
