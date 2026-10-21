// LEADOS — People Intelligence data model (Part 09)
//
// Design rule (see docs/FAIRNESS.md): protected attributes (age, gender,
// ethnicity, religion, disability, union status, parental-leave status, ...)
// are EXCLUDED BY CONSTRUCTION — there is no column for any of them anywhere
// in this schema, and none should ever be added to tables consumed by
// `flightRisk.ts`, `succession.ts`, `teamHealth.ts` or `orgNetwork.ts`.
//
// Hard rule (Part 09-F): `collaborations` is metadata-only. It must never
// gain a free-text content/body/subject/transcript column. `scripts/test-privacy.ts`
// and `scripts/verify.ts` assert this contract at runtime against the live schema.

import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  date,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Identity & org structure
// ---------------------------------------------------------------------------

/** Every human who can authenticate into LEADOS (employee, manager, HR, exec). */
export const actors = pgTable("actors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Global role used for repository-layer visibility gating (Part 09-G).
  // One of: 'employee' | 'manager' | 'hr' | 'executive'
  globalRole: text("global_role").notNull().default("employee"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  managerId: text("manager_id").references(() => actors.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * HR-relevant record for a person. Deliberately narrow: only lawful,
 * job-relevant fields. No demographic columns exist here by design.
 */
export const people = pgTable("people", {
  id: text("id").primaryKey().references(() => actors.id),
  teamId: text("team_id").references(() => teams.id),
  managerId: text("manager_id").references(() => actors.id),
  title: text("title").notNull(),
  role: text("role").notNull(), // canonical role key used by succession/skills
  tenureStart: date("tenure_start").notNull(),
  compaRatio: numeric("compa_ratio", { precision: 5, scale: 3 }), // pay vs. band midpoint; job-relevant, not demographic
  location: text("location"),
  employmentType: text("employment_type").notNull().default("full_time"),
  status: text("status").notNull().default("active"), // active | terminated
  terminatedAt: timestamp("terminated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Event store (Part 01 stand-in) — append-only, source of truth for the
// person timeline and the "what did LEADOS believe on date X" projection.
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(), // 'person' | 'team' | 'oneOnOne' | 'growthPlan' | ...
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    actorId: text("actor_id").references(() => actors.id),
    // When the real-world fact happened.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // When LEADOS learned/recorded it — this is the timestamp used to
    // reconstruct "belief state as of date X", which can differ from
    // occurredAt (e.g. late-reported events, backfills).
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    // Tombstone support (Part 01 erasure flow): when set, payload has been
    // scrubbed and this row is retained only to preserve referential/audit
    // integrity of counts, not personal content.
    tombstonedAt: timestamp("tombstoned_at", { withTimezone: true }),
  },
  (t) => [
    index("events_entity_idx").on(t.entityType, t.entityId),
    index("events_recorded_idx").on(t.recordedAt),
  ],
);

// ---------------------------------------------------------------------------
// 1:1s, commitments, growth plans
// ---------------------------------------------------------------------------

export const oneOnOnes = pgTable("one_on_ones", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull().references(() => actors.id),
  employeeId: text("employee_id").notNull().references(() => actors.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  heldAt: timestamp("held_at", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"), // scheduled | held | cancelled
  // Shared agenda: visible to both manager and employee.
  agendaJson: jsonb("agenda_json").notNull().default([]),
  // Shared notes: visible to both manager and employee.
  sharedNotesJson: jsonb("shared_notes_json").notNull().default([]),
  // Private prep notes: per implemented policy (docs/FAIRNESS.md §Privacy
  // Policy), visible to the authoring manager and HR only — NOT the employee.
  privateNotesJson: jsonb("private_notes_json").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commitments = pgTable("commitments", {
  id: text("id").primaryKey(),
  oneOnOneId: text("one_on_one_id").notNull().references(() => oneOnOnes.id),
  ownerId: text("owner_id").notNull().references(() => actors.id), // who made the promise
  description: text("description").notNull(),
  dueDate: date("due_date"),
  status: text("status").notNull().default("open"), // open | kept | slipped
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const growthPlans = pgTable("growth_plans", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => actors.id),
  title: text("title").notNull(),
  targetSkillId: text("target_skill_id"),
  milestonesJson: jsonb("milestones_json").notNull().default([]),
  // [{ id, title, status: 'planned'|'in_progress'|'done', evidenceEventIds: string[] }]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Skills & capability graph
// ---------------------------------------------------------------------------

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
});

export const personSkills = pgTable("person_skills", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => actors.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  level: integer("level").notNull(), // 0-5
  source: text("source").notNull(), // 'declared' | 'observed'
  evidenceEventIds: jsonb("evidence_event_ids").notNull().default([]),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleSkills = pgTable("role_skills", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  skillId: text("skill_id").notNull().references(() => skills.id),
  requiredLevel: integer("required_level").notNull(), // 0-5
});

// ---------------------------------------------------------------------------
// Org network metadata (Part 09-F) — NEVER add a content/body/subject/
// transcript column to this table. Enforced by scripts/verify.ts.
// ---------------------------------------------------------------------------

export const collaborations = pgTable("collaborations", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => actors.id),
  counterpartId: text("counterpart_id").notNull().references(() => actors.id),
  context: text("context").notNull(), // 'meeting' | 'review' | 'project' | 'one_on_one' — category only
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
});

// ---------------------------------------------------------------------------
// Outcomes (for calibration/fairness audits) & calibration reports
// ---------------------------------------------------------------------------

export const attritionOutcomes = pgTable("attrition_outcomes", {
  personId: text("person_id").primaryKey().references(() => actors.id),
  leftAt: date("left_at"),
  leftVoluntary: boolean("left_voluntary"),
});

export const calibrationReports = pgTable("calibration_reports", {
  id: text("id").primaryKey(),
  modelName: text("model_name").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  reportJson: jsonb("report_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
