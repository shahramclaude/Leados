import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// LEADOS domain schema (Part 03)
// Entities: scenarios -> objectives -> findings, objectives -> approvals.
// `version` columns back optimistic-concurrency (expectedVersion) on every
// mutation. `auditLog` backs the "what changed since last visit" strip and
// the realtime stream. `mutationLog` backs server-side idempotency so queued
// offline mutations can be safely replayed without double-applying.
// ---------------------------------------------------------------------------

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const objectives = pgTable("objectives", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => scenarios.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("draft"), // draft|active|at_risk|done
  ownerName: text("owner_name").notNull().default("You"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  confidence: text("confidence").notNull().default("medium"), // low|medium|high
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending|approved|rejected|changes_requested
  requestedByName: text("requested_by_name").notNull().default("You"),
  decidedByName: text("decided_by_name"),
  note: text("note").default(""),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // objective|finding|approval
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(), // created|updated|status_changed|approved|rejected
  actorName: text("actor_name").notNull().default("You"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mutationLog = pgTable("mutation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  entityType: text("entity_type").notNull(),
  status: text("status").notNull(), // applied|conflict|failed
  resultJson: jsonb("result_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
