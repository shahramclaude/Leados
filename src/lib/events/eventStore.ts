// src/lib/events/eventStore.ts
//
// The ONLY module in the codebase allowed to INSERT into `events`. Every
// write to LEADOS — whether from an API route, the seed script, an
// autonomous agent action, or an import job — goes through `appendEvent` /
// `appendEvents`. Reads for pagination/listing live in
// src/lib/repositories/eventsRepository.ts; this module owns the write
// path plus the one documented redaction exception used by retention/GDPR.
//
// Guarantees provided here on top of the DB-level trigger guard
// (drizzle/0001_events_append_only_guard.sql):
//   - payload validation against the versioned schema registry
//     (eventCatalog.ts) before a single byte is written
//   - a deterministic, time-sortable id (ULID) instead of relying on
//     insertion order for causality
//   - idempotency: supplying the same `idempotencyKey` twice returns the
//     original event instead of writing a duplicate
//   - correlationId/causationId so an autonomous action can always be
//     traced back to the observation(s) that caused it
//   - synchronous projection updates in the SAME transaction as the
//     append, so a reader can never observe an event without its
//     projections (or vice versa)

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { events, idempotencyReceipts } from "@/db/schema";
import { newEventId } from "./id";
import { getCatalogEntry, validateEventPayload, type Domain } from "./eventCatalog";
import { applyEventToProjections } from "./projections";

export interface LeadosEvent {
  id: string;
  seq: string;
  type: string;
  domain: Domain;
  entityId: string | null;
  ts: string;
  recordedAt: string;
  data: Record<string, unknown>;
  source: string;
  schemaVersion: number;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string | null;
  redacted: boolean;
}

export interface AppendEventInput {
  type: string;
  entityId?: string | null;
  ts?: string | Date;
  data: Record<string, unknown>;
  source?: string;
  /** Groups this event with the chain of events/actions it is logically part of. Defaults to this event's own id when it is the root of a new chain. */
  correlationId?: string;
  /** The id of the event that directly caused this one (e.g. the observation an autonomous agent acted on). */
  causationId?: string | null;
  /** Supplying the same key twice is a no-op that returns the original event — makes ingestion safe to retry. */
  idempotencyKey?: string | null;
}

function rowToEvent(row: typeof events.$inferSelect): LeadosEvent {
  return {
    id: row.id,
    seq: row.seq.toString(),
    type: row.type,
    domain: row.domain as Domain,
    entityId: row.entityId,
    ts: new Date(row.ts).toISOString(),
    recordedAt: new Date(row.recordedAt).toISOString(),
    data: row.data,
    source: row.source,
    schemaVersion: row.schemaVersion,
    correlationId: row.correlationId,
    causationId: row.causationId,
    idempotencyKey: row.idempotencyKey,
    redacted: row.redacted,
  };
}

async function findByIdempotencyKey(tx: DbOrTx, key: string): Promise<LeadosEvent | null> {
  const [receipt] = await tx
    .select()
    .from(idempotencyReceipts)
    .where(eq(idempotencyReceipts.idempotencyKey, key))
    .limit(1);
  if (!receipt) return null;
  const [row] = await tx.select().from(events).where(eq(events.id, receipt.eventId)).limit(1);
  return row ? rowToEvent(row) : null;
}

/**
 * Append a single event. Validates the payload against the catalog,
 * assigns a ULID + schemaVersion, resolves idempotency, and synchronously
 * folds the event into every projection that cares about it, all inside
 * one transaction.
 */
export async function appendEvent(input: AppendEventInput): Promise<LeadosEvent> {
  const catalogEntry = getCatalogEntry(input.type);
  const data = validateEventPayload(input.type, input.data);

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await findByIdempotencyKey(tx, input.idempotencyKey);
      if (existing) return existing;
    }

    const id = newEventId();
    const ts = input.ts ? new Date(input.ts) : new Date();

    const [row] = await tx
      .insert(events)
      .values({
        id,
        type: input.type,
        domain: catalogEntry.domain,
        entityId: input.entityId ?? null,
        ts,
        data,
        source: input.source ?? "system",
        schemaVersion: catalogEntry.schemaVersion,
        correlationId: input.correlationId ?? id,
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    if (input.idempotencyKey) {
      await tx.insert(idempotencyReceipts).values({ idempotencyKey: input.idempotencyKey, eventId: id });
    }

    const event = rowToEvent(row);
    await applyEventToProjections(tx, event);
    return event;
  });
}

export async function appendEvents(inputs: AppendEventInput[]): Promise<LeadosEvent[]> {
  const out: LeadosEvent[] = [];
  for (const input of inputs) {
    out.push(await appendEvent(input));
  }
  return out;
}

/**
 * Start a new causal chain: returns a correlationId to pass to subsequent
 * `appendEvent` calls so every downstream effect of one root observation
 * (e.g. an autonomous agent cycle) can be traced back together.
 */
export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * The ONLY permitted mutation of an existing event row (enforced again,
 * independently, by the `events_guard_update_trigger` DB trigger). Used
 * exclusively by src/lib/retention.ts and src/lib/people/erasure.ts to
 * strip PII/payload fields from an event after its retention window
 * expires or on a lawful erasure request. `redacted` can only ever
 * transition false -> true.
 */
export async function redactEventPayload(
  eventId: string,
  redactor: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<LeadosEvent | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!row || row.redacted) return row ? rowToEvent(row) : null;

    const redactedData = redactor(row.data);
    const [updated] = await tx
      .update(events)
      .set({ data: redactedData, redacted: true })
      .where(and(eq(events.id, eventId), eq(events.redacted, false)))
      .returning();
    return updated ? rowToEvent(updated) : null;
  });
}

export { rowToEvent };
