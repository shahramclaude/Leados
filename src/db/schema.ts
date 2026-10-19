import { pgTable, text, timestamp, jsonb, boolean, serial } from "drizzle-orm/pg-core";

/**
 * events — the append-only log that src/lib/eventBrain.ts projects.
 * This is the "no persistence beyond localStorage" gap the Part 1 brief
 * calls out, fixed: every event the brain reasons about is a durable
 * Postgres row, readable by both the Next.js UI and every API route.
 */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull().$type<Record<string, any>>(),
  seeded: boolean("seeded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * brain_runs — a durable history of autonomous-loop executions, so the
 * cockpit/autonomous-run API can show what changed between cycles
 * (BrainDelta) instead of recomputing from nothing every time.
 */
export const brainRuns = pgTable("brain_runs", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  orgHealthScore: text("org_health_score").notNull(),
  riskProfile: text("risk_profile").notNull(),
  dominantDomain: text("dominant_domain").notNull(),
  findingCount: text("finding_count").notNull(),
  summary: jsonb("summary").notNull().$type<Record<string, any>>(),
});
