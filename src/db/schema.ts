// LEADOS — Part 39: Organizational Fitness Function & Evolution Engine
//
// This schema stores:
//  - versioned weight policies for the transparent fitness function
//  - raw metric samples (the evidence behind every dimension score)
//  - computed fitness snapshots (full decomposition + sensitivity, never just a number)
//  - Goodhart-pair anomaly alerts (gaming-resistance)
//  - evolution loops (hypothesis -> twin prediction -> human T3 decision -> intervention -> outcome -> belief update)
//  - the legacy health-score catalog being consolidated/deprecated into this model (Phase 0 audit)

import {
  pgTable,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  boolean,
  serial,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Weight policy: THE org-configurable, versioned, rationale-carrying weighting
// of the fitness function. Never a hidden constant.
// ---------------------------------------------------------------------------
export const fitnessWeightPolicies = pgTable("fitness_weight_policies", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  rationale: text("rationale").notNull(),
  // { [dimensionId]: { weight: number, rationale: string } }
  weights: jsonb("weights").notNull(),
  status: text("status").notNull().default("draft"), // draft | active | archived
  createdBy: text("created_by").notNull().default("org-admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Raw metric samples — the evidence layer underneath every dimension score.
// Metric *definitions* (dimension, direction, bounds, evidence class, Goodhart
// risk, counter-metric pairing) live in code (src/lib/fitness/dimensions.ts)
// because they are policy-reviewed constants, not org data — but every value
// plugged into the function comes from this table.
// ---------------------------------------------------------------------------
export const fitnessMetricSamples = pgTable(
  "fitness_metric_samples",
  {
    id: serial("id").primaryKey(),
    metricId: text("metric_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    source: text("source").notNull().default("manual"), // manual | integration | derived
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fitness_metric_samples_metric_period_idx").on(t.metricId, t.periodEnd)],
);

// ---------------------------------------------------------------------------
// Computed fitness snapshots — the single number is NEVER stored without its
// full decomposition + sensitivity attached.
// ---------------------------------------------------------------------------
export const fitnessSnapshots = pgTable(
  "fitness_snapshots",
  {
    id: serial("id").primaryKey(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    policyId: integer("policy_id")
      .notNull()
      .references(() => fitnessWeightPolicies.id),
    fitness: numeric("fitness", { precision: 6, scale: 4 }).notNull(),
    decomposition: jsonb("decomposition").notNull(),
    sensitivity: jsonb("sensitivity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fitness_snapshots_period_idx").on(t.periodEnd)],
);

// ---------------------------------------------------------------------------
// Goodhart Watch — suspicious joint movement of a metric vs its paired
// counter-metric (gaming-resistance detector).
// ---------------------------------------------------------------------------
export const goodhartAlerts = pgTable("goodhart_alerts", {
  id: serial("id").primaryKey(),
  metricId: text("metric_id").notNull(),
  counterMetricId: text("counter_metric_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  metricDeltaPct: numeric("metric_delta_pct", { precision: 10, scale: 4 }).notNull(),
  counterDeltaPct: numeric("counter_delta_pct", { precision: 10, scale: 4 }).notNull(),
  severity: text("severity").notNull(), // info | watch | high
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Evolution loops — human-commanded, T3-gated organizational change loop.
// Stage machine lives in src/lib/fitness/evolutionLoop.ts
// ---------------------------------------------------------------------------
export const evolutionLoops = pgTable("evolution_loops", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dimensionId: text("dimension_id").notNull(),
  hypothesis: text("hypothesis").notNull(),
  // Stand-in link to Part 30's experiment registry (not physically present in
  // this sandbox instance) — kept as an opaque reference id.
  relatedExperimentId: text("related_experiment_id"),
  // Stand-in link to Part 06's organizational digital twin pre-test.
  twinPredictedDelta: numeric("twin_predicted_delta", { precision: 8, scale: 4 }),
  twinConfidence: numeric("twin_confidence", { precision: 5, scale: 4 }),
  stage: text("stage").notNull().default("hypothesis"),
  decisionTier: text("decision_tier").notNull().default("T3"),
  // Stand-in link to Part 23's decision ledger.
  decisionId: text("decision_id"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  // Stand-in link to Part 10's execution/orchestration engine.
  executionRef: text("execution_ref"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
  actualDelta: numeric("actual_delta", { precision: 8, scale: 4 }),
  counterfactualDelta: numeric("counterfactual_delta", { precision: 8, scale: 4 }),
  counterfactualNote: text("counterfactual_note"),
  beliefUpdateNote: text("belief_update_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Legacy health-score catalog (Phase 0 audit output) — consolidated/deprecated
// into the fitness model. Kept as data so the audit is visible in-product.
// ---------------------------------------------------------------------------
export const legacyHealthScores = pgTable("legacy_health_scores", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  formerLocation: text("former_location").notNull(),
  formulaSummary: text("formula_summary").notNull(),
  gamingNotes: text("gaming_notes").notNull(),
  actionabilityNotes: text("actionability_notes").notNull(),
  mappedDimensionId: text("mapped_dimension_id"),
  deprecated: boolean("deprecated").notNull().default(true),
  deprecatedNote: text("deprecated_note").notNull(),
});
