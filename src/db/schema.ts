// LEADOS — Part 43: Development & Coaching Surfaces
//
// NOTE ON PROVENANCE: this sandbox does not contain the working trees for
// Parts 09, 12, 23 or 26 (src/lib was empty on read). Per the standing order
// we read-before-write; there was nothing to read. The tables and types
// below reconstruct the *minimum* stable interfaces those parts are known to
// expose (people/role scoping + fairness primitives from Part 09, assistant
// memory shape from Part 12, the person-owned decision-journal record shape
// from Part 23, and a lightweight change-initiative reference from Part 26)
// so that Part 43 can be built against them faithfully. This is called out
// again in AI-SESSION-LOG.md.

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 09 reconstruction: people, roles, scoping
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["member", "manager", "admin"] })
    .notNull()
    .default("member"),
  managerId: text("manager_id"),
  department: text("department").notNull().default("general"),
  // Coarse, self-reported, optional — used ONLY for aggregate fairness
  // reporting with a minimum sample-size guard. Never joined to coaching or
  // feedback content.
  demographicGroup: text("demographic_group"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Part 09 competency anchors ("careers.ts" taxonomy)
export const competencies = pgTable("competencies", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  cluster: text("cluster", {
    enum: ["self-leadership", "people-leadership", "strategic-leadership"],
  }).notNull(),
  description: text("description").notNull(),
});

// ---------------------------------------------------------------------------
// Development graph: experiences & relationships catalogs
// ---------------------------------------------------------------------------

export const experiences = pgTable("experiences", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  competencyIds: jsonb("competency_ids").$type<string[]>().notNull(),
  stretchLevel: text("stretch_level", { enum: ["moderate", "high"] }).notNull(),
});

export const relationshipTypes = pgTable("relationship_types", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["mentor", "sponsor", "peer-coach"] }).notNull(),
  description: text("description").notNull(),
  competencyIds: jsonb("competency_ids").$type<string[]>().notNull(),
});

// Evidence events — demonstrated-evidence, not self-rating alone.
export const evidenceEvents = pgTable("evidence_events", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  competencyId: text("competency_id").notNull().references(() => competencies.id),
  eventType: text("event_type", {
    enum: ["self_rating", "manager_observation", "peer_feedback_theme", "demonstrated_outcome"],
  }).notNull(),
  narrative: text("narrative").notNull(),
  // Relative evidentiary weight: self_rating is intentionally the lowest.
  evidenceWeight: real("evidence_weight").notNull(),
  sourceRef: text("source_ref"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  visibility: text("visibility", { enum: ["private", "shared_with_manager"] })
    .notNull()
    .default("private"),
});

// Person's own growth goals (private by default — symmetry rule applies).
export const growthGoals = pgTable("growth_goals", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  competencyId: text("competency_id").notNull().references(() => competencies.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["active", "stalled", "achieved", "archived"] })
    .notNull()
    .default("active"),
  targetDate: timestamp("target_date", { withTimezone: true }),
  visibility: text("visibility", { enum: ["private", "shared_with_manager"] })
    .notNull()
    .default("private"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit trail of Explain<T> growth-path recommendations (for citation tests).
export const growthPathRecommendations = pgTable("growth_path_recommendations", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  competencyId: text("competency_id").notNull().references(() => competencies.id),
  gapSummary: text("gap_summary").notNull(),
  recommendationType: text("recommendation_type", { enum: ["experience", "relationship"] }).notNull(),
  refId: text("ref_id").notNull(),
  rationale: text("rationale").notNull(),
  citedEvidenceIds: jsonb("cited_evidence_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 23 reconstruction: person-owned journal / decision records
// ---------------------------------------------------------------------------

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  kind: text("kind", { enum: ["coaching_commitment", "reflection", "decision"] }).notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  visibility: text("visibility", { enum: ["private", "shared_with_manager"] })
    .notNull()
    .default("private"),
  relatedSessionId: text("related_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 26 reconstruction: lightweight change-initiative reference
// (used only so a growth goal can optionally link to an org change wave).
// ---------------------------------------------------------------------------

export const changeInitiatives = pgTable("change_initiatives", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  phase: text("phase", { enum: ["sense", "design", "pilot", "scale", "sustain"] }).notNull(),
});

// ---------------------------------------------------------------------------
// 360 feedback system — confidentiality enforced at storage layer
// ---------------------------------------------------------------------------

export const feedbackRequests = pgTable("feedback_requests", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull().references(() => people.id),
  requestedById: text("requested_by_id").notNull().references(() => people.id),
  themeCompetencyId: text("theme_competency_id").references(() => competencies.id),
  message: text("message").notNull(),
  confidentialityPolicy: text("confidentiality_policy", {
    enum: ["anonymous_aggregate", "attributed_with_consent"],
  })
    .notNull()
    .default("anonymous_aggregate"),
  aggregationThreshold: integer("aggregation_threshold").notNull().default(3),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedbackInvitations = pgTable("feedback_invitations", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => feedbackRequests.id),
  raterId: text("rater_id").notNull().references(() => people.id),
  status: text("status", { enum: ["pending", "responded", "declined"] })
    .notNull()
    .default("pending"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

// IMPORTANT (storage-layer confidentiality): for `anonymous_aggregate`
// policy, or whenever a rater declines attribution, `invitationId` and
// `attributedRaterId` are left NULL — the link to the rater is never
// persisted anywhere, not merely access-controlled. There is no column, no
// row, no join path that can recover who authored the response. This is the
// property the confidentiality attempt-tests check directly with raw SQL.
export const feedbackResponses = pgTable("feedback_responses", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => feedbackRequests.id),
  invitationId: text("invitation_id"),
  attributedRaterId: text("attributed_rater_id"),
  attributionConsent: boolean("attribution_consent").notNull().default(false),
  ratingsJson: jsonb("ratings_json").$type<Record<string, number>>().notNull(),
  qualitativeText: text("qualitative_text").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

// Feedback-to-growth linkage requires the SUBJECT's consent per link.
export const feedbackThemeLinks = pgTable("feedback_theme_links", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => feedbackRequests.id),
  subjectId: text("subject_id").notNull().references(() => people.id),
  competencyId: text("competency_id").notNull().references(() => competencies.id),
  developmentThemeSummary: text("development_theme_summary").notNull(),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
  evidenceEventId: text("evidence_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Micro-coaching engine (GROW) — private by default
// ---------------------------------------------------------------------------

export const coachingSessions = pgTable("coaching_sessions", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  topic: text("topic").notNull(),
  stage: text("stage", { enum: ["goal", "reality", "options", "will", "complete"] })
    .notNull()
    .default("goal"),
  status: text("status", { enum: ["active", "completed", "abandoned"] })
    .notNull()
    .default("active"),
  // Coaching session transcripts are ALWAYS private; only the derived,
  // owner-chosen commitment (see `commitments`) can ever be shared.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachingMessages = pgTable("coaching_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => coachingSessions.id),
  speaker: text("speaker", { enum: ["coach", "person"] }).notNull(),
  content: text("content").notNull(),
  stage: text("stage", { enum: ["goal", "reality", "options", "will", "complete"] }).notNull(),
  flaggedDirective: boolean("flagged_directive").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Owner-chosen commitments (Part 23-style record): person-owned, private by
// default, only visible to a manager if the person explicitly shares it.
export const commitments = pgTable("commitments", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  sessionId: text("session_id").references(() => coachingSessions.id),
  competencyId: text("competency_id").references(() => competencies.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status", { enum: ["open", "in_progress", "done", "dropped"] })
    .notNull()
    .default("open"),
  visibility: text("visibility", { enum: ["private", "shared_with_manager"] })
    .notNull()
    .default("private"),
  lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Manager-enablement layer — symmetry-verified
// ---------------------------------------------------------------------------

export const oneOnOnes = pgTable("one_on_ones", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull().references(() => people.id),
  personId: text("person_id").notNull().references(() => people.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  cadenceDays: integer("cadence_days").notNull().default(14),
  status: text("status", { enum: ["scheduled", "held", "skipped"] })
    .notNull()
    .default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Manager nudges are generated ONLY from data the person has marked
// `shared_with_manager`. Every nudge row records exactly which source datum
// licensed it, so the symmetry test can verify the person can see the same
// underlying item.
export const managerNudges = pgTable("manager_nudges", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull().references(() => people.id),
  personId: text("person_id").notNull().references(() => people.id),
  kind: text("kind", {
    enum: ["stalled_goal", "feedback_cycle_due", "commitment_overdue", "celebrate_progress"],
  }).notNull(),
  message: text("message").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceId: text("source_id").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Access audit log — backs confidentiality + fairness tests
// ---------------------------------------------------------------------------

export const accessAuditLog = pgTable("access_audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  targetPersonId: text("target_person_id"),
  surface: text("surface", { enum: ["coaching", "feedback", "growth", "one_on_one"] }).notNull(),
  allowed: boolean("allowed").notNull(),
  reason: text("reason").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
