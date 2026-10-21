// LEADOS — Part 18 (production maturity / observability / SLOs / health /
// runbooks / deployment / backup-restore) schema.
//
// Scope note (see docs/adr/0003-part18-scope-given-upstream-inconsistency.md):
// the `shahramclaude/Leados` repository as cloned for this part contains
// several mutually-incompatible prior deliverables merged into one tree
// (a Vite-era app, a ~300-route Next.js app referencing a schema that does
// not exist, and a smaller coherent Next.js core) and does not compile
// (`npx tsc --noEmit` => 4159 errors, verified before any file here was
// written). This schema is additive, self-contained, and backs every claim
// made in docs/SLO.md, docs/RUNBOOKS.md and the composite health endpoint —
// nothing here is decorative.
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Generic key/value store for small pieces of operational state that don't
 * warrant their own table: schema_version, maintenance_mode, heartbeats. */
export const systemMeta = pgTable("system_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only event log. The single source of truth every projection is
 * derived from. Never updated or deleted in application code. */
export const eventLog = pgTable(
  "event_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    id: uuid("id").notNull().defaultRandom(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    actor: text("actor").notNull().default("system"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_log_created_at_idx").on(t.createdAt)],
);

/** Materialized projection rebuilt from event_log by the
 * `projection.refresh` job. `updatedAt` vs event_log's latest row is the
 * data-freshness / projection-lag SLO measurement. */
export const projectionOrgStats = pgTable("projection_org_stats", {
  id: text("id").primaryKey().default("global"),
  eventCount: integer("event_count").notNull().default(0),
  lastEventSeq: bigint("last_event_seq", { mode: "number" }).notNull().default(0),
  byType: jsonb("by_type").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workQueueStatus = ["queued", "running", "succeeded", "failed", "dead"] as const;
export type WorkQueueStatus = (typeof workQueueStatus)[number];

/** The Part 07 kernel's work queue: durable jobs claimed with
 * `FOR UPDATE SKIP LOCKED`, retried with backoff, and moved to the
 * dead-letter state (`status = 'dead'`) after `maxAttempts`. */
export const workQueue = pgTable(
  "work_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").$type<WorkQueueStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("work_queue_status_available_idx").on(t.status, t.availableAt),
    index("work_queue_job_type_idx").on(t.jobType),
  ],
);

/** Transactional outbox for at-least-once async delivery (notifications,
 * webhooks) decoupled from the request that produced them. */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").$type<"pending" | "sent" | "failed">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("outbox_status_created_idx").on(t.status, t.createdAt)],
);

/** One row per scheduled/triggered automation run — the ledger the
 * `automation_freshness` and automation-success-rate SLOs read from. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    status: text("status").$type<"succeeded" | "failed">().notNull(),
    triggeredBy: text("triggered_by").$type<"scheduler" | "manual">().notNull().default("scheduler"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    correlationId: text("correlation_id"),
    error: text("error"),
  },
  (t) => [index("automation_runs_job_type_idx").on(t.jobType, t.finishedAt)],
);

/** Hash-chained audit log (Part 17 lineage): each row commits to the hash of
 * the previous row, so `scripts/audit-verify.ts` / `/api/audit/verify` can
 * detect any tamper or gap. */
export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    payload: jsonb("payload").notNull().default({}),
    correlationId: text("correlation_id"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** SLO-breach and drill findings. A breach auto-opens a row here; it is
 * resolved explicitly (manually or by a future auto-close job). */
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    severity: text("severity").$type<"info" | "warning" | "critical">().notNull(),
    title: text("title").notNull(),
    detail: jsonb("detail").notNull().default({}),
    status: text("status").$type<"open" | "resolved">().notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("findings_status_idx").on(t.status, t.kind)],
);

/** Every backup and restore-verification attempt — "a backup you haven't
 * restored is not a backup" is enforced by `backup.restore_verify` writing
 * here and the health check reading the latest row. */
export const backupsLog = pgTable("backups_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"backup" | "restore_verify">().notNull(),
  filePath: text("file_path"),
  status: text("status").$type<"success" | "failed">().notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  detail: jsonb("detail").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
});

/** Demo domain rows so the event log / projection / queue machinery has
 * something real to operate on (kept intentionally tiny — this part's
 * mission is operability, not product surface). */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceState = pgTable("maintenance_state", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(false),
  reason: text("reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});
