import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { apply, type ProjectionState } from "../../projections/entityProjection";
import { rowToEnvelope } from "./eventStore";
import { getEntityDefinition } from "../../domain/registry";

type Db = NodePgDatabase<typeof schema>;

const SNAPSHOT_EVERY_N_EVENTS = 200;
const PROJECTOR_NAME = "entity_projection";
const PROCESS_BATCH_SIZE = 500; // bounded read of the outbox, not unbounded

/**
 * Consumes pending outbox rows for an org (or all orgs if omitted), in seq
 * order, folding each event into `entity_projections` and writing a
 * snapshot every SNAPSHOT_EVERY_N_EVENTS events for that entity. This is the
 * ONLY place projections are written — `scripts/rebuild.ts` calls this same
 * function after truncating projections + resetting the outbox, so "rebuild
 * from empty" and "normal incremental projection" are the same code path.
 */
export async function processPendingOutbox(db: Db, orgId?: string): Promise<{ processed: number }> {
  let processed = 0;
  // Loop in bounded batches until no pending rows remain (never one giant
  // unbounded scan).
  for (;;) {
    const pending = await db
      .select()
      .from(schema.outbox)
      .innerJoin(schema.events, eq(schema.outbox.eventId, schema.events.id))
      .where(
        orgId
          ? and(eq(schema.outbox.status, "pending"), eq(schema.outbox.orgId, orgId))
          : eq(schema.outbox.status, "pending"),
      )
      .orderBy(asc(schema.outbox.seq))
      .limit(PROCESS_BATCH_SIZE);

    if (pending.length === 0) break;

    for (const row of pending) {
      await applyOneOutboxRow(db, row.events, row.outbox.id);
      processed++;
    }

    if (pending.length < PROCESS_BATCH_SIZE) break;
  }
  return { processed };
}

async function applyOneOutboxRow(
  db: Db,
  eventRow: typeof schema.events.$inferSelect,
  outboxRowId: string,
): Promise<void> {
  const event = rowToEnvelope(eventRow);

  const existingRows = await db
    .select()
    .from(schema.entityProjections)
    .where(
      and(
        eq(schema.entityProjections.orgId, event.orgId),
        eq(schema.entityProjections.entityType, event.entityType),
        eq(schema.entityProjections.entityId, event.entityId),
      ),
    )
    .limit(1);

  const current: ProjectionState = existingRows.length
    ? {
        entityType: existingRows[0].entityType,
        entityId: existingRows[0].entityId,
        orgId: existingRows[0].orgId,
        version: existingRows[0].version,
        validFrom: new Date(existingRows[0].validFrom).toISOString(),
        validTo: existingRows[0].validTo ? new Date(existingRows[0].validTo).toISOString() : null,
        deletedAt: existingRows[0].deletedAt ? new Date(existingRows[0].deletedAt).toISOString() : null,
        data: existingRows[0].data as Record<string, unknown>,
      }
    : null;

  const next = apply(current, event);

  if (next) {
    const def = getEntityDefinition(event.entityType);
    const cols = def ? def.projectionColumns(next.data as never) : { ownerId: null, parentId: null, status: null };
    await db
      .insert(schema.entityProjections)
      .values({
        orgId: next.orgId,
        entityType: next.entityType,
        entityId: next.entityId,
        version: next.version,
        validFrom: new Date(next.validFrom),
        validTo: next.validTo ? new Date(next.validTo) : null,
        deletedAt: next.deletedAt ? new Date(next.deletedAt) : null,
        ownerId: cols.ownerId,
        parentId: cols.parentId,
        status: cols.status,
        data: next.data as object,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.entityProjections.orgId, schema.entityProjections.entityType, schema.entityProjections.entityId],
        set: {
          version: next.version,
          validFrom: new Date(next.validFrom),
          validTo: next.validTo ? new Date(next.validTo) : null,
          deletedAt: next.deletedAt ? new Date(next.deletedAt) : null,
          ownerId: cols.ownerId,
          parentId: cols.parentId,
          status: cols.status,
          data: next.data as object,
          updatedAt: new Date(),
        },
      });
  }

  await db.update(schema.outbox).set({ status: "processed", processedAt: new Date() }).where(eq(schema.outbox.id, outboxRowId));

  await db
    .insert(schema.projectionCheckpoints)
    .values({ projectionName: PROJECTOR_NAME, orgId: event.orgId, lastSeq: event.seq, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.projectionCheckpoints.projectionName, schema.projectionCheckpoints.orgId],
      set: { lastSeq: event.seq, updatedAt: new Date() },
    });

  await maybeSnapshot(db, event.orgId, event.entityType, event.entityId);
}

async function maybeSnapshot(db: Db, orgId: string, entityType: string, entityId: string): Promise<void> {
  const snapshotRows = await db
    .select()
    .from(schema.snapshots)
    .where(and(eq(schema.snapshots.orgId, orgId), eq(schema.snapshots.entityType, entityType), eq(schema.snapshots.entityId, entityId)))
    .limit(1);

  const lastSnapshotSeq = snapshotRows.length ? snapshotRows[0].lastSeq : 0;

  const countRows = await db
    .select({ count: sql<number>`count(*)::int`, maxSeq: sql<number>`max(${schema.events.seq})::int` })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.orgId, orgId),
        eq(schema.events.entityType, entityType),
        eq(schema.events.entityId, entityId),
        sql`${schema.events.seq} > ${lastSnapshotSeq}`,
      ),
    );

  const eventsSince = countRows[0]?.count ?? 0;
  if (eventsSince < SNAPSHOT_EVERY_N_EVENTS) return;

  const projectionRows = await db
    .select()
    .from(schema.entityProjections)
    .where(
      and(
        eq(schema.entityProjections.orgId, orgId),
        eq(schema.entityProjections.entityType, entityType),
        eq(schema.entityProjections.entityId, entityId),
      ),
    )
    .limit(1);
  if (projectionRows.length === 0) return;
  const row = projectionRows[0];
  const maxSeq = countRows[0]?.maxSeq ?? lastSnapshotSeq;

  await db
    .insert(schema.snapshots)
    .values({
      orgId,
      entityType,
      entityId,
      lastSeq: maxSeq,
      version: row.version,
      state: {
        entityType: row.entityType,
        entityId: row.entityId,
        orgId: row.orgId,
        version: row.version,
        validFrom: new Date(row.validFrom).toISOString(),
        validTo: row.validTo ? new Date(row.validTo).toISOString() : null,
        deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
        data: row.data,
      } satisfies object,
    })
    .onConflictDoUpdate({
      target: [schema.snapshots.orgId, schema.snapshots.entityType, schema.snapshots.entityId],
      set: { lastSeq: maxSeq, version: row.version, state: row.data as object, createdAt: new Date() },
    });
}

/** projectionLagMs = now - max(recordedAt) across events not yet projected. */
export async function getProjectionLagMs(db: Db, orgId?: string): Promise<number> {
  const rows = await db
    .select({ maxRecordedAt: sql<string | null>`max(${schema.events.recordedAt})` })
    .from(schema.outbox)
    .innerJoin(schema.events, eq(schema.outbox.eventId, schema.events.id))
    .where(orgId ? and(eq(schema.outbox.status, "pending"), eq(schema.outbox.orgId, orgId)) : eq(schema.outbox.status, "pending"));

  const maxRecordedAt = rows[0]?.maxRecordedAt;
  if (!maxRecordedAt) return 0;
  return Date.now() - new Date(maxRecordedAt).getTime();
}
