// LEADOS — Part 55: Board Governance & Resolutions Automation
//
// This schema is self-contained for this working tree. Parts 23 (decision
// governance), 29 (risk/obligations), 32 (board pack machinery), 37
// (consolidation), 46 (conflict registry) and 19 (audit chain) are modelled
// here as the minimum interfaces this module depends on, since their files
// are not present in this repository snapshot. Field names and provenance
// tags (`sourcePart`) are kept so a future merge can reconcile with the
// real upstream tables without an API change.

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Identity & board structure
// ---------------------------------------------------------------------------

/** Board-tier access scopes. Kept as free varchar (not pg enum) so new
 * tiers can be added without a migration; validated in src/lib/governance/access.ts. */
export const users = pgTable("gov_users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  boardTier: varchar("board_tier", { length: 40 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const committees = pgTable("gov_committees", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  scopeDescription: text("scope_description").notNull(),
});

export const committeeMembers = pgTable("gov_committee_members", {
  id: serial("id").primaryKey(),
  committeeId: integer("committee_id").notNull(),
  userId: integer("user_id").notNull(),
  roleInCommittee: varchar("role_in_committee", { length: 40 })
    .notNull()
    .default("member"),
});

// ---------------------------------------------------------------------------
// Board cycle engine (Part 25 cadence, Part 32 pack machinery)
// ---------------------------------------------------------------------------

export const boardCalendar = pgTable("gov_board_calendar", {
  id: serial("id").primaryKey(),
  tier: varchar("tier", { length: 40 }).notNull(), // e.g. main_board, audit_committee
  cadenceDays: integer("cadence_days").notNull(),
  materialsLeadDays: integer("materials_lead_days").notNull().default(7),
  lastMeetingDate: timestamp("last_meeting_date"),
  nextMeetingDate: timestamp("next_meeting_date"),
});

export const boardMeetings = pgTable("gov_board_meetings", {
  id: serial("id").primaryKey(),
  tier: varchar("tier", { length: 40 }).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  materialsDeadline: timestamp("materials_deadline").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("scheduled"),
  // scheduled -> materials_due -> pack_assembled -> convened -> minutes_finalized -> closed
  escalationLevel: integer("escalation_level").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const completenessPolicy = pgTable("gov_completeness_policy", {
  id: serial("id").primaryKey(),
  sectionType: varchar("section_type", { length: 60 }).notNull(),
  mandatory: boolean("mandatory").notNull().default(true),
  appliesToTier: varchar("applies_to_tier", { length: 40 })
    .notNull()
    .default("main_board"),
  description: text("description").notNull(),
});

export const boardPacks = pgTable("gov_board_packs", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  assembledAt: timestamp("assembled_at"),
  assembledBy: integer("assembled_by"),
  numbersFrozenAt: timestamp("numbers_frozen_at"),
  frozenSnapshot: jsonb("frozen_snapshot"),
  completenessStatus: varchar("completeness_status", { length: 30 })
    .notNull()
    .default("pending"), // pending | complete | red_flag
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const packSections = pgTable("gov_pack_sections", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull(),
  sectionType: varchar("section_type", { length: 60 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull().default(""),
  required: boolean("required").notNull().default(false),
  included: boolean("included").notNull().default(true),
  omittedReason: text("omitted_reason"),
  omittedPolicyRef: varchar("omitted_policy_ref", { length: 120 }),
  sourcePart: varchar("source_part", { length: 60 }).notNull().default(""),
});

export const packRedFlags = pgTable("gov_pack_red_flags", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull(),
  sectionType: varchar("section_type", { length: 60 }).notNull(),
  flagType: varchar("flag_type", { length: 60 }).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
});

export const preReadTracking = pgTable("gov_pre_read_tracking", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull(),
  userId: integer("user_id").notNull(),
  openedAt: timestamp("opened_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
});

export const agendaItems = pgTable("gov_agenda_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  orderIndex: integer("order_index").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  linkedResolutionId: integer("linked_resolution_id"),
});

// ---------------------------------------------------------------------------
// Resolutions register & implementation linkage (Part 10 tasks interface)
// ---------------------------------------------------------------------------

export const resolutions = pgTable("gov_resolutions", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  text: text("text").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // advisory | binding
  status: varchar("status", { length: 30 }).notNull().default("proposed"),
  // proposed -> voted -> passed | rejected | withdrawn
  matterRef: varchar("matter_ref", { length: 200 }).notNull().default(""),
  proposedBy: integer("proposed_by"),
  proposedAt: timestamp("proposed_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

export const resolutionVotes = pgTable("gov_resolution_votes", {
  id: serial("id").primaryKey(),
  resolutionId: integer("resolution_id").notNull(),
  directorId: integer("director_id").notNull(),
  vote: varchar("vote", { length: 20 }).notNull(), // for | against | abstain | recused
  conflictDeclared: boolean("conflict_declared").notNull().default(false),
  conflictId: integer("conflict_id"),
  votedAt: timestamp("voted_at").notNull().defaultNow(),
});

/** Stub of the Part 10 implementation-task system interface. */
export const tasks = pgTable("gov_tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  owner: varchar("owner", { length: 200 }).notNull(),
  dueDate: timestamp("due_date"),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const resolutionImplementationLinks = pgTable(
  "gov_resolution_implementation_links",
  {
    id: serial("id").primaryKey(),
    resolutionId: integer("resolution_id").notNull(),
    taskId: integer("task_id").notNull(),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
    linkedBy: integer("linked_by"),
  },
);

export const oversightMilestones = pgTable("gov_oversight_milestones", {
  id: serial("id").primaryKey(),
  resolutionId: integer("resolution_id").notNull(),
  milestoneDate: timestamp("milestone_date").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | reviewed | overdue
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const effectivenessReviews = pgTable("gov_effectiveness_reviews", {
  id: serial("id").primaryKey(),
  resolutionId: integer("resolution_id").notNull(),
  milestoneId: integer("milestone_id").notNull(),
  reviewDate: timestamp("review_date").notNull().defaultNow(),
  outcome: varchar("outcome", { length: 30 }).notNull(),
  // effective | partially_effective | ineffective
  notes: text("notes").notNull().default(""),
  reviewedBy: integer("reviewed_by"),
});

// ---------------------------------------------------------------------------
// Minutes (Part 42 artifact pipeline: verbatim/generated separation; Part 19 chain)
// ---------------------------------------------------------------------------

export const minutes = pgTable("gov_minutes", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().unique(),
  verbatimExcerpts: jsonb("verbatim_excerpts").notNull().default([]),
  generatedSummary: text("generated_summary").notNull().default(""),
  finalized: boolean("finalized").notNull().default(false),
  finalizedBy: integer("finalized_by"),
  finalizedByTier: varchar("finalized_by_tier", { length: 40 }),
  finalizedAt: timestamp("finalized_at"),
  prevHash: varchar("prev_hash", { length: 80 }),
  hash: varchar("hash", { length: 80 }),
});

// ---------------------------------------------------------------------------
// Directors' information rights
// ---------------------------------------------------------------------------

export const informationRequests = pgTable("gov_information_requests", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  requestText: text("request_text").notNull(),
  targetTier: varchar("target_tier", { length: 40 }).notNull().default("management"),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  // open -> responded -> closed ; or overdue
  dueDate: timestamp("due_date").notNull(),
  responseText: text("response_text"),
  respondedBy: integer("responded_by"),
  respondedAt: timestamp("responded_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Whistleblower / audit-committee safe channel (Part 46 access rules)
// ---------------------------------------------------------------------------

export const whistleblowerReports = pgTable("gov_whistleblower_reports", {
  id: serial("id").primaryKey(),
  reporterToken: varchar("reporter_token", { length: 60 }).notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  channel: varchar("channel", { length: 40 })
    .notNull()
    .default("audit_committee_safe_channel"),
  status: varchar("status", { length: 30 }).notNull().default("received"),
  // received -> under_review -> escalated_to_board -> closed
  allowedTiers: jsonb("allowed_tiers")
    .notNull()
    .default(["chair", "audit_committee_chair", "audit_committee"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Conflicts register (Part 46, board-level) & independence
// ---------------------------------------------------------------------------

export const conflictsRegister = pgTable("gov_conflicts_register", {
  id: serial("id").primaryKey(),
  directorId: integer("director_id").notNull(),
  matter: varchar("matter", { length: 200 }).notNull(),
  natureOfInterest: text("nature_of_interest").notNull(),
  declaredAt: timestamp("declared_at").notNull().defaultNow(),
  status: varchar("status", { length: 30 }).notNull().default("declared"),
  // declared | waived_by_board | recusal_required | resolved
  recusalRequired: boolean("recusal_required").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Audit chain (Part 19) — hash-chained append-only log
// ---------------------------------------------------------------------------

export const auditLog = pgTable("gov_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorTier: varchar("actor_tier", { length: 40 }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: integer("entity_id"),
  payload: jsonb("payload").notNull().default({}),
  prevHash: varchar("prev_hash", { length: 80 }),
  hash: varchar("hash", { length: 80 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Governance policy (documented board decisions — e.g. opting into
// individual-director metrics must be an explicit, recorded board choice)
// ---------------------------------------------------------------------------

export const governancePolicy = pgTable("gov_governance_policy", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  value: jsonb("value").notNull(),
  documentedBy: varchar("documented_by", { length: 200 }).notNull(),
  documentedAt: timestamp("documented_at").notNull().defaultNow(),
  rationale: text("rationale").notNull().default(""),
});
