// Part 51 — Recommendation / Intervention Marketplace schema.
//
// Depends conceptually on:
//   Part 04 (conjugate Bayesian updates)   -> see src/lib/effects/estimators.ts
//   Part 05 (effect estimators)            -> see src/lib/effects/estimators.ts
//   Part 12 (playbook library + memory)    -> see src/lib/playbooks/index.ts
//   Part 30 (experiments)                  -> see src/lib/experiments/index.ts
//   Part 39 (fitness engine)               -> see src/lib/fitness/index.ts
//   Part 33 (router)                       -> see src/lib/router/context.ts
//   Part 48 (commitments / follow-through) -> see src/lib/commitments/index.ts
//
// None of those modules existed in this repository snapshot, so Part 51 ships
// narrow, explicitly-labelled stand-in implementations of each contract under
// src/lib/<area>/index.ts. They are intentionally small and swappable: when the
// real Part 12/30/39/33/48/04/05 modules land, only the stand-in files need to
// be replaced — the schema and ranking/explainability engine below do not
// assume anything beyond the documented interfaces.

import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Catalog of interventions ("plays") available to the recommender. */
export const recInterventions = pgTable("rec_interventions", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  playbookId: text("playbook_id").notNull(),
  description: text("description").notNull(),
  /** Array of partial context matchers, e.g. [{ stage: ["growth","scale"] }] */
  applicableContexts: jsonb("applicable_contexts").notNull(),
  /** Array of hard preconditions; violating any => contextFit = 0 */
  preconditions: jsonb("preconditions").notNull(),
  costUnit: text("cost_unit").notNull(),
  costAmount: numeric("cost_amount", { mode: "number" }).notNull(),
  reversibility: text("reversibility").notNull(), // easy | moderate | hard
  effort: text("effort").notNull(), // low | medium | high
  priorEvidenceClass: text("prior_evidence_class").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The context -> effect marketplace table. One row per (intervention, canonical
 * context signature). Updated only by verified outcomes (commitments /
 * experiments) — never by raw engagement. Beta-Bernoulli conjugate posterior
 * (Part 04 style) represented as (alpha, beta).
 */
export const recContextEffects = pgTable(
  "rec_context_effects",
  {
    id: text("id").primaryKey(),
    interventionId: text("intervention_id")
      .notNull()
      .references(() => recInterventions.id, { onDelete: "cascade" }),
    contextKey: text("context_key").notNull(),
    alpha: numeric("alpha", { mode: "number" }).notNull().default(1),
    beta: numeric("beta", { mode: "number" }).notNull().default(1),
    sampleSize: integer("sample_size").notNull().default(0),
    evidenceClass: text("evidence_class").notNull().default("anecdotal"),
    sourceType: text("source_type").notNull().default("prior"),
    halfLifeDays: integer("half_life_days").notNull().default(30),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rec_context_effects_intervention_context_uq").on(t.interventionId, t.contextKey)],
);

/** Every rendered recommendation, logged for audit + eval + impact history. */
export const recRecommendations = pgTable("rec_recommendations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  interventionId: text("intervention_id")
    .notNull()
    .references(() => recInterventions.id, { onDelete: "cascade" }),
  contextKey: text("context_key").notNull(),
  contextSnapshot: jsonb("context_snapshot").notNull(),
  score: numeric("score", { mode: "number" }).notNull(),
  scoreBreakdown: jsonb("score_breakdown").notNull(),
  rank: integer("rank").notNull(),
  isSerendipity: boolean("is_serendipity").notNull().default(false),
  explainability: jsonb("explainability").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | expired
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Engagement log: accept/reject + reason. Deliberately NEVER read by the
 * ranking/belief-update code paths — see src/lib/recommender/antiManipulation.ts.
 */
export const recFeedback = pgTable("rec_feedback", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id")
    .notNull()
    .references(() => recRecommendations.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  action: text("action").notNull(), // accept | reject
  reason: text("reason").notNull(),
  reasonDetail: text("reason_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Verified outcomes. Only rows here (sourced from measured commitment
 * follow-through or experiment results) are allowed to update
 * rec_context_effects beliefs.
 */
export const recOutcomes = pgTable("rec_outcomes", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id").references(() => recRecommendations.id, {
    onDelete: "set null",
  }),
  interventionId: text("intervention_id")
    .notNull()
    .references(() => recInterventions.id, { onDelete: "cascade" }),
  contextKey: text("context_key").notNull(),
  source: text("source").notNull(), // commitment_followthrough | experiment_result | self_report
  commitmentId: text("commitment_id"),
  experimentId: text("experiment_id"),
  success: boolean("success").notNull(),
  magnitude: numeric("magnitude", { mode: "number" }).notNull().default(1),
  verified: boolean("verified").notNull().default(false),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit trail of every belief update (including decay) — the impact history. */
export const recBeliefLog = pgTable("rec_belief_log", {
  id: text("id").primaryKey(),
  interventionId: text("intervention_id")
    .notNull()
    .references(() => recInterventions.id, { onDelete: "cascade" }),
  contextKey: text("context_key").notNull(),
  beforeAlpha: numeric("before_alpha", { mode: "number" }).notNull(),
  beforeBeta: numeric("before_beta", { mode: "number" }).notNull(),
  afterAlpha: numeric("after_alpha", { mode: "number" }).notNull(),
  afterBeta: numeric("after_beta", { mode: "number" }).notNull(),
  evidenceClassBefore: text("evidence_class_before").notNull(),
  evidenceClassAfter: text("evidence_class_after").notNull(),
  reason: text("reason").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
