// =============================================================================
// LEADOS — Part 23 — Part 01 substrate STAND-IN: append-only event log
// =============================================================================
// Part 01's real event-log module was not present in this sandbox
// (`src/lib/decision*` and any ledger module did not exist). This file
// provides the minimal append-only semantics Part 23 depends on: every write
// is an INSERT, never an UPDATE/DELETE. When the real Part 01 substrate lands,
// swap the implementation body of `appendEvent`/`listEvents` to call into it —
// the call sites elsewhere in src/lib/decision/** should not need to change.
// =============================================================================

import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

export interface AppendEventInput {
  orgId: string;
  entityType: string;
  entityId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
}

export async function appendEvent(input: AppendEventInput) {
  const [row] = await db
    .insert(eventLog)
    .values({
      orgId: input.orgId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      type: input.type,
      payload: input.payload ?? {},
      actorId: input.actorId ?? null,
    })
    .returning();
  return row;
}

export async function listEventsForEntity(entityType: string, entityId: string) {
  return db
    .select()
    .from(eventLog)
    .where(and(eq(eventLog.entityType, entityType), eq(eventLog.entityId, entityId)))
    .orderBy(desc(eventLog.createdAt));
}
