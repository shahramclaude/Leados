// src/db/schema.ts
//
// Part 41 — adaptive interface persistence. Tables back the expertise/style
// profile, raw interaction events (so the model can be recomputed and
// audited), the attention profile, and two audit trails: adaptation
// decisions (with rationale + counterfactual) and manipulation-guard
// verdicts. Nothing here stores or filters domain facts — this schema is
// presentation-adaptation state only.

import {
  pgTable,
  serial,
  text,
  boolean,
  jsonb,
  timestamp,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CognitiveStyleProfile } from "@/lib/humanNeeds";

export const adaptationUserProfiles = pgTable(
  "adaptation_user_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    declaredStyle: jsonb("declared_style").$type<CognitiveStyleProfile | null>().default(null),
    densityModeOverride: text("density_mode_override").$type<"guided" | "standard" | "dense" | null>().default(null),
    adaptationPaused: boolean("adaptation_paused").notNull().default(false),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    onboardingSkipped: boolean("onboarding_skipped").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("adaptation_user_profiles_user_id_idx").on(table.userId)],
);

export const adaptationInteractionEvents = pgTable("adaptation_interaction_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  domain: text("domain").$type<"finance" | "people" | "risk" | "tech">().notNull(),
  eventType: text("event_type").notNull(),
  magnitude: real("magnitude").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adaptationAttentionProfiles = pgTable(
  "adaptation_attention_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    interruptThresholds: jsonb("interrupt_thresholds").$type<Record<string, number>>().notNull(),
    digestTiming: text("digest_timing").notNull().default("daily-08:00"),
    questionOrder: jsonb("question_order").$type<string[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("adaptation_attention_profiles_user_id_idx").on(table.userId)],
);

export const adaptationLogs = pgTable("adaptation_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  surface: text("surface").notNull(),
  actionId: text("action_id").notNull(),
  actionClass: text("action_class").$type<"presentation" | "emphasis" | "sequence">().notNull(),
  description: text("description").notNull(),
  rationale: text("rationale"),
  counterfactual: text("counterfactual"),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manipulationGuardLogs = pgTable("manipulation_guard_logs", {
  id: serial("id").primaryKey(),
  actionId: text("action_id").notNull(),
  blocked: boolean("blocked").notNull(),
  pattern: text("pattern"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cognitiveQuestionnaireResponses = pgTable(
  "cognitive_questionnaire_responses",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    detailVsSummary: real("detail_vs_summary").notNull(),
    visualVsTabular: real("visual_vs_tabular").notNull(),
    deliberativeVsQuick: real("deliberative_vs_quick").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("cognitive_questionnaire_responses_user_id_idx").on(table.userId)],
);
