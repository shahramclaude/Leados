import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS core event stream.
// This is the highest-volume table in the system (10x seed ~= 500k rows) and
// almost every dashboard panel reads from it, so every access pattern used by
// the API layer has a matching index (see docs/PERFORMANCE.md for EXPLAIN
// evidence on why each index exists).
// ---------------------------------------------------------------------------
export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    severity: text("severity").notNull(), // 'info' | 'warning' | 'critical'
    source: text("source").notNull(),
    entityId: text("entity_id"),
    value: numeric("value", { precision: 14, scale: 4 }).notNull().default("0"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    // Covers "latest N events" keyset pagination (ORDER BY occurred_at DESC, id DESC).
    index("events_occurred_at_id_idx").on(table.occurredAt.desc(), table.id.desc()),
    // Covers "latest N events of type X" (dashboard filters).
    index("events_type_occurred_at_idx").on(table.type, table.occurredAt.desc()),
    // Covers severity-filtered feeds (critical/warning triage lists).
    index("events_severity_occurred_at_idx").on(table.severity, table.occurredAt.desc()),
    // Covers entity drill-down (account/rep timeline) joins.
    index("events_entity_id_idx").on(table.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Network graph nodes (accounts / reps / deals) rendered by Network.tsx.
// ---------------------------------------------------------------------------
export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // 'account' | 'rep' | 'deal'
    riskScore: numeric("risk_score", { precision: 6, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("entities_kind_idx").on(table.kind)],
);

export const edges = pgTable(
  "edges",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").notNull(),
    weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
  },
  (table) => [
    index("edges_source_id_idx").on(table.sourceId),
    index("edges_target_id_idx").on(table.targetId),
  ],
);

// ---------------------------------------------------------------------------
// Notification feed - unbounded, must always be paginated + virtualized.
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull(),
    read: boolean("read").notNull().default(false),
  },
  (table) => [
    index("notifications_created_at_id_idx").on(table.createdAt.desc(), table.id.desc()),
    index("notifications_read_idx").on(table.read),
  ],
);

// ---------------------------------------------------------------------------
// Server-side projection cache. Forecasts are expensive (Monte Carlo over the
// full event history) so we persist the last computed projection and only
// recompute when explicitly invalidated by new event ingestion, rather than
// recomputing on every request.
// ---------------------------------------------------------------------------
export const forecastCache = pgTable("forecast_cache", {
  key: text("key").primaryKey(),
  horizonDays: integer("horizon_days").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  eventCountAtCompute: bigint("event_count_at_compute", { mode: "number" }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
});
