// LEADOS — Part 20 (SRE: telemetry, health, maintenance, audit, deployment plumbing)
//
// This sandbox checkout only contained a bare Next.js + Drizzle starter — none of the
// five legacy health endpoints, the Part 10 kernel, or the Part 19 audit chain tables
// referenced in the standing order exist here (see Phase 0 findings in docs/RUNBOOKS.md
// and AI-SESSION-LOG.md). The tables below are the minimum *real* substrate needed so the
// composite health model, telemetry trio, and runbooks in this part operate against real
// data instead of mocked responses.
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Work queue — backs queue depth / queue age / dead-letter health signals.
// ---------------------------------------------------------------------------
export const workQueueJobs = pgTable("work_queue_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  queue: text("queue").notNull().default("default"),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"), // pending | processing | done | dead_letter
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  lastError: text("last_error"),
  correlationId: text("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Agent runs — backs "last successful run" + "stuck run" health signals.
// Stands in for Part 10's orchestrator/kernel run ledger.
// ---------------------------------------------------------------------------
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("running"), // running | succeeded | failed | timed_out
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  correlationId: text("correlation_id").notNull(),
  error: text("error"),
  forecastDrift: integer("forecast_drift_bps"), // basis points, used for forecast-drift gauge
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Projection state — backs projection-freshness SLO / health signal.
// ---------------------------------------------------------------------------
export const projectionState = pgTable("projection_state", {
  name: text("name").primaryKey(),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  rowCount: integer("row_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Notifications — backs notification-delivery SLO.
// ---------------------------------------------------------------------------
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: text("channel").notNull().default("email"),
  status: text("status").notNull().default("queued"), // queued | sent | failed
  correlationId: text("correlation_id").notNull(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Audit chain — stand-in for Part 19's hash-chained audit log. Each row commits
// to the previous row's hash so tampering/gaps are detectable.
// ---------------------------------------------------------------------------
export const auditEvents = pgTable("audit_events", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").notNull().default({}),
  correlationId: text("correlation_id").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Trace spans — sampled spans persisted so the "explain this correlationId"
// viewer can reconstruct an end-to-end trace without an external APM backend.
// ---------------------------------------------------------------------------
export const traceSpans = pgTable("trace_spans", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  correlationId: text("correlation_id").notNull(),
  traceId: text("trace_id").notNull(),
  spanId: text("span_id").notNull(),
  parentSpanId: text("parent_span_id"),
  name: text("name").notNull(),
  service: text("service").notNull(), // api | orchestrator | agent-run | repo | external
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("ok"), // ok | error
  attributes: jsonb("attributes").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// System settings — small key/value store for maintenance mode, incident
// banner state, and the stream-hub heartbeat used by graceful shutdown.
// ---------------------------------------------------------------------------
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Deferred writes — maintenance-mode write queueing. Mutating API calls made
// while maintenance mode is enabled are persisted here and replayed on flush.
// ---------------------------------------------------------------------------
export const deferredWrites = pgTable("deferred_writes", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  body: jsonb("body").notNull().default({}),
  correlationId: text("correlation_id").notNull(),
  status: text("status").notNull().default("queued"), // queued | replayed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  replayedAt: timestamp("replayed_at", { withTimezone: true }),
  lastError: text("last_error"),
});

// ---------------------------------------------------------------------------
// Backup drills — append-only record of backup/restore verification runs so
// the RPO/RTO claims in docs/SLO.md are evidence-backed, not aspirational.
// ---------------------------------------------------------------------------
export const backupDrills = pgTable("backup_drills", {
  id: uuid("id").primaryKey().defaultRandom(),
  backupFile: text("backup_file").notNull(),
  sourceRowCounts: jsonb("source_row_counts").notNull().default({}),
  restoredRowCounts: jsonb("restored_row_counts").notNull().default({}),
  checksumMatch: boolean("checksum_match").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
