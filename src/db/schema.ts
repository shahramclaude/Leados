// src/db/schema.ts
//
// Drizzle schema for the LEADOS people-analytics domain (Part 09).
//
// Tables are intentionally narrow: production (DB-backed) storage covers
// what the API routes/UI need to persist across requests. The fairness test
// suite, optimizer tests, and property tests operate on pure in-memory data
// (see src/lib/people/seedOrg.ts) and do not touch these tables at all.

import { boolean, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  teamId: text("team_id").notNull(),
  managerId: text("manager_id"),
  active: boolean("active").notNull().default(true),
});

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  requires: jsonb("requires").$type<string[]>().notNull().default([]),
  specializes: jsonb("specializes").$type<string[]>().notNull().default([]),
  equivalent: jsonb("equivalent").$type<string[]>().notNull().default([]),
  levelAnchors: jsonb("level_anchors").$type<Record<number, string>>().notNull(),
});

export const personSkillEvidence = pgTable("person_skill_evidence", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  skillId: text("skill_id").notNull(),
  source: text("source").notNull(), // claimed | endorsed | demonstrated-by-work-evidence
  level: integer("level").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  evidenceRef: text("evidence_ref"),
  recordedBy: text("recorded_by"),
  supersededBy: text("superseded_by"),
  invalidated: boolean("invalidated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  coreSkills: jsonb("core_skills").$type<Record<string, number>>().notNull(),
  complementarySkills: jsonb("complementary_skills").$type<Record<string, number>>().notNull(),
  adjacencyRoles: jsonb("adjacency_roles").$type<string[]>().notNull().default([]),
});

export const compensationBands = pgTable("compensation_bands", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  level: integer("level").notNull(),
  min: integer("min").notNull(),
  mid: integer("mid").notNull(),
  max: integer("max").notNull(),
  currency: text("currency").notNull().default("USD"),
});

export const employeeCompensation = pgTable("employee_compensation", {
  employeeId: text("employee_id").primaryKey(),
  bandId: text("band_id").notNull(),
  currentPay: integer("current_pay").notNull(),
});

export const workloadSnapshots = pgTable("workload_snapshots", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  date: text("date").notNull(), // ISO date, one row per person per day
  wip: integer("wip").notNull(),
  contextSwitches: integer("context_switches").notNull(),
  meetingHours: real("meeting_hours").notNull(),
  source: text("source").notNull().default("twin-proxy"),
});

/** Append-only. Rows are never updated or deleted — corrections are new rows. Part 01 proxy table. */
export const peopleEvents = pgTable("people_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  subjectId: text("subject_id").notNull(),
  actorId: text("actor_id").notNull(),
  purpose: text("purpose").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const corrections = pgTable("corrections", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  surface: text("surface").notNull(), // which people-surface the correction concerns, e.g. "skills-matrix"
  claim: text("claim").notNull(), // the person's description of what's wrong
  evidenceRef: text("evidence_ref"),
  targetEvidenceId: text("target_evidence_id"),
  status: text("status").notNull().default("open"), // open | accepted | rejected
  resolverId: text("resolver_id"),
  resolutionNote: text("resolution_note"),
  filedEventId: text("filed_event_id").notNull(),
  resolvedEventId: text("resolved_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const teamComposerFeedback = pgTable("team_composer_feedback", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  proposalId: text("proposal_id").notNull(),
  rejectedBy: text("rejected_by").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workingStyleDeclarations = pgTable("working_style_declarations", {
  personId: text("person_id").primaryKey(),
  style: text("style").notNull(),
  declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
});

export const humanNeedsDeclarations = pgTable("human_needs_declarations", {
  personId: text("person_id").primaryKey(),
  capacityPreference: text("capacity_preference").notNull().default("standard"),
  daysSinceLastBreak: integer("days_since_last_break").notNull().default(0),
  openToStretch: boolean("open_to_stretch").notNull().default(true),
});
