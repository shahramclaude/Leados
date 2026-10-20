// LEADOS — Part 01 event-sourcing core schema.
//
// Design decisions (see AI-SESSION-LOG.md Part 01 and docs/DATA.md for detail):
//  - `events` is the single append-only log for the whole system. No other
//    table may be written to directly by domain/UI code — everything goes
//    through src/lib/eventStore.ts.
//  - Append-only is enforced twice: (1) this file never defines an UPDATE/DELETE
//    path, and (2) a DB trigger (scripts/sql/0001_events_append_only.sql) makes
//    UPDATE/DELETE raise a Postgres exception. Both are required: the trigger is
//    the real guarantee (protects against bugs and future direct SQL), the
//    application guard is defence-in-depth and gives a fast, friendly error.
//  - `eventId` is a ULID (text), not a serial integer, so ids are globally
//    unique, monotonic (sortable by generation time), and safe to generate in
//    application code before the transaction commits (needed for the outbox
//    and for cursor pagination).
//  - `projectionState` is a *generic* per-(projector, entity) materialized
//    current-state table. We deliberately do not create one bespoke table per
//    projection (e.g. no `people_flight_risk_current` table): with 8 domains
//    and growing, a generic JSONB state table keeps the write path identical
//    for every projector and keeps `rebuildProjections()` uniform. Hot
//    dashboards read through src/lib/platform/hotQueries.ts, which documents
//    and `EXPLAIN`s the exact queries used (docs/DATA.md).
//  - `projectionCheckpoints` tracks replay progress per projector so
//    `rebuildProjections()` and future incremental catch-up can resume safely.
//  - `outbox` is the durable interface Part 12 (realtime/notifications) will
//    drain. It is populated synchronously in the same DB transaction as the
//    event append for any event type marked `notify: true` in the event
//    catalog (src/lib/events/eventCatalog.ts).
//  - `settings` is a tiny generic key/value JSONB store used for things like
//    the "this data is synthetic" dataset label (src/lib/dataset.server.ts)
//    and the current schema-version registry snapshot used by /api/export.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Small helper so the `.where()` partial index reads intention-revealing below.
function sqlIsNotNull(column: string) {
  return sql`${sql.raw(column)} is not null`;
}

// ---------------------------------------------------------------------------
// The event log — the single write path for all domain facts.
// ---------------------------------------------------------------------------
export const events = pgTable(
  "events",
  {
    eventId: text("event_id").primaryKey(), // ULID, generated in app code
    type: text("type").notNull(), // e.g. "people.flight_risk_changed"
    schemaVersion: integer("schema_version").notNull(),
    orgId: text("org_id").notNull(),
    actorKind: text("actor_kind").notNull(), // "user" | "agent" | "system" | "import"
    actorId: text("actor_id").notNull(),
    entityId: text("entity_id").notNull(), // aggregate id the event belongs to
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), // valid time
    recordedAt: timestamp("recorded_at", { withTimezone: true }) // transaction time
      .notNull()
      .defaultNow(),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key"),
    payload: jsonb("payload").notNull(),
    source: text("source").notNull(), // "ui" | "api" | "automation" | "import" | "migration"
    confidence: real("confidence"), // 0..1, nullable
  },
  (table) => [
    // Hot path: "everything for this entity, in business-time order" —
    // used by the event-stream API, asOf() replay, and per-entity projector apply.
    index("idx_events_org_entity_occurred").on(
      table.orgId,
      table.entityId,
      table.occurredAt,
    ),
    // Hot path: "all events of type X for org Y" — used by projector rebuild
    // and by analytics/metrics queries.
    index("idx_events_org_type_occurred").on(
      table.orgId,
      table.type,
      table.occurredAt,
    ),
    // Hot path: transaction-time scans ("what did we record today/this hour"),
    // and the basis for transactionAt in asOf().
    index("idx_events_recorded_at").on(table.recordedAt),
    // Hot path: "today" feed — all events for an org ordered by valid time,
    // irrespective of entity/type. See docs/DATA.md EXPLAIN #2.
    index("idx_events_org_occurred").on(table.orgId, table.occurredAt),
    // Cursor pagination tie-breaker / global replay order.
    index("idx_events_occurred_event").on(table.occurredAt, table.eventId),
    // Idempotency: imports/webhook replays supply an idempotencyKey; a second
    // append with the same key must be a no-op, not a duplicate row. Partial
    // (NULLS allowed many times) is expressed with .where() below.
    uniqueIndex("idx_events_idempotency_key")
      .on(table.idempotencyKey)
      .where(sqlIsNotNull("idempotency_key")),
  ],
);

// ---------------------------------------------------------------------------
// Per-projector replay checkpoint (name is the checkpoint key).
// ---------------------------------------------------------------------------
export const projectionCheckpoints = pgTable("projection_checkpoints", {
  projectorName: text("projector_name").primaryKey(),
  lastEventId: text("last_event_id"), // ULID of last event folded in, null = never run
  eventCount: integer("event_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Generic current-state materialized projection table.
// One row per (projectorName, entityId). This is what dashboards read.
// ---------------------------------------------------------------------------
export const projectionState = pgTable(
  "projection_state",
  {
    projectorName: text("projector_name").notNull(),
    entityId: text("entity_id").notNull(),
    orgId: text("org_id").notNull(),
    state: jsonb("state").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_projection_state_pk").on(
      table.projectorName,
      table.entityId,
    ),
    // Hot path: "every entity for projector X in org Y" — the shape every
    // cockpit/today/metrics query starts from.
    index("idx_projection_state_projector_org").on(
      table.projectorName,
      table.orgId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Outbox — durable "something happened that an external consumer may care
// about" queue. Part 12 (realtime/notifications) drains this table; nothing
// else should read it. Written synchronously in the same transaction as the
// triggering event append (see src/lib/eventStore.ts).
// ---------------------------------------------------------------------------
export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(), // ULID
    eventId: text("event_id").notNull(), // FK by convention to events.eventId
    orgId: text("org_id").notNull(),
    topic: text("topic").notNull(), // routing key, defaults to event type
    payload: jsonb("payload").notNull(), // denormalized envelope copy
    status: text("status").notNull().default("pending"), // pending|sent|failed|dead
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_outbox_status_available").on(table.status, table.availableAt),
    index("idx_outbox_event_id").on(table.eventId),
  ],
);

// ---------------------------------------------------------------------------
// Generic settings / small system state (dataset label, export counters…).
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
