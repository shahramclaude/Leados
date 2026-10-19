// ─────────────────────────────────────────────────────────────────────────
// LEADOS — Canonical Data Model (Part 2: Data Layer, Event Sourcing & Truth
// Engine)
//
// Design rules enforced by this file (see docs/DATA.md for full rationale):
//
//  1. `events` is the single source of truth. It is append-only: inserts
//     only, never updates (except the one documented, trigger-guarded
//     redaction path used by retention/GDPR — see migration
//     0001_events_append_only_guard.sql) and never deletes.
//  2. Every other table in this file is a PROJECTION: a query-optimized,
//     fully-derived, disposable materialization of the event log. Nothing
//     in a projection table is a fact on its own — if you truncated every
//     projection table and ran `rebuildProjections()`, the database must
//     come back byte-for-byte equivalent (see src/lib/events/rebuild.ts).
//  3. All timestamps are `timestamptz` (stored in UTC). User-facing
//     timezone lives in `settings.orgTimezone` — see src/lib/time.ts for
//     the single clock contract used across the app.
//  4. Bitemporal facts (things that can be corrected after the fact, e.g.
//     org structure) live in `org_facts` with validFrom/validTo (the
//     "believed true in the world" axis) and recordedAt (the "when we
//     learned it" axis), which is what makes `asOf()` queries possible.
// ─────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─────────────────────────────── Schema version ────────────────────────
// A single source the app checks at boot (see src/db/schemaVersion.ts).
// Bumped by every migration that changes the shape of the truth engine.
export const schemaVersion = pgTable("schema_version", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  description: text("description").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────────── Events ──────────────────────────────
// The append-only event log. `id` is a ULID (lexicographically sortable by
// creation time, globally unique without a central sequence — see
// src/lib/events/id.ts) so causality can be reasoned about without relying
// on serial ordering. `seq` is kept as a monotonically increasing bigint
// purely as a cheap, index-friendly cursor for keyset pagination.
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(), // ULID
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    type: text("type").notNull(),
    domain: text("domain").notNull(),
    entityId: text("entity_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull(), // event (business) time
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(), // transaction time
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    source: text("source").notNull().default("system"),
    schemaVersion: integer("schema_version").notNull().default(1),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key"),
    redacted: boolean("redacted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("events_seq_idx").on(table.seq),
    index("events_domain_ts_idx").on(table.domain, table.ts),
    index("events_type_idx").on(table.type),
    index("events_entity_idx").on(table.entityId),
    index("events_correlation_idx").on(table.correlationId),
    uniqueIndex("events_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

// ───────────────────────── Projection checkpoints ──────────────────────
// Bookkeeping for `rebuildProjections()` / incremental synchronous apply.
export const projectionCheckpoints = pgTable("projection_checkpoints", {
  projectionName: text("projection_name").primaryKey(),
  lastSeq: bigint("last_seq", { mode: "bigint" }).notNull().default(sql`0`),
  eventCount: bigint("event_count", { mode: "bigint" }).notNull().default(sql`0`),
  rebuiltAt: timestamp("rebuilt_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────── People domain ───────────────────────────
// Per-person crypto-key free erasure model: PII (name/email) is projected
// in plaintext for product usability, and GDPR erasure directly redacts
// this row (see src/lib/people/erasure.ts + docs/DATA.md §7). Aggregate,
// non-identifying numeric fields survive erasure so org statistics stay
// correct.
export const peopleProjection = pgTable(
  "people_projection",
  {
    id: text("id").primaryKey(), // entityId used on person.* events
    name: text("name").notNull(),
    email: text("email"),
    role: text("role").notNull(),
    team: text("team").notNull(),
    tenureMonths: real("tenure_months").notNull().default(0),
    sentiment: real("sentiment").notNull().default(0.5),
    engagement: real("engagement").notNull().default(0.5),
    flightRisk: real("flight_risk").notNull().default(0),
    lastCheckIn: timestamp("last_check_in", { withTimezone: true }),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (table) => [index("people_projection_team_idx").on(table.team)],
);

// ─────────────────────────── Execution domain ──────────────────────────
export const projectsProjection = pgTable(
  "execution_projects_projection",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    owner: text("owner").notNull(),
    status: text("status").notNull().default("backlog"),
    confidence: real("confidence").notNull().default(0.5),
    durationDays: integer("duration_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (table) => [index("execution_projects_status_idx").on(table.status)],
);

export const milestonesProjection = pgTable(
  "execution_milestones_projection",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    completed: boolean("completed").notNull().default(false),
    overdue: boolean("overdue").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (table) => [index("execution_milestones_project_idx").on(table.projectId)],
);

export const blockersProjection = pgTable(
  "execution_blockers_projection",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    severity: text("severity").notNull().default("medium"),
    description: text("description").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (table) => [index("execution_blockers_project_idx").on(table.projectId)],
);

// ───────────────────────────── Strategy domain ─────────────────────────
export const decisionsProjection = pgTable(
  "decisions_projection",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    owner: text("owner").notNull(),
    status: text("status").notNull().default("open"),
    severity: text("severity").notNull().default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    description: text("description").notNull().default(""),
    outcome: text("outcome"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (table) => [index("decisions_status_idx").on(table.status)],
);

export const okrProjection = pgTable("okr_projection", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  quarterStart: timestamp("quarter_start", { withTimezone: true }).notNull(),
  progress: real("progress").notNull().default(0),
  health: text("health").notNull().default("on_track"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastEventSeq: bigint("last_event_seq", { mode: "bigint" }).notNull().default(sql`0`),
});

// ───────────────────────────── Finance domain ──────────────────────────
export const financeSnapshotsProjection = pgTable(
  "finance_snapshots_projection",
  {
    id: text("id").primaryKey(), // sourcing event id
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    cash: real("cash").notNull(),
    mrr: real("mrr").notNull(),
    burn: real("burn").notNull(),
    runwayMonths: real("runway_months").notNull(),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
  },
  (table) => [index("finance_snapshots_ts_idx").on(table.ts)],
);

// ───────────────────────── Generic metric time series ──────────────────
export const metricValues = pgTable(
  "metric_values",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    metricKey: text("metric_key").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    value: real("value").notNull(),
    eventId: text("event_id").notNull(),
  },
  (table) => [
    index("metric_values_key_ts_idx").on(table.metricKey, table.ts),
    uniqueIndex("metric_values_event_idx").on(table.eventId),
  ],
);

// ───────────────────────── Bitemporal org facts ────────────────────────
// Facts about the org that can be corrected in hindsight (manager changes,
// team moves, title changes, ...). `validFrom`/`validTo` describe the
// period the fact is believed true IN THE WORLD; `recordedAt`/
// `supersededAt` describe when WE believed it (transaction time). This is
// what makes `asOf(subject, attribute, date)` answer "what did we believe
// on date X" rather than just "what do we believe now".
export const orgFacts = pgTable(
  "org_facts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    subjectType: text("subject_type").notNull(), // 'person' | 'project' | 'org'
    subjectId: text("subject_id").notNull(),
    attribute: text("attribute").notNull(), // e.g. 'manager', 'team', 'title'
    value: jsonb("value").notNull().$type<Record<string, unknown>>(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    sourceEventId: text("source_event_id").notNull(),
  },
  (table) => [
    index("org_facts_subject_idx").on(table.subjectType, table.subjectId, table.attribute),
    index("org_facts_valid_idx").on(table.validFrom, table.validTo),
  ],
);

// ────────────────────────────────── Settings ───────────────────────────
// Singleton row (id = 1). Holds the user-facing timezone contract and
// operational knobs (e.g. backup reminder threshold).
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  orgTimezone: text("org_timezone").notNull().default("UTC"),
  backupReminderDays: integer("backup_reminder_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────────── Retention policy ────────────────────────
export const retentionPolicies = pgTable("retention_policies", {
  eventType: text("event_type").primaryKey(),
  retentionDays: integer("retention_days").notNull(),
  purgeable: boolean("purgeable").notNull().default(false),
  rationale: text("rationale").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── Append-only audit trail ─────────────────────
// Every export, import, backup, restore, erasure and retention purge is
// recorded here. This table itself is written to via INSERT only from
// src/lib/audit.ts.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    action: text("action").notNull(), // 'export' | 'import' | 'backup' | 'restore' | 'erasure' | 'retention_purge'
    actorId: text("actor_id").notNull().default("system"),
    targetId: text("target_id"),
    details: jsonb("details").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_action_idx").on(table.action)],
);

// Per-event idempotency receipts for API ingestion (belt-and-suspenders on
// top of the unique index on events.idempotency_key — this table lets the
// ingestion endpoint return the original response body for a repeated
// request even across retries that race the unique constraint).
export const idempotencyReceipts = pgTable("idempotency_receipts", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  eventId: text("event_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
