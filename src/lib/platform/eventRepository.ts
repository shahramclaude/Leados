// LEADOS Part 01 — low-level event-log repository.
//
// STANDING RULE: this file (and the rest of src/lib/platform/**) is the ONLY
// place in the codebase allowed to run `db.select()` / `db.insert()` /
// `db.execute()` against the event-sourcing tables. API routes, scripts, and
// UI server components call into src/lib/eventStore.ts or
// src/lib/platform/*.ts — never into `@/db` directly for these tables.
//
// This module never UPDATEs or DELETEs a row in `events` (the DB trigger in
// scripts/sql/0001_events_append_only.sql would reject it anyway — this is
// the application-level half of that defense-in-depth pair).

import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, outbox } from "@/db/schema";
import { newUlid } from "@/lib/ulid";
import type { EventEnvelope, NewEventInput, StoredEventRow } from "@/lib/events/types";
import { rowToEnvelope } from "@/lib/events/types";
import {
  type EventTypeId,
  EVENT_CATALOG,
  isKnownEventType,
} from "@/lib/events/eventCatalog";
import {
  EVENT_SCHEMA_REGISTRY,
  getCurrentVersion,
  toCurrent,
  validateForWrite,
} from "@/lib/events/eventSchema";
import { decodeCursor, encodeCursor, type EventCursor } from "@/lib/events/eventUtils";

/** Any drizzle executor: the plain `db` client or a transaction handle. Both
 * expose the same query-builder surface, which is all this module uses. */
export type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | TxExecutor;

function mapRow(row: typeof events.$inferSelect): StoredEventRow {
  return {
    eventId: row.eventId,
    type: row.type,
    schemaVersion: row.schemaVersion,
    orgId: row.orgId,
    actorKind: row.actorKind as StoredEventRow["actorKind"],
    actorId: row.actorId,
    entityId: row.entityId,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    correlationId: row.correlationId,
    causationId: row.causationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    source: row.source as StoredEventRow["source"],
    confidence: row.confidence,
  };
}

/** Envelope with payload upcast to the CURRENT schema shape — this is what
 * every projector and API route should consume. */
export function toCurrentEnvelope(row: StoredEventRow): EventEnvelope {
  const envelope = rowToEnvelope(row);
  if (!isKnownEventType(envelope.type)) {
    // Defensive: should be impossible given validateForWrite() at append time,
    // but a foreign/garbage row must never crash a dashboard — surface it
    // as-is rather than upcasting.
    return envelope;
  }
  const { version, payload } = toCurrent(envelope.type, envelope.schemaVersion, envelope.payload);
  return { ...envelope, schemaVersion: version, payload };
}

// ---------------------------------------------------------------------------
// Writes (INSERT only)
// ---------------------------------------------------------------------------

export type AppendResult = {
  envelope: EventEnvelope;
  /** True if an existing row with the same idempotencyKey was returned
   * instead of inserting a new one. */
  deduped: boolean;
};

/**
 * Insert one event. Validates the payload against the CURRENT schema for the
 * type (callers must already have upcast/validated anything they got from
 * elsewhere — this is the write gate, not a general-purpose upcaster).
 * Honors idempotencyKey: a second append with a key already present returns
 * the original row instead of inserting a duplicate.
 */
export async function insertEvent(
  ex: Executor,
  input: NewEventInput & { type: EventTypeId },
): Promise<AppendResult> {
  if (!isKnownEventType(input.type)) {
    throw new Error(`Unknown event type "${input.type}" — add it to eventCatalog.ts first`);
  }

  if (input.idempotencyKey) {
    const existing = await ex
      .select()
      .from(events)
      .where(eq(events.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return { envelope: toCurrentEnvelope(mapRow(existing[0])), deduped: true };
    }
  }

  const validatedPayload = validateForWrite(input.type, input.payload);
  const schemaVersion = getCurrentVersion(input.type);
  const eventId = newUlid();
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const recordedAt = new Date();

  const [inserted] = await ex
    .insert(events)
    .values({
      eventId,
      type: input.type,
      schemaVersion,
      orgId: input.orgId,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      entityId: input.entityId,
      occurredAt,
      recordedAt,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: validatedPayload as object,
      source: input.source,
      confidence: input.confidence ?? null,
    })
    .returning();

  if (EVENT_CATALOG[input.type].notify) {
    await ex.insert(outbox).values({
      id: newUlid(),
      eventId,
      orgId: input.orgId,
      topic: input.type,
      payload: {
        eventId,
        type: input.type,
        orgId: input.orgId,
        entityId: input.entityId,
        occurredAt: occurredAt.toISOString(),
        payload: validatedPayload,
      },
      status: "pending",
    });
  }

  return { envelope: toCurrentEnvelope(mapRow(inserted)), deduped: false };
}

/**
 * Insert a RAW row exactly as given (preserving original eventId, occurredAt,
 * recordedAt, schemaVersion). Used only by restore/import, where we are
 * replaying a previously-valid envelope rather than minting a new fact. The
 * payload is still validated against the schema it claims to be (its
 * original schemaVersion), never silently trusted.
 */
export async function insertRawEvent(ex: Executor, envelope: EventEnvelope): Promise<"inserted" | "skipped_existing"> {
  if (!isKnownEventType(envelope.type)) {
    throw new Error(`Refusing to import unknown event type "${envelope.type}"`);
  }
  const existing = await ex
    .select({ eventId: events.eventId })
    .from(events)
    .where(eq(events.eventId, envelope.eventId))
    .limit(1);
  if (existing.length > 0) {
    return "skipped_existing";
  }

  const schema = EVENT_SCHEMA_REGISTRY[envelope.type].versions[envelope.schemaVersion];
  if (!schema) {
    throw new Error(
      `Cannot import "${envelope.type}" event ${envelope.eventId}: unknown schemaVersion ${envelope.schemaVersion}`,
    );
  }
  const validated = schema.parse(envelope.payload);

  await ex.insert(events).values({
    eventId: envelope.eventId,
    type: envelope.type,
    schemaVersion: envelope.schemaVersion,
    orgId: envelope.orgId,
    actorKind: envelope.actor.kind,
    actorId: envelope.actor.id,
    entityId: envelope.entityId,
    occurredAt: new Date(envelope.occurredAt),
    recordedAt: new Date(envelope.recordedAt),
    correlationId: envelope.correlationId,
    causationId: envelope.causationId ?? null,
    idempotencyKey: envelope.idempotencyKey ?? null,
    payload: validated as object,
    source: envelope.source,
    confidence: envelope.confidence ?? null,
  });
  return "inserted";
}

// ---------------------------------------------------------------------------
// Reads: cursor-paginated stream (current-shape payloads)
// ---------------------------------------------------------------------------

export type EventStreamParams = {
  orgId: string;
  type?: EventTypeId;
  entityId?: string;
  after?: string; // opaque cursor
  limit?: number;
};

export type EventStreamPage = {
  items: EventEnvelope[];
  nextCursor: string | null;
};

/**
 * Cursor pagination over the event log in valid-time order
 * (occurredAt ASC, eventId ASC). See eventUtils.ts for the cursor format and
 * the rationale for using valid time rather than transaction time here.
 */
export async function getEventStream(params: EventStreamParams): Promise<EventStreamPage> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const conditions = [eq(events.orgId, params.orgId)];
  if (params.type) conditions.push(eq(events.type, params.type));
  if (params.entityId) conditions.push(eq(events.entityId, params.entityId));

  let cursor: EventCursor | null = null;
  if (params.after) {
    cursor = decodeCursor(params.after);
    conditions.push(
      sql`(${events.occurredAt}, ${events.eventId}) > (${new Date(cursor.occurredAt)}, ${cursor.eventId})`,
    );
  }

  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.occurredAt), asc(events.eventId))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const items = page.map((r) => toCurrentEnvelope(mapRow(r)));
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ eventId: last.eventId, occurredAt: last.occurredAt.toISOString() }) : null;

  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// Bitemporal replay — the basis of asOf()
// ---------------------------------------------------------------------------

export type ReplayParams = {
  orgId: string;
  types?: EventTypeId[];
  entityId?: string;
  /** Valid-time cutoff: only events that happened at/before this instant, as
   * currently understood, are included. */
  validAt?: Date;
  /** Transaction-time cutoff: only events that had ALREADY been recorded in
   * the store at/before this instant are included. Combined with validAt this
   * answers "what did we believe about X, using only information we actually
   * had as of transaction time T". */
  transactionAt?: Date;
};

/** Full ascending replay (occurredAt, eventId) of events matching the given
 * bitemporal filter. No pagination — intended for projector replay and
 * asOf() queries over one entity or one projector's interest set, not for
 * paging an entire org's history (use getEventStream for that). */
export async function replayEvents(params: ReplayParams): Promise<EventEnvelope[]> {
  const conditions = [eq(events.orgId, params.orgId)];
  if (params.entityId) conditions.push(eq(events.entityId, params.entityId));
  if (params.types && params.types.length > 0) conditions.push(inArray(events.type, params.types));
  if (params.validAt) conditions.push(lte(events.occurredAt, params.validAt));
  if (params.transactionAt) conditions.push(lte(events.recordedAt, params.transactionAt));

  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.occurredAt), asc(events.eventId));

  return rows.map((r) => toCurrentEnvelope(mapRow(r)));
}

/** Full ascending replay of ALL events for an org, regardless of type —
 * used by rebuildProjections(). Raw rows are upcast to current shape because
 * projectors must only ever see current shapes (mandate B). */
export async function replayAllEvents(orgId?: string): Promise<EventEnvelope[]> {
  const rows = await db
    .select()
    .from(events)
    .where(orgId ? eq(events.orgId, orgId) : sql`true`)
    .orderBy(asc(events.occurredAt), asc(events.eventId));
  return rows.map((r) => toCurrentEnvelope(mapRow(r)));
}

/** Raw, non-upcast rows for export/full-fidelity backup. This is the ONLY
 * reader that is allowed to see the original on-disk schemaVersion/payload
 * pair, because export must be lossless and re-importable. */
export async function exportAllRawRows(orgId: string): Promise<EventEnvelope[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(asc(events.occurredAt), asc(events.eventId));
  return rows.map((r) => rowToEnvelope(mapRow(r)));
}

/** Lightweight existence check used by import dry-run diffing — avoids
 * fetching full rows (payload included) just to know which ids exist. */
export async function listEventIds(orgId: string): Promise<Set<string>> {
  const rows = await db.select({ eventId: events.eventId }).from(events).where(eq(events.orgId, orgId));
  return new Set(rows.map((r) => r.eventId));
}

export async function countEvents(orgId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.orgId, orgId));
  return count;
}

/** Hard-wipe helper for the restore drill / dev reset ONLY. This bypasses the
 * append-only trigger by using `TRUNCATE`, which is intentionally a
 * different, rarer operation than UPDATE/DELETE on rows — it is not exposed
 * through any API route, only through scripts/restore-drill.ts and the
 * seed/reset scripts, and it always wipes projections in the same breath so
 * the store is never left in a "events gone, projections stale" state. */
export async function dangerouslyTruncateEventStore(ex: Executor): Promise<void> {
  await ex.execute(sql`truncate table outbox, projection_state, projection_checkpoints, events restart identity cascade`);
}
