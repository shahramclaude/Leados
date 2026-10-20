// LEADOS data model.
//
// Scope note (Part 14 — Observability, Reliability, Release Engineering):
// This working tree started from a blank Next.js + PostgreSQL starter template
// (see AI-SESSION-LOG.md for the provenance note about the upstream
// `shahramclaude/Leados` GitHub repository, which contains a much larger but
// currently non-building speculative codebase that this part deliberately
// does not try to resurrect). The two tables below are the minimum real,
// honest surface needed to make the composite health system
// (`src/lib/health`) check actual state instead of fabricating it:
//
//   - `system_meta`   — small key/value table used to record the applied
//                        schema version (written by `npm run db:migrate`)
//                        and the maintenance-mode flag.
//   - `automation_runs` — an append-only ledger of background/automation
//                        work. Nothing in this build enqueues real agent
//                        work yet, so this table is seeded with
//                        representative rows and exposed through
//                        `POST /api/automation/heartbeat` so the health
//                        system has real rows to query for "queue lag" and
//                        "last successful automation run". This is
//                        intentionally a minimal ledger, not a claim that a
//                        full orchestrator/agent runtime exists.
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const automationRunStatusEnum = pgEnum("automation_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const systemMeta = pgTable("system_meta", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    status: automationRunStatusEnum("status").notNull().default("queued"),
    correlationId: varchar("correlation_id", { length: 64 }),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("automation_runs_status_idx").on(table.status),
    index("automation_runs_queued_at_idx").on(table.queuedAt),
  ],
);

export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;
export type SystemMetaRow = typeof systemMeta.$inferSelect;
