import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { engineRecords, type DomainScope, type EngineRecordType } from "@/db/schema";

// ---------------------------------------------------------------------------
// Repository layer: every function below takes `orgId` as its first
// argument and bakes it into the WHERE clause. No function in this module
// (or any other file in src/lib/repo) ever issues a query against a
// tenant-owned table without an org filter. Route handlers MUST call through
// here instead of touching `db` directly for tenant data — this is what
// "tenancy enforcement at the repository layer, not per-route ad hoc" means.
// ---------------------------------------------------------------------------

export type EngineRecordRow = typeof engineRecords.$inferSelect;

export async function listRecords(
  orgId: string,
  opts: { domain?: DomainScope; type?: EngineRecordType } = {},
): Promise<EngineRecordRow[]> {
  const conditions = [eq(engineRecords.orgId, orgId)];
  if (opts.domain) conditions.push(eq(engineRecords.domain, opts.domain));
  if (opts.type) conditions.push(eq(engineRecords.type, opts.type));

  return db
    .select()
    .from(engineRecords)
    .where(and(...conditions))
    .orderBy(desc(engineRecords.createdAt));
}

export async function getRecord(orgId: string, id: string): Promise<EngineRecordRow | undefined> {
  const [row] = await db
    .select()
    .from(engineRecords)
    .where(and(eq(engineRecords.orgId, orgId), eq(engineRecords.id, id)))
    .limit(1);
  return row;
}

export async function createRecord(
  orgId: string,
  input: {
    type: EngineRecordType;
    domain: DomainScope;
    templateKey: string;
    params: Record<string, string | number>;
    createdBy: string;
    seeded?: boolean;
  },
): Promise<EngineRecordRow> {
  const [row] = await db
    .insert(engineRecords)
    .values({
      orgId,
      type: input.type,
      domain: input.domain,
      templateKey: input.templateKey,
      params: input.params,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      seeded: input.seeded ?? false,
    })
    .returning();
  return row;
}

export type UpdateResult =
  | { status: "ok"; row: EngineRecordRow }
  | { status: "not-found" }
  | { status: "conflict"; serverRow: EngineRecordRow };

/**
 * Optimistic-concurrency update. The caller must supply the version they
 * last saw (`expectedVersion`). If the stored version has moved on, we
 * return the current server row as a 409-shaped conflict instead of
 * silently overwriting it (no last-writer-wins on people/finance data).
 */
export async function updateRecordWithVersion(
  orgId: string,
  id: string,
  expectedVersion: number,
  patch: { params?: Record<string, string | number>; updatedBy: string },
): Promise<UpdateResult> {
  const current = await getRecord(orgId, id);
  if (!current) return { status: "not-found" };

  if (current.version !== expectedVersion) {
    return { status: "conflict", serverRow: current };
  }

  const [row] = await db
    .update(engineRecords)
    .set({
      params: patch.params ?? current.params,
      updatedBy: patch.updatedBy,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(engineRecords.orgId, orgId), eq(engineRecords.id, id)))
    .returning();

  return { status: "ok", row };
}

export async function deleteRecord(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(engineRecords)
    .where(and(eq(engineRecords.orgId, orgId), eq(engineRecords.id, id)))
    .returning({ id: engineRecords.id });
  return deleted.length > 0;
}

export async function deleteSeededRecords(orgId: string): Promise<number> {
  const deleted = await db
    .delete(engineRecords)
    .where(and(eq(engineRecords.orgId, orgId), eq(engineRecords.seeded, true)))
    .returning({ id: engineRecords.id });
  return deleted.length;
}

export type DomainAggregate = { domain: DomainScope; total: number; seeded: number };

/**
 * Aggregate counts per domain. Aggregates are exactly where tenancy bugs
 * like to hide (a missing WHERE in a GROUP BY still "runs" and returns a
 * plausible-looking number) so this is covered explicitly by
 * scripts/tenancy-isolation-test.ts, not just the row-level reads/writes.
 */
export async function aggregateByDomain(orgId: string): Promise<DomainAggregate[]> {
  const rows = await db
    .select({
      domain: engineRecords.domain,
      total: count(),
      seeded: sql<number>`count(*) filter (where ${engineRecords.seeded} = true)`,
    })
    .from(engineRecords)
    .where(eq(engineRecords.orgId, orgId))
    .groupBy(engineRecords.domain);

  return rows.map((r) => ({ domain: r.domain as DomainScope, total: Number(r.total), seeded: Number(r.seeded) }));
}
