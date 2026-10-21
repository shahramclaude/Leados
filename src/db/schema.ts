// LEADOS platform schema — Part 01 (event-sourced core).
//
// Design summary (see AI-SESSION-LOG.md for rationale):
//  - `orgs` is the tenancy root. It is bootstrapped directly (not event
//    sourced) because it is the boundary the event hash-chain lives inside.
//  - `events` is the immutable, hash-chained, bi-temporal event log.
//  - `outbox` + `projectionCheckpoints` implement the outbox pattern so
//    projections are rebuildable and lag is observable.
//  - `idempotencyKeys` enforces unique (orgId, idempotencyKey) so repeated
//    writes replay the original result instead of re-executing.
//  - `snapshots` + `entityProjections` are rebuildable read models folded
//    from events. `entityProjections` is intentionally a single polymorphic
//    table (discriminated by `entityType`) rather than 14 bespoke tables —
//    this is a REVERSIBLE decision (see AI-SESSION-LOG.md) that can be
//    split via an expand/contract migration per entity once query patterns
//    diverge enough to need bespoke indexes.

import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Tenancy root. Not event sourced — it is the boundary the ledger lives in. */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  // Hash-chain head + sequence cursor. Locking this row (SELECT ... FOR
  // UPDATE) is what serializes the per-org hash chain writes.
  lastEventHash: text("last_event_hash"),
  lastEventSeq: bigint("last_event_seq", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("orgs_slug_unique").on(t.slug)]);

/**
 * The immutable event log. Bi-temporal: `occurredAt` (business time) and
 * `recordedAt` (system time) are both always preserved and never collapsed
 * into one timestamp.
 */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  eventType: text("event_type").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  actorKind: text("actor_kind").notNull(),
  actorId: text("actor_id").notNull(),
  actorDisplayName: text("actor_display_name").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
  causationId: uuid("causation_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").notNull(),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
}, (t) => [
  uniqueIndex("events_seq_unique").on(t.seq),
  uniqueIndex("events_org_idempotency_unique").on(t.orgId, t.idempotencyKey),
  index("events_org_seq_idx").on(t.orgId, t.seq),
  index("events_org_entity_idx").on(t.orgId, t.entityType, t.entityId, t.seq),
  index("events_org_type_idx").on(t.orgId, t.eventType),
]);

/** Outbox row written atomically with its event. Projector consumes these. */
export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  seq: bigint("seq", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | processed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  index("outbox_org_status_seq_idx").on(t.orgId, t.status, t.seq),
  uniqueIndex("outbox_event_unique").on(t.eventId),
]);

/** Idempotency ledger: unique (orgId, idempotencyKey) -> cached result. */
export const idempotencyKeys = pgTable("idempotency_keys", {
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  idempotencyKey: text("idempotency_key").notNull(),
  eventId: uuid("event_id").notNull().references(() => events.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  resultPayload: jsonb("result_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.idempotencyKey] })]);

/** Projector checkpoints — how far each projection has consumed the outbox. */
export const projectionCheckpoints = pgTable("projection_checkpoints", {
  projectionName: text("projection_name").notNull(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.projectionName, t.orgId] })]);

/** Snapshots: every N=200 events per entity, to bound replay cost. */
export const snapshots = pgTable("snapshots", {
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull(),
  version: integer("version").notNull(),
  state: jsonb("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.entityType, t.entityId] })]);

/**
 * Rebuildable read model. One polymorphic table discriminated by
 * `entityType`, holding the generic bitemporal/version envelope plus a
 * handful of commonly-filtered columns and a validated `data` payload.
 */
export const entityProjections = pgTable("entity_projections", {
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  version: integer("version").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ownerId: text("owner_id"),
  parentId: text("parent_id"),
  status: text("status"),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.orgId, t.entityType, t.entityId] }),
  index("entity_projections_org_type_owner_idx").on(t.orgId, t.entityType, t.ownerId),
  index("entity_projections_org_type_parent_idx").on(t.orgId, t.entityType, t.parentId),
  index("entity_projections_org_type_status_idx").on(t.orgId, t.entityType, t.status),
  index("entity_projections_org_type_updated_idx").on(t.orgId, t.entityType, t.updatedAt),
]);
