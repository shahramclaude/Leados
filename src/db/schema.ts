// LEADOS — Part 42: Conversational layer & Meeting Copilot
//
// This schema also re-establishes minimal versions of entities referenced by
// earlier parts that this sandbox does not have on disk (Part 23 decisions,
// Part 10 tasks, Part 32 grounding/evidence corpus). They are intentionally
// narrow — just enough surface area for Part 42's dialogue engine and
// meeting pipeline to commit real rows instead of mocking persistence.
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Grounding corpus (stand-in for Part 11/32's evidence store).
// ---------------------------------------------------------------------------
export const evidenceDocuments = pgTable("evidence_documents", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  source: text("source").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metricTags: jsonb("metric_tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Ask-LEADOS conversational layer.
// ---------------------------------------------------------------------------
export const conversations = pgTable("conversations", {
  id: id(),
  title: text("title").notNull().default("New conversation"),
  userId: text("user_id").notNull().default("demo-user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationTurns = pgTable("conversation_turns", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  turnIndex: integer("turn_index").notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  intent: text("intent")
    .$type<"query" | "compare" | "explain" | "simulate" | "draft" | "act" | null>()
    .default(null),
  text: text("text").notNull(),
  activeContext: jsonb("active_context")
    .$type<{ timeframe?: string; scope?: string; metric?: string }>()
    .notNull()
    .default({}),
  resolvedEntities: jsonb("resolved_entities").$type<Record<string, string>>().notNull().default({}),
  citations: jsonb("citations")
    .$type<{ evidenceId: string; title: string; snippet: string }[]>()
    .notNull()
    .default([]),
  abstained: boolean("abstained").notNull().default(false),
  abstentionReason: text("abstention_reason"),
  contradiction: jsonb("contradiction")
    .$type<{ priorTurnId: string; priorClaim: string; resolution: string } | null>()
    .default(null),
  actionGate: jsonb("action_gate")
    .$type<{ tier: "T1" | "T2" | "T3"; status: "drafted" | "blocked_needs_confirmation" } | null>()
    .default(null),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Meeting copilot.
// ---------------------------------------------------------------------------
export const meetings = pgTable("meetings", {
  id: id(),
  title: text("title").notNull(),
  orgId: text("org_id").notNull().default("default"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").$type<"pre" | "live" | "post">().notNull().default("pre"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingParticipants = pgTable("meeting_participants", {
  id: id(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("participant"),
  isOrganizer: boolean("is_organizer").notNull().default(false),
  consentStatus: text("consent_status")
    .$type<"pending" | "opted_in" | "opted_out">()
    .notNull()
    .default("pending"),
  consentUpdatedAt: timestamp("consent_updated_at", { withTimezone: true }),
});

export const meetingAgendaItems = pgTable("meeting_agenda_items", {
  id: id(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
  orderIndex: integer("order_index").notNull().default(0),
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: id(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  speakerParticipantId: text("speaker_participant_id"),
  speakerName: text("speaker_name").notNull(),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  text: text("text").notNull(),
  consentAtCapture: text("consent_at_capture")
    .$type<"pending" | "opted_in" | "opted_out">()
    .notNull(),
  redacted: boolean("redacted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingArtifacts = pgTable("meeting_artifacts", {
  id: id(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  type: text("type")
    .$type<"summary" | "decision_draft" | "action_draft" | "open_question">()
    .notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  citations: jsonb("citations").$type<string[]>().notNull().default([]),
  status: text("status")
    .$type<"drafted" | "confirmed" | "edited" | "rejected">()
    .notNull()
    .default("drafted"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Committed entities (stand-ins for Part 23 decisions / Part 10 tasks).
// ---------------------------------------------------------------------------
export const decisions = pgTable("decisions", {
  id: id(),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
  sourceArtifactId: text("source_artifact_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("confirmed"),
  confirmedBy: text("confirmed_by").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: id(),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
  sourceArtifactId: text("source_artifact_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull().default("open"),
  policyTier: text("policy_tier").$type<"T1" | "T2" | "T3">().notNull().default("T1"),
  confirmedBy: text("confirmed_by").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
