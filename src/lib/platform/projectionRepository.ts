// LEADOS Part 01 — projection_state / projection_checkpoints repository.
// Only src/lib/projections/engine.ts and src/lib/platform/hotQueries.ts
// should import this module.

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectionCheckpoints, projectionState } from "@/db/schema";
import type { Executor } from "./eventRepository";

export type ProjectionStateRow = {
  projectorName: string;
  entityId: string;
  orgId: string;
  state: unknown;
  updatedAt: Date;
};

export async function getProjectionRow(
  ex: Executor,
  projectorName: string,
  entityId: string,
): Promise<ProjectionStateRow | null> {
  const rows = await ex
    .select()
    .from(projectionState)
    .where(and(eq(projectionState.projectorName, projectorName), eq(projectionState.entityId, entityId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjectionRows(
  projectorName: string,
  orgId: string,
): Promise<ProjectionStateRow[]> {
  return db
    .select()
    .from(projectionState)
    .where(and(eq(projectionState.projectorName, projectorName), eq(projectionState.orgId, orgId)))
    .orderBy(asc(projectionState.entityId));
}

export async function listAllProjectionRows(): Promise<ProjectionStateRow[]> {
  return db.select().from(projectionState).orderBy(asc(projectionState.projectorName), asc(projectionState.entityId));
}

export async function upsertProjectionRow(
  ex: Executor,
  row: { projectorName: string; entityId: string; orgId: string; state: unknown },
): Promise<void> {
  await ex
    .insert(projectionState)
    .values({
      projectorName: row.projectorName,
      entityId: row.entityId,
      orgId: row.orgId,
      state: row.state as object,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [projectionState.projectorName, projectionState.entityId],
      set: { state: row.state as object, orgId: row.orgId, updatedAt: new Date() },
    });
}

export async function getCheckpoint(projectorName: string) {
  const rows = await db
    .select()
    .from(projectionCheckpoints)
    .where(eq(projectionCheckpoints.projectorName, projectorName))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCheckpoints() {
  return db.select().from(projectionCheckpoints).orderBy(asc(projectionCheckpoints.projectorName));
}

export async function advanceCheckpoint(
  ex: Executor,
  projectorName: string,
  lastEventId: string,
  incrementBy = 1,
): Promise<void> {
  await ex
    .insert(projectionCheckpoints)
    .values({ projectorName, lastEventId, eventCount: incrementBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: projectionCheckpoints.projectorName,
      set: {
        lastEventId,
        eventCount: sql`${projectionCheckpoints.eventCount} + ${incrementBy}`,
        updatedAt: new Date(),
      },
    });
}

export async function resetCheckpoint(ex: Executor, projectorName: string): Promise<void> {
  await ex
    .insert(projectionCheckpoints)
    .values({ projectorName, lastEventId: null, eventCount: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: projectionCheckpoints.projectorName,
      set: { lastEventId: null, eventCount: 0, updatedAt: new Date() },
    });
}

export async function clearAllProjectionState(ex: Executor): Promise<void> {
  await ex.execute(sql`truncate table projection_state`);
}
