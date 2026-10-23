// LEADOS — Part 48: Commitments, Delegation Intelligence, Proactive Draft Engine,
// Loop-Closure Engine.
//
// This file also carries minimal, clearly-labelled STUB tables standing in for
// upstream systems that this part depends on but whose source files were not
// present in the repository snapshot available to this session:
//   - Part 10 Autonomy Kernel      -> actionClasses, delegatedPermissions, policyAudit
//   - Part 14 Attention Budget     -> interruptBudget
//   - Part 23 Decisions/Rights     -> decisions, authorityRights
//   - Part 32 Briefing Compiler    -> briefingDigests (consumer of proactiveDrafts)
//   - Part 42 Meeting Artifacts    -> meetingArtifacts
//   - Part 43 1:1 surfaces         -> oneOnOnes
//   - Part 45 Time/Capacity data   -> timeAllocations
//   - Part 09 Growth paths         -> growthGoals
//   - Part 06 Capacity twin        -> capacityTwin
//   - Part 25 Cadence engine       -> cadenceTicks (drives when detection runs)
//
// These stubs implement only the surface this part needs (documented inline)
// and are namespaced so real Part 10/14/23/.. tables can replace them without
// renaming anything this part depends on, as long as the same shape is kept.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// People / org graph (minimal, shared by every module below)
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  email: text("email").notNull(),
  // Lower number = more senior/powerful. Used only for the escalation guard
  // (Phase 5, risk #2) — never for anything else.
  powerLevel: integer("power_level").notNull().default(5),
  managerId: uuid("manager_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 10 (stub): Autonomy Kernel — action classes + delegated permissions
// ---------------------------------------------------------------------------

export const actionClasses = pgTable("action_classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(), // e.g. "nudge.commitment_due"
  label: text("label").notNull(),
  // T1 draft-only .. T4 fully autonomous. Every class starts at T1.
  tier: text("tier").notNull().default("T1"),
  successCount: integer("success_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  promotionHistory: jsonb("promotion_history").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-person, per-action-class explicit grant. Tier alone never allows the
// product to act as a human — a grant here is also required, and only a human
// can create one (never inferred).
export const delegatedPermissions = pgTable("delegated_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id").notNull(),
  actionClassId: uuid("action_class_id").notNull(),
  grant: text("grant").notNull().default("none"), // none|draft|auto_with_notify|auto_silent
  grantedBy: uuid("granted_by").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const policyAudit = pgTable("policy_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorType: text("actor_type").notNull(), // system|human
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 14 (stub): Attention / interrupt budget
// ---------------------------------------------------------------------------

export const interruptBudget = pgTable("interrupt_budget", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  cap: integer("cap").notNull().default(5),
  used: integer("used").notNull().default(0),
  quietHoursStart: integer("quiet_hours_start").notNull().default(19), // 24h local
  quietHoursEnd: integer("quiet_hours_end").notNull().default(8),
});

// ---------------------------------------------------------------------------
// Part 23 (stub): Decisions + authority rights engine
// ---------------------------------------------------------------------------

export const decisions = pgTable("decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  ownerId: uuid("owner_id").notNull(),
  status: text("status").notNull().default("active"), // active|stagnating|decided
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authorityRights = pgTable("authority_rights", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: text("role").notNull(),
  actionClassKey: text("action_class_key").notNull(),
  allowed: boolean("allowed").notNull().default(true),
  ruleRef: text("rule_ref").notNull(),
});

// ---------------------------------------------------------------------------
// Part 42 (stub): Meeting artifacts  /  Part 43 (stub): 1:1 surfaces
// ---------------------------------------------------------------------------

export const meetingArtifacts = pgTable("meeting_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  ownerId: uuid("owner_id"),
  transcriptExcerpt: text("transcript_excerpt").notNull().default(""),
  // Structured action items as captured by Part 42's compiler, pre-extraction.
  actionItems: jsonb("action_items").notNull().default([]),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: uuid("id").defaultRandom().primaryKey(),
  managerId: uuid("manager_id").notNull(),
  reportId: uuid("report_id").notNull(),
  notes: text("notes").notNull().default(""),
  commitmentsRaw: jsonb("commitments_raw").notNull().default([]),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 45 (stub): time allocation data  /  Part 09 (stub): growth goals
// Part 06 (stub): capacity twin
// ---------------------------------------------------------------------------

export const timeAllocations = pgTable("time_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id").notNull(),
  weekOf: text("week_of").notNull(), // YYYY-MM-DD (Monday)
  category: text("category").notNull(),
  hours: real("hours").notNull(),
});

export const growthGoals = pgTable("growth_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id").notNull(),
  goalLabel: text("goal_label").notNull(),
  relatedSkillTags: jsonb("related_skill_tags").notNull().default([]),
});

export const capacityTwin = pgTable("capacity_twin", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id").notNull(),
  weekOf: text("week_of").notNull(),
  allocatedHours: real("allocated_hours").notNull().default(0),
  capacityHours: real("capacity_hours").notNull().default(40),
});

// ---------------------------------------------------------------------------
// Part 25 (stub): cadence engine tick log (drives when detection cycles run)
// ---------------------------------------------------------------------------

export const cadenceTicks = pgTable("cadence_ticks", {
  id: uuid("id").defaultRandom().primaryKey(),
  cadenceKey: text("cadence_key").notNull(), // e.g. "proactive.detect.daily"
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary").notNull().default({}),
});

// ---------------------------------------------------------------------------
// COMMITMENT LEDGER (this part's core model)
// ---------------------------------------------------------------------------

export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promisorId: uuid("promisor_id").notNull(),
    promiseeId: uuid("promisee_id").notNull(),
    content: text("content").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    context: jsonb("context").notNull().default({}), // { sourceType, sourceId, surface }
    status: text("status").notNull().default("open"), // open|kept|broken|renegotiated
    confirmed: boolean("confirmed").notNull().default(false), // human-confirmed extraction
    renegotiatedFromId: uuid("renegotiated_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commitments_promisor_idx").on(table.promisorId),
    index("commitments_promisee_idx").on(table.promiseeId),
    index("commitments_status_idx").on(table.status),
  ],
);

export const commitmentEvents = pgTable("commitment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  commitmentId: uuid("commitment_id").notNull(),
  type: text("type").notNull(), // created|renegotiated|kept|broken|nudged|parked
  fromDueAt: timestamp("from_due_at", { withTimezone: true }),
  toDueAt: timestamp("to_due_at", { withTimezone: true }),
  note: text("note").notNull().default(""),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// DELEGATION INTELLIGENCE
// ---------------------------------------------------------------------------

export const delegations = pgTable("delegations", {
  id: uuid("id").defaultRandom().primaryKey(),
  delegatorId: uuid("delegator_id").notNull(),
  delegateId: uuid("delegate_id").notNull(),
  commitmentId: uuid("commitment_id"),
  task: text("task").notNull(),
  actionClassKey: text("action_class_key").notNull(), // used for the authority check
  estimatedHours: real("estimated_hours").notNull().default(1),
  weekOf: text("week_of").notNull(),
  skillTags: jsonb("skill_tags").notNull().default([]),
  status: text("status").notNull().default("proposed"), // proposed|accepted|declined|blocked|completed
  overriddenBy: uuid("overridden_by"),
  overrideReason: text("override_reason"),
  lastCheckinAt: timestamp("last_checkin_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const delegationChecks = pgTable("delegation_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  delegationId: uuid("delegation_id").notNull(),
  checkType: text("check_type").notNull(), // authority|capacity|growth
  passed: boolean("passed").notNull(),
  explanation: jsonb("explanation").notNull().default({}), // Explain<T>
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// PROACTIVE DRAFT ENGINE
// ---------------------------------------------------------------------------

export const proactiveDrafts = pgTable("proactive_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  triggerType: text("trigger_type").notNull(),
  // deadline_slipping|decision_stagnating|meeting_no_actions|metric_drifting|delegation_unchecked
  surfaceRef: jsonb("surface_ref").notNull().default({}),
  draftType: text("draft_type").notNull(), // email|agenda_item|task|nudge|digest
  targetPersonId: uuid("target_person_id").notNull(),
  draftContent: text("draft_content").notNull(),
  whyThis: text("why_this").notNull(),
  whyNow: text("why_now").notNull(),
  stakes: text("stakes").notNull().default("normal"), // normal|elevated|critical
  actionClassKey: text("action_class_key").notNull(),
  autonomyTier: text("autonomy_tier").notNull().default("T1"),
  batchedCount: integer("batched_count").notNull().default(1),
  status: text("status").notNull().default("queued"), // queued|approved|sent|dismissed|auto_sent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by"),
});

// ---------------------------------------------------------------------------
// LOOP-CLOSURE ENGINE
// ---------------------------------------------------------------------------

export const loops = pgTable("loops", {
  id: uuid("id").defaultRandom().primaryKey(),
  surfaceType: text("surface_type").notNull(), // meeting|decision|ritual|commitment|delegation
  surfaceRef: jsonb("surface_ref").notNull().default({}),
  ownerId: uuid("owner_id"),
  nextStep: text("next_step"),
  status: text("status").notNull().default("open"), // open|closed|parked
  parkedReason: text("parked_reason"),
  parkedUntil: timestamp("parked_until", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Simple metric series used by the "metric drifting" detector
// ---------------------------------------------------------------------------

export const metricSeries = pgTable("metric_series", {
  id: uuid("id").defaultRandom().primaryKey(),
  metricKey: text("metric_key").notNull(),
  ownerId: uuid("owner_id"),
  value: real("value").notNull(),
  target: real("target").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
