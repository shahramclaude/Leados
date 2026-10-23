// LEADOS — Part 50: Industry Intelligence, Contagion & Benchmarking
//
// Prior-part dependency note (read before write, honestly disclosed):
// This sandbox snapshot of the repo does NOT contain Part 27 (market intel /
// evidence classes), Part 31 (ecosystem graph), Part 24 (scenario/war-game
// engine), Part 06 (digital twin), Part 13 (sensing), Part 34 (connectors) or
// Part 47 (crisis elevation) source. Only the base Next.js + Drizzle starter
// template existed (src/app/*, src/db/index.ts, this file as an empty
// placeholder). We could not "read" files that are not in the repo.
//
// To honor the standing order without inventing facts about code that isn't
// here, every seam to a prior part is implemented as an explicit, clearly
// labeled adapter module under `src/lib/seams/*-part-NN-*.ts`. Each adapter:
//   1. documents the interface we assume the real Part NN module exposes,
//   2. ships a minimal, honestly-labeled local reference implementation so
//      Part 50 is fully functional today,
//   3. is the single place to swap in the real Part NN module later.
//
// All tables below are additive (no existing tables to touch).

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/** Evidence classification — mirrors Part 27's evidence-class rules (seam). */
export const evidenceClassEnum = pgEnum("evidence_class", [
  "verified_primary", // audited / regulatory filing / first-party confirmed
  "licensed_dataset", // paid/licensed external data feed
  "reported_secondary", // credible news/registry report, not independently verified
  "model_estimate", // derived/simulated by LEADOS models (e.g. contagion output)
  "unverified_signal", // scraped / low-reliability / single-source chatter
  "internal_telemetry", // LEADOS' own product/org data, not "industry" evidence
]);

export const tierEnum = pgEnum("value_chain_tier", ["self", "tier1", "tier2", "tier3"]);

export const roleEnum = pgEnum("value_chain_role", ["supplier", "customer", "self", "partner"]);

export const scenarioTypeEnum = pgEnum("contagion_scenario_type", [
  "supplier_failure",
  "demand_shock",
  "regulatory_shock",
]);

export const signalSeverityEnum = pgEnum("signal_severity", ["low", "moderate", "high", "critical"]);

// ---------------------------------------------------------------------------
// Industry structure
// ---------------------------------------------------------------------------

export const industrySegments = pgTable("industry_segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  naicsCode: text("naics_code"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Market-structure snapshots: HHI, entry/exit flow, price/capacity cycle. */
export const industryMetricSnapshots = pgTable(
  "industry_metric_snapshots",
  {
    id: serial("id").primaryKey(),
    segmentId: integer("segment_id")
      .notNull()
      .references(() => industrySegments.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // e.g. "2026-Q1"
    hhi: real("hhi").notNull(),
    hhiBand: text("hhi_band").notNull(), // "unconcentrated" | "moderate" | "concentrated"
    firmCount: integer("firm_count").notNull(),
    entrants: integer("entrants").notNull(),
    exits: integer("exits").notNull(),
    netEntryRate: real("net_entry_rate").notNull(),
    capacityUtilization: real("capacity_utilization"), // 0..1, nullable (external data may be absent)
    priceIndex: real("price_index"), // base-100 index, nullable
    cyclePhase: text("cycle_phase"), // "expansion" | "peak" | "contraction" | "trough" | null (insufficient data)
    cycleConfidence: real("cycle_confidence"), // 0..1 heuristic confidence
    evidenceClass: evidenceClassEnum("evidence_class").notNull().default("model_estimate"),
    sourceRef: text("source_ref"), // connector/source id (Part 34 seam)
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    segmentPeriodIdx: uniqueIndex("industry_metric_segment_period_idx").on(t.segmentId, t.period),
  }),
);

// ---------------------------------------------------------------------------
// Extended value chain (Part 31's ecosystem graph, extended to tier-2/3)
// ---------------------------------------------------------------------------

export const valueChainNodes = pgTable(
  "value_chain_nodes",
  {
    id: serial("id").primaryKey(),
    segmentId: integer("segment_id").references(() => industrySegments.id, { onDelete: "set null" }),
    externalOrgId: text("external_org_id"), // id in Part 31's ecosystem graph, when known
    name: text("name").notNull(),
    tier: tierEnum("tier").notNull(),
    role: roleEnum("role").notNull(),
    revenueWeight: real("revenue_weight").notNull().default(1), // relative importance for exposure scoring
    dataConfidence: real("data_confidence").notNull().default(1), // 0..1, 1 = directly observed
    isGapFilled: boolean("is_gap_filled").notNull().default(false), // true = inferred/placeholder, not evidenced
    evidenceClass: evidenceClassEnum("evidence_class").notNull().default("reported_secondary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    segmentIdx: index("value_chain_nodes_segment_idx").on(t.segmentId),
  }),
);

export const valueChainEdges = pgTable(
  "value_chain_edges",
  {
    id: serial("id").primaryKey(),
    fromNodeId: integer("from_node_id")
      .notNull()
      .references(() => valueChainNodes.id, { onDelete: "cascade" }),
    toNodeId: integer("to_node_id")
      .notNull()
      .references(() => valueChainNodes.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(), // "supplies" | "buys_from" | "partners_with"
    dependencyWeight: real("dependency_weight").notNull().default(0.3), // 0..1 baseline failure-propagation weight
    correlatedShockGroup: text("correlated_shock_group"), // e.g. shared jurisdiction/region/vendor
    evidenceClass: evidenceClassEnum("evidence_class").notNull().default("reported_secondary"),
    isGapFilled: boolean("is_gap_filled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fromIdx: index("value_chain_edges_from_idx").on(t.fromNodeId),
    toIdx: index("value_chain_edges_to_idx").on(t.toNodeId),
  }),
);

// ---------------------------------------------------------------------------
// Contagion simulation
// ---------------------------------------------------------------------------

export const contagionScenarios = pgTable("contagion_scenarios", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").references(() => industrySegments.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: scenarioTypeEnum("type").notNull(),
  description: text("description").notNull(),
  seedNodeIds: jsonb("seed_node_ids").notNull().$type<number[]>(),
  defaultParams: jsonb("default_params")
    .notNull()
    .$type<{ baseProbabilityMultiplier: number; correlatedShockFactor: number; trials: number }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contagionRuns = pgTable("contagion_runs", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id")
    .notNull()
    .references(() => contagionScenarios.id, { onDelete: "cascade" }),
  seed: integer("seed").notNull(),
  params: jsonb("params")
    .notNull()
    .$type<{ baseProbabilityMultiplier: number; correlatedShockFactor: number; trials: number }>(),
  systemicExposureScore: real("systemic_exposure_score").notNull(), // mean fraction of network affected
  intervalLow: real("interval_low").notNull(), // p10 across trials
  intervalHigh: real("interval_high").notNull(), // p90 across trials
  sensitivity: jsonb("sensitivity").notNull().$type<
    Array<{ parameter: string; delta: number; exposureDelta: number }>
  >(),
  affectedNodeFrequency: jsonb("affected_node_frequency").notNull().$type<Record<string, number>>(),
  twinValidated: boolean("twin_validated").notNull().default(false), // Part 06 seam flag
  ensembleReconciled: boolean("ensemble_reconciled").notNull().default(false), // Part 24 seam flag
  evidenceClass: evidenceClassEnum("evidence_class").notNull().default("model_estimate"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// External sources, signals & crisis elevation
// ---------------------------------------------------------------------------

/** Source reliability registry — Part 27 seam. */
export const externalSources = pgTable("external_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(), // "news" | "registry" | "licensed_dataset" | "regulator"
  reliabilityScore: real("reliability_score").notNull(), // 0..1
  reliabilityClass: text("reliability_class").notNull(), // "tier1_verified" | "tier2_reported" | "tier3_unverified"
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const externalSignals = pgTable(
  "external_signals",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => externalSources.id, { onDelete: "cascade" }),
    segmentId: integer("segment_id").references(() => industrySegments.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    signalType: text("signal_type").notNull(), // "bankruptcy" | "regulatory_action" | "demand_shift" | ...
    severity: signalSeverityEnum("severity").notNull(),
    evidenceClass: evidenceClassEnum("evidence_class").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    escalated: boolean("escalated").notNull().default(false),
    escalationRef: integer("escalation_ref"),
  },
  (t) => ({
    segmentIdx: index("external_signals_segment_idx").on(t.segmentId),
  }),
);

/** Crisis elevation seam — Part 47. */
export const crisisElevations = pgTable("crisis_elevations", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id")
    .notNull()
    .references(() => externalSignals.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  thresholdBreached: text("threshold_breached").notNull(),
  elevatedAt: timestamp("elevated_at", { withTimezone: true }).defaultNow().notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Benchmarking
// ---------------------------------------------------------------------------

export const orgProfiles = pgTable("org_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  segmentId: integer("segment_id").references(() => industrySegments.id, { onDelete: "set null" }),
  isSelf: boolean("is_self").notNull().default(false), // true = the LEADOS subject org
  revenueUsd: numeric("revenue_usd", { precision: 18, scale: 2 }),
  headcount: integer("headcount"),
  growthRateYoy: real("growth_rate_yoy"), // fraction, e.g. 0.12
  grossMarginPct: real("gross_margin_pct"),
  evidenceClass: evidenceClassEnum("evidence_class").notNull().default("reported_secondary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const peerGroups = pgTable("peer_groups", {
  id: serial("id").primaryKey(),
  targetOrgId: integer("target_org_id")
    .notNull()
    .references(() => orgProfiles.id, { onDelete: "cascade" }),
  method: text("method").notNull(), // e.g. "k_nearest_zscore"
  featureWeights: jsonb("feature_weights").notNull().$type<Record<string, number>>(),
  k: integer("k").notNull(),
  peerOrgIds: jsonb("peer_org_ids").notNull().$type<number[]>(),
  rationale: text("rationale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const benchmarkMetrics = pgTable("benchmark_metrics", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => orgProfiles.id, { onDelete: "cascade" }),
  peerGroupId: integer("peer_group_id")
    .notNull()
    .references(() => peerGroups.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(),
  orgValue: real("org_value").notNull(),
  percentile: real("percentile"), // null when sample too small to be honest
  sampleSize: integer("sample_size").notNull(),
  methodBadge: text("method_badge").notNull(), // short label shown in UI
  lowSample: boolean("low_sample").notNull().default(false),
  evidenceClass: evidenceClassEnum("evidence_class").notNull().default("model_estimate"),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});
