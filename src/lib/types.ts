// src/lib/types.ts
//
// PROVENANCE NOTE: no central types.ts existed in this repo prior to Part
// 5 (Parts 1-4 were not present in this sandbox). This file defines, from
// scratch, the shared types needed by the Financial Nervous System
// (src/lib/financialOS.ts, the /api/financial* routes, and
// src/views/FinancialView.tsx). It is written to be additive so later
// parts can extend it without breaking these definitions.

// ---------------------------------------------------------------------------
// Generic persistence-adjacent shapes
// ---------------------------------------------------------------------------

export interface MetricDefRecord {
  key: string;
  label: string;
  unit: string;
  category: string;
}

export interface MetricValueRecord {
  metricKey: string;
  value: number;
  recordedAt: string; // ISO timestamp
}

export interface MetricSnapshot {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  recordedAt: string | null;
}

export interface FinancialEvent {
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string; // ISO timestamp
}

export type DecisionLevel = "board" | "exec" | "team";

export interface Decision {
  id: number;
  title: string;
  level: DecisionLevel;
  cycleTimeDays: number;
  decidedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Monte Carlo runway simulation
// ---------------------------------------------------------------------------

export interface MonteCarloMonthPoint {
  month: number;
  cash: number;
  burn: number;
  revenue: number;
}

export interface MonteCarloPath {
  pathId: number;
  monthly: MonteCarloMonthPoint[];
  runwayMonth: number;
}

export interface RunwayHistogramBucket {
  bucket: number; // bucket index, 0-23
  count: number;
  pct: number; // 0-100
}

export interface RunwayDistribution {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  mean: number;
  probabilityCritical: number; // fraction of paths with runway < 6 months
  probabilityComfortable: number; // fraction of paths with runway > 18 months
  histogram: RunwayHistogramBucket[]; // 24 buckets, 2 months each (0-48mo)
  topPaths: MonteCarloPath[]; // representative p10/p25/p50/p75/p90 paths
  seed: number;
}

export interface RunwayInputs {
  cashBalance: number;
  burnRate: number;
  revenue: number;
  /** Monthly drift applied to burn rate. DESIGN PARAMETER default below. */
  burnGrowth?: number;
  /** Monthly stddev of burn-rate noise. DESIGN PARAMETER default below. */
  burnVolatility?: number;
  /** Monthly drift applied to revenue. DESIGN PARAMETER default below. */
  revenueGrowth?: number;
  /** Monthly stddev of revenue noise. DESIGN PARAMETER default below. */
  revenueVolatility?: number;
  /** Number of simulated paths. Default 5000. */
  paths?: number;
  /** Simulation horizon in months. Default 60. */
  maxMonths?: number;
  /** String hashed via hashSeed() for reproducibility. */
  seedKey?: string;
}

// ---------------------------------------------------------------------------
// Unit economics
// ---------------------------------------------------------------------------

export type UnitEconomicsHealth = "strong" | "adequate" | "weak" | "unknown";

export interface UnitEconomics {
  cac: number | null;
  ltv: number | null;
  ltvCacRatio: number | null;
  paybackMonths: number | null;
  grossMargin: number | null;
  netRevenueRetention: number | null;
  arpu: number | null;
  burnMultiple: number | null;
  ruleOf40Score: number | null;
  unitEconomicsHealth: UnitEconomicsHealth;
}

// ---------------------------------------------------------------------------
// Fundraising readiness
// ---------------------------------------------------------------------------

export type RaiseTiming =
  | "raise_now"
  | "raise_in_3_months"
  | "raise_in_6_months"
  | "not_ready"
  | "no_need";

export interface FundraisingReadiness {
  readinessScore: number; // 0-100
  raiseNowOrWait: RaiseTiming;
  strengthSignals: string[]; // max 4
  weaknessSignals: string[]; // max 4
  optimalRaiseWindowMonths: number;
  diligenceRisks: string[];
}

// ---------------------------------------------------------------------------
// Aggregate report
// ---------------------------------------------------------------------------

export interface FinancialIntelligenceReport {
  runway: RunwayDistribution;
  unitEconomics: UnitEconomics;
  fundraisingReadiness: FundraisingReadiness;
  financialRiskPosterior: number;
  financialHealthScore: number;
  latestMetrics: Record<string, MetricSnapshot>;
  generatedAt: string;
}
