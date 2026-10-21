import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { computeEventHash, type EventEnvelope, type NewEventInput } from "./envelope";
import type { Result } from "../result";
import { err, ok } from "../result";

type Db = NodePgDatabase<typeof schema>;

export type AppendOutcome = { event: EventEnvelope; replayed: boolean };

/**
 * Appends one event to the per-org hash-chained log and writes its outbox
 * row in the SAME database transaction — this is what makes "commit" and
 * "outbox row exists" atomic (see AI-SESSION-LOG.md Phase 5, question 1 for
 * the failure modes this does and doesn't cover).
 *
 * Idempotency: a unique (orgId, idempotencyKey) index on `events` plus a
 * mirror row in `idempotency_keys` means a repeated call with the same key
 * never re-executes — it returns the ORIGINAL event, with `replayed: true`.
 */
export async function appendEvent(
  database: Db,
  input: NewEventInput,
): Promise<Result<AppendOutcome>> {
  try {
    return await database.transaction(async (tx) => {
      // 1. Idempotency fast-path: has this (orgId, idempotencyKey) been seen?
      const existing = await tx
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.orgId, input.orgId),
            eq(schema.idempotencyKeys.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const cached = existing[0].resultPayload as EventEnvelope;
        return ok({ event: cached, replayed: true });
      }

      // 2. Lock the org row to serialize the hash-chain write for this org.
      //    Different orgs do not contend with each other.
      const orgRows = await tx
        .select()
        .from(schema.orgs)
        .where(eq(schema.orgs.id, input.orgId))
        .for("update")
        .limit(1);

      if (orgRows.length === 0) {
        return err("not_found", `org ${input.orgId} does not exist`);
      }
      const org = orgRows[0];

      const eventId = input.eventId ?? randomUUID();
      const recordedAt = new Date().toISOString();

      // seq is assigned by the DB (bigserial); we need it before hashing, so
      // insert first with a placeholder hash, then update — OR compute hash
      // using org.lastEventSeq + 1 as the predicted seq and enforce it via
      // the unique sequence column (if another writer raced us for this org,
      // the row lock above already prevents that). We take the simpler path:
      // predicted seq = org.lastEventSeq + 1, enforced by the row lock.
      const seq = org.lastEventSeq + 1;
      const prevHash = org.lastEventHash;
      const hash = computeEventHash(prevHash, {
        eventId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion,
        orgId: input.orgId,
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: input.occurredAt,
        recordedAt,
        correlationId: input.correlationId,
        causationId: input.causationId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        seq,
      });

      await tx.insert(schema.events).values({
        id: eventId,
        seq,
        orgId: input.orgId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion,
        entityType: input.entityType,
        entityId: input.entityId,
        actorKind: input.actor.kind,
        actorId: input.actor.id,
        actorDisplayName: input.actor.displayName,
        occurredAt: new Date(input.occurredAt),
        recordedAt: new Date(recordedAt),
        correlationId: input.correlationId,
        causationId: input.causationId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as object,
        prevHash,
        hash,
      });

      const outboxId = randomUUID();
      await tx.insert(schema.outbox).values({
        id: outboxId,
        eventId,
        orgId: input.orgId,
        seq,
        status: "pending",
      });

      await tx
        .update(schema.orgs)
        .set({ lastEventHash: hash, lastEventSeq: seq })
        .where(eq(schema.orgs.id, input.orgId));

      const envelope: EventEnvelope = {
        ...input,
        eventId,
        recordedAt,
        prevHash,
        hash,
        seq,
      };

      await tx.insert(schema.idempotencyKeys).values({
        orgId: input.orgId,
        idempotencyKey: input.idempotencyKey,
        eventId,
        entityType: input.entityType,
        entityId: input.entityId,
        resultPayload: envelope as object,
      });

      return ok({ event: envelope, replayed: false });
    });
  } catch (e) {
    // Unique violation race (two concurrent requests with the same
    // idempotency key both missed the fast-path check): Postgres code 23505.
    const pgError = e as { code?: string; constraint?: string };
    if (pgError?.code === "23505") {
      const replayDb = database ?? defaultDb;
      const existing = await replayDb
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.orgId, input.orgId),
            eq(schema.idempotencyKeys.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return ok({ event: existing[0].resultPayload as EventEnvelope, replayed: true });
      }
    }
    throw e;
  }
}

/** Peeks the idempotency ledger without writing anything — lets callers distinguish "this is a replay" from "this is a genuinely new write" before running conflict checks. */
export async function peekIdempotencyKey(
  database: Db,
  orgId: string,
  idempotencyKey: string,
): Promise<EventEnvelope | null> {
  const rows = await database
    .select()
    .from(schema.idempotencyKeys)
    .where(and(eq(schema.idempotencyKeys.orgId, orgId), eq(schema.idempotencyKeys.idempotencyKey, idempotencyKey)))
    .limit(1);
  return rows.length > 0 ? (rows[0].resultPayload as EventEnvelope) : null;
}

/** Loads the full, ordered event stream for one entity (bounded by design: one entity's history). */
export async function loadEntityEvents(
  database: Db,
  orgId: string,
  entityType: string,
  entityId: string,
  sinceSeq = 0,
): Promise<EventEnvelope[]> {
  const rows = await database
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.orgId, orgId),
        eq(schema.events.entityType, entityType),
        eq(schema.events.entityId, entityId),
        sql`${schema.events.seq} > ${sinceSeq}`,
      ),
    )
    .orderBy(schema.events.seq)
    .limit(100000); // bounded: one entity's lifetime event count, not a table scan

  return rows.map(rowToEnvelope);
}

export function rowToEnvelope(row: typeof schema.events.$inferSelect): EventEnvelope {
  return {
    eventId: row.id,
    eventType: row.eventType,
    schemaVersion: row.schemaVersion,
    orgId: row.orgId,
    entityType: row.entityType,
    entityId: row.entityId,
    actor: { kind: row.actorKind as EventEnvelope["actor"]["kind"], id: row.actorId, displayName: row.actorDisplayName },
    occurredAt: new Date(row.occurredAt).toISOString(),
    recordedAt: new Date(row.recordedAt).toISOString(),
    correlationId: row.correlationId,
    causationId: row.causationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    prevHash: row.prevHash,
    hash: row.hash,
    seq: row.seq,
  };
}
