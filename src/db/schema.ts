// src/db/schema.ts
//
// Part 18 performance slice. Domain follows the canonical LEADOS org-
// intelligence model found upstream (tenants/people/relationships/decisions/
// forecasts) rather than a generic "sales leads" model — see
// AI-SESSION-LOG.md for the read-before-write note on why this scoped
// re-implementation exists instead of a 2,148-file import.
//
// Every table is tenant-scoped (Part 03 convention: `tenantId` on every
// table) and every unbounded-access pattern (list people, list decisions,
// list relationships) has a btree index backing its WHERE/ORDER BY so
// `EXPLAIN ANALYZE` shows an index scan, not a sequential scan, at 10x scale.
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    role: text("role").notNull(),
    team: text("team").notNull(),
    managerId: uuid("manager_id"),
    riskScore: real("risk_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Backs the paginated "list people in tenant, newest first" query
    // (/api/people) — see docs/PERFORMANCE.md EXPLAIN evidence.
    index("people_tenant_created_idx").on(t.tenantId, t.createdAt),
    // Backs the manager batch-loader (WHERE manager_id = ANY($1)) used to
    // kill the people-list N+1 described in docs/PERFORMANCE.md.
    index("people_manager_idx").on(t.managerId),
    index("people_tenant_team_idx").on(t.tenantId, t.team),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    sourcePersonId: uuid("source_person_id").notNull(),
    targetPersonId: uuid("target_person_id").notNull(),
    kind: text("kind").notNull(),
    weight: real("weight").notNull(),
  },
  (t) => [
    // Backs the bounded org-network query (top-N by weight within tenant).
    index("relationships_tenant_weight_idx").on(t.tenantId, t.weight),
    index("relationships_source_idx").on(t.sourcePersonId),
    index("relationships_target_idx").on(t.targetPersonId),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    personId: uuid("person_id").notNull(),
    kind: text("kind").notNull(),
    impact: real("impact").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Backs the heatmap aggregation (GROUP BY day WHERE tenant_id = $1 AND
    // occurred_at BETWEEN ...) — the single most expensive query in Phase 0.
    index("decisions_tenant_occurred_idx").on(t.tenantId, t.occurredAt),
    index("decisions_person_idx").on(t.personId),
  ],
);

export const forecastRuns = pgTable(
  "forecast_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    scenarioKey: text("scenario_key").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    status: text("status").notNull(), // 'ready' | 'computing' | 'error'
    p10: real("p10"),
    p50: real("p50"),
    p90: real("p90"),
    series: jsonb("series").$type<{ week: number; p10: number; p50: number; p90: number }[]>(),
    durationMs: integer("duration_ms"),
    computedAt: timestamp("computed_at", { withTimezone: true }),
  },
  (t) => [
    // Durable projection cache: one row per (tenant, scenario, inputs hash).
    // This is the "projection cache with event-driven invalidation" surface
    // — a new inputs hash (any input event changed) simply inserts a new
    // row rather than overwriting, so stale rows can still be served while
    // a fresh computation runs (see src/lib/forecastCache.ts).
    uniqueIndex("forecast_runs_identity_idx").on(t.tenantId, t.scenarioKey, t.inputsHash),
    index("forecast_runs_tenant_idx").on(t.tenantId),
  ],
);
