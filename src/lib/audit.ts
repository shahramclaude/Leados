import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Immutable, hash-chained audit trail.
 *
 * Every event's `hash` = sha256(prevHash + canonicalJson(event)), where
 * `prevHash` is the hash of the previous event *in the same org's chain*
 * (or the previous system event when `orgId` is null). This gives tamper
 * evidence: altering or deleting a historical row breaks the chain from
 * that point forward, which `verifyAuditChain` detects deterministically.
 *
 * This does not replace database-level protections (least-privilege DB
 * roles that deny UPDATE/DELETE on this table in production — see
 * docs/SECURITY.md) but it means tampering is *provable* even if row-level
 * protection is ever misconfigured.
 */
export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.lockout"
  | "auth.register"
  | "auth.session.revoke"
  | "people.read"
  | "people.list"
  | "people.create"
  | "people.update"
  | "people.delete"
  | "people.export"
  | "audit.read"
  | "audit.export"
  | "security.rate_limited"
  | "security.csrf_rejected"
  | "security.authz_denied";

export interface AuditEventInput {
  correlationId: string;
  orgId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

function canonicalPayload(event: {
  id: string;
  correlationId: string;
  orgId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  prevHash: string | null;
}): string {
  // Stable key order so the hash is deterministic regardless of object
  // construction order.
  return JSON.stringify(event, Object.keys(event).sort());
}

const chainScope = (orgId: string | null) => orgId ?? "__system__";

export async function recordAuditEvent(input: AuditEventInput) {
  return db.transaction(async (tx) => {
    const scope = chainScope(input.orgId);
    const [last] = await tx
      .select({ hash: auditLog.hash, orgId: auditLog.orgId })
      .from(auditLog)
      .where(
        input.orgId
          ? eq(auditLog.orgId, input.orgId)
          : sql`${auditLog.orgId} is null`,
      )
      .orderBy(desc(auditLog.seq))
      .limit(1);

    const prevHash = last?.hash ?? null;
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const payload = canonicalPayload({
      id,
      correlationId: input.correlationId,
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt,
      prevHash,
    });
    const hash = createHash("sha256").update(`${scope}:${payload}`).digest("hex");

    const [row] = await tx
      .insert(auditLog)
      .values({
        id,
        correlationId: input.correlationId,
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        prevHash,
        hash,
        createdAt: new Date(createdAt),
      })
      .returning();

    return row;
  });
}

export interface AuditQueryFilters {
  orgId?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function queryAuditLog(filters: AuditQueryFilters) {
  const conditions = [];
  if (filters.orgId) conditions.push(eq(auditLog.orgId, filters.orgId));
  if (filters.actorUserId) conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
  if (filters.action) conditions.push(eq(auditLog.action, filters.action));
  if (filters.resourceType) conditions.push(eq(auditLog.resourceType, filters.resourceType));
  if (filters.from) conditions.push(gte(auditLog.createdAt, filters.from));
  if (filters.to) conditions.push(lte(auditLog.createdAt, filters.to));

  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = filters.offset ?? 0;

  const query = db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.seq))
    .limit(limit)
    .offset(offset);

  return query;
}

/** Recomputes the hash chain for a scope and reports the first break, if any. */
export async function verifyAuditChain(orgId: string | null): Promise<
  | { valid: true; checked: number }
  | { valid: false; checked: number; brokenAtSeq: number }
> {
  const scope = chainScope(orgId);
  const rows = await db
    .select()
    .from(auditLog)
    .where(orgId ? eq(auditLog.orgId, orgId) : sql`${auditLog.orgId} is null`)
    .orderBy(asc(auditLog.seq));

  let prevHash: string | null = null;
  let checked = 0;
  for (const row of rows) {
    const payload = canonicalPayload({
      id: row.id,
      correlationId: row.correlationId,
      orgId: row.orgId,
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      reason: row.reason,
      metadata: row.metadata ?? null,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      prevHash,
    });
    const expectedHash = createHash("sha256").update(`${scope}:${payload}`).digest("hex");
    checked += 1;
    if (expectedHash !== row.hash || row.prevHash !== prevHash) {
      return { valid: false, checked, brokenAtSeq: row.seq };
    }
    prevHash = row.hash;
  }
  return { valid: true, checked };
}

// Cells beginning with one of these characters can be interpreted as a
// formula by Excel/Sheets when a CSV export is opened ("CSV injection" /
// "formula injection", CWE-1236). Export is a documented sensitive action
// (every call is audited); this is defense-in-depth so exported data can't
// be weaponized against whoever opens the file.
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER_CHARS.has(value[0] ?? "") ? `'${value}` : value;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? "" : String(value);
    return `"${neutralizeFormula(str).replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
