// LEADOS Part 01 — the event envelope. This is the ONE shape every fact in
// the system is wrapped in before it is written anywhere. Nothing in this
// codebase should insert into the `events` table without going through
// src/lib/eventStore.ts, which builds/validates this envelope.

export type ActorKind = "user" | "agent" | "system" | "import";

export type EventSource = "ui" | "api" | "automation" | "import" | "migration";

export type Actor = {
  kind: ActorKind;
  id: string;
};

/**
 * The canonical event envelope. `TType` narrows `type` to one literal event
 * type string; `TPayload` is the *current* (post-upcast) payload shape for
 * that type, as defined in eventSchema.ts.
 */
export type EventEnvelope<
  TType extends string = string,
  TPayload = unknown,
> = {
  eventId: string; // ULID — monotonic, sortable, collision-safe. NOT serial.
  type: TType;
  schemaVersion: number; // the version the payload was WRITTEN as (pre-upcast)
  orgId: string; // tenancy scope
  actor: Actor;
  entityId: string; // aggregate this event belongs to
  occurredAt: string; // ISO-8601 UTC — valid time: when it happened in the world
  recordedAt: string; // ISO-8601 UTC — transaction time: when it entered the store
  correlationId: string; // one per business flow / agent run
  causationId?: string; // eventId of the event that caused this one
  idempotencyKey?: string; // dedupe key for imports / webhook replays
  payload: TPayload;
  source: EventSource;
  confidence?: number; // 0..1, for observed/inferred facts
};

/**
 * What a caller provides when appending a new event. `eventId`, `recordedAt`
 * and `schemaVersion` are filled in by the event store (schemaVersion is
 * always written as the CURRENT version for that type — see eventSchema.ts).
 * `occurredAt` defaults to "now" if omitted (most UI-originated events),
 * but importers/automations may backdate it, which is exactly why occurredAt
 * and recordedAt are two different columns — see docs/DATA.md.
 */
export type NewEventInput<TType extends string = string, TPayload = unknown> = {
  type: TType;
  orgId: string;
  actor: Actor;
  entityId: string;
  occurredAt?: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey?: string;
  payload: TPayload;
  source: EventSource;
  confidence?: number;
};

/** Row shape as physically stored (snake_case columns, flattened actor). */
export type StoredEventRow = {
  eventId: string;
  type: string;
  schemaVersion: number;
  orgId: string;
  actorKind: ActorKind;
  actorId: string;
  entityId: string;
  occurredAt: Date;
  recordedAt: Date;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string | null;
  payload: unknown;
  source: EventSource;
  confidence: number | null;
};

export function rowToEnvelope(row: StoredEventRow): EventEnvelope {
  return {
    eventId: row.eventId,
    type: row.type,
    schemaVersion: row.schemaVersion,
    orgId: row.orgId,
    actor: { kind: row.actorKind, id: row.actorId },
    entityId: row.entityId,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    correlationId: row.correlationId,
    causationId: row.causationId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    payload: row.payload,
    source: row.source,
    confidence: row.confidence ?? undefined,
  };
}
