import {
  pgTable,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
  boolean,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 36 — Sustainability Intelligence (ESG / Carbon) schema
//
// Conventions reused from earlier parts (re-implemented locally in this
// sandbox because Parts 01/04/08/29 are not present as separate modules
// here — see AI-SESSION-LOG.md for the honesty note on this):
//  - Part 01 substrate convention -> Explain<T> evidence envelope (src/lib/evidence.ts)
//  - Part 08 finance DAG convention -> generic calc DAG (src/lib/financeDag.ts)
//  - Part 29 obligation tracker convention -> esgObligations table + lib/obligationTracker.ts
//  - Part 34 lineage convention -> manifest builder (src/lib/lineage.ts)
// ---------------------------------------------------------------------------

export const esgScopeEnum = pgEnum("esg_scope", ["scope1", "scope2", "scope3"]);

export const esgMethodEnum = pgEnum("esg_method", [
  "measured",
  "activity-based",
  "spend-based",
  "derived",
  "assumed",
]);

export const esgEvidenceClassEnum = pgEnum("esg_evidence_class", [
  "metered-measured",
  "activity-based-estimate",
  "spend-based-estimate",
  "derived-aggregate",
  "aggregated-hr-derived",
  "governance-log-derived",
  "assumed-placeholder",
]);

// --- Carbon: factor library (versioned, sourced) ---------------------------
export const emissionFactors = pgTable("esg_emission_factors", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  supersedes: text("supersedes"),
  scope: esgScopeEnum("scope").notNull(),
  category: text("category").notNull(),
  region: text("region").notNull(),
  unit: text("unit").notNull(),
  gridMethod: text("grid_method"), // "location-based" | "market-based" | null
  factorValue: numeric("factor_value", { precision: 18, scale: 8 }).notNull(), // kgCO2e per unit
  method: esgMethodEnum("method").notNull(), // activity-based | spend-based
  evidenceClass: esgEvidenceClassEnum("evidence_class").notNull(),
  uncertaintyPct: numeric("uncertainty_pct", { precision: 6, scale: 4 }).notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Carbon: activity data --------------------------------------------------
export const activities = pgTable("esg_activities", {
  id: text("id").primaryKey(),
  scope: esgScopeEnum("scope").notNull(),
  category: text("category").notNull(),
  region: text("region").notNull(),
  period: text("period").notNull(), // e.g. "2025-Q1"
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  method: esgMethodEnum("method").notNull(),
  spendAmountUsd: numeric("spend_amount_usd", { precision: 18, scale: 2 }),
  financeLedgerRef: text("finance_ledger_ref"),
  factorId: text("factor_id")
    .notNull()
    .references(() => emissionFactors.id),
  gridMethod: text("grid_method"),
  sourceDescription: text("source_description").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

// --- Finance ledger mirror (stand-in for Part 08 finance DAG outputs) ------
export const financeLedgerEntries = pgTable("esg_finance_ledger_entries", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  category: text("category").notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
  description: text("description").notNull(),
});

// --- Environmental raw metrics (energy, waste) ------------------------------
export const environmentalMetrics = pgTable("esg_environmental_metrics", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  metric: text("metric").notNull(), // energy_consumption_kwh | waste_generated_kg | waste_diverted_kg
  value: numeric("value", { precision: 16, scale: 3 }).notNull(),
  unit: text("unit").notNull(),
  method: esgMethodEnum("method").notNull(),
  evidenceClass: esgEvidenceClassEnum("evidence_class").notNull(),
  source: text("source").notNull(),
});

// --- Social: aggregate-only people metrics (k-anonymity enforced) ---------
export const peopleAggregates = pgTable("esg_people_aggregates", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  metric: text("metric").notNull(), // safety_incident_rate | training_hours_per_fte | pay_equity_ratio
  cohort: text("cohort").notNull(),
  cohortSize: integer("cohort_size").notNull(),
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  evidenceClass: esgEvidenceClassEnum("evidence_class").notNull(),
  kAnonymityThreshold: integer("k_anonymity_threshold").notNull().default(5),
});

// --- Governance: board / decision metrics ----------------------------------
export const governanceDecisions = pgTable("esg_governance_decisions", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  decisionTitle: text("decision_title").notNull(),
  reviewedByBoard: boolean("reviewed_by_board").notNull(),
  hasDocumentedRationale: boolean("has_documented_rationale").notNull(),
  withinSlaDays: boolean("within_sla_days").notNull(),
  cadenceDays: integer("cadence_days"),
  decidedAt: date("decided_at").notNull(),
});

// --- Targets / OKRs (Part 07 stand-in) -------------------------------------
export const targets = pgTable("esg_targets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  scope: esgScopeEnum("scope"),
  category: text("category"),
  baselineYear: integer("baseline_year").notNull(),
  baselineValueTco2e: numeric("baseline_value_tco2e", { precision: 14, scale: 3 }).notNull(),
  targetYear: integer("target_year").notNull(),
  targetValueTco2e: numeric("target_value_tco2e", { precision: 14, scale: 3 }).notNull(),
  pathway: text("pathway").notNull(), // linear | geometric
  okrRef: text("okr_ref"),
});

// --- Reduction portfolio / MACC (Part 07 portfolio link) -------------------
export const abatementInitiatives = pgTable("esg_abatement_initiatives", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  scope: esgScopeEnum("scope").notNull(),
  category: text("category").notNull(),
  annualAbatementTco2e: numeric("annual_abatement_tco2e", { precision: 14, scale: 3 }).notNull(),
  annualNetCostUsd: numeric("annual_net_cost_usd", { precision: 14, scale: 2 }).notNull(),
  implementationStatus: text("implementation_status").notNull(),
  portfolioRef: text("portfolio_ref"),
  evidenceClass: esgEvidenceClassEnum("evidence_class").notNull(),
});

// --- Disclosure engine -------------------------------------------------------
export const disclosurePacks = pgTable("esg_disclosure_packs", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  standard: text("standard").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  figures: jsonb("figures").notNull(),
  lineageManifest: jsonb("lineage_manifest").notNull(),
  gaps: jsonb("gaps").notNull(),
  manifestHash: text("manifest_hash").notNull(),
});

// --- Obligation tracker (Part 29 stand-in) ----------------------------------
export const obligations = pgTable("esg_obligations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  standard: text("standard").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull(), // open | in-progress | satisfied | overdue
  linkedPackId: text("linked_pack_id"),
});
