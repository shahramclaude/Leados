// ---------------------------------------------------------------------------
// Shared domain types for the Metrics Intelligence OS (Part 9).
// ---------------------------------------------------------------------------

export type Domain =
  | "pipeline"
  | "marketing"
  | "engagement"
  | "retention"
  | "revenue"
  | "ops";

export const DOMAINS: Domain[] = [
  "pipeline",
  "marketing",
  "engagement",
  "retention",
  "revenue",
  "ops",
];

export interface MetricDef {
  id: number;
  key: string;
  name: string;
  domain: Domain;
  unit: string;
  higherIsBetter: boolean;
  target: number | null;
  weight: number;
  description: string;
}

export interface MetricValue {
  id: number;
  metricKey: string;
  value: number;
  recordedAt: Date;
}

export interface LeadosEvent {
  id: number;
  type: string;
  metricKey: string | null;
  domain: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface MemoryNode {
  id: number;
  key: string;
  label: string;
  domain: string;
  linkedMetricKeys: string[];
  content: string;
  importance: number;
}

// --------------------------- Forecasting ----------------------------------

export type ForecastMethod =
  | "holt-winters"
  | "double-exponential"
  | "simple-exponential";

export interface ForecastPoint {
  /** ISO date string */
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Forecast {
  metricKey: string;
  method: ForecastMethod;
  generatedAt: string;
  horizonDays: number;
  points: ForecastPoint[];
  /** accuracy = clamp(100 - MAPE, 0, 100) computed on last 30d in-sample fit */
  accuracy: number;
  mape: number;
  parameters: Record<string, number>;
}

// --------------------------- Anomalies --------------------------------------

export type AnomalyType = "point" | "structural_break";

export interface Anomaly {
  metricKey: string;
  type: AnomalyType;
  detectedAt: string;
  value: number;
  expected: number;
  zScore: number | null;
  cusum: { sHigh: number; sLow: number; threshold: number } | null;
  description: string;
}

// --------------------------- Correlation ------------------------------------

export interface CorrelationPair {
  metricA: string;
  metricB: string;
  r: number;
  n: number;
}

export interface CorrelationMatrix {
  pairs: CorrelationPair[];
  significantPairs: CorrelationPair[];
  interpretation: string;
}

export type CausalConfidence = "tentative" | "moderate" | "strong";

export interface MetricCausalHypothesis {
  leadMetric: string;
  lagMetric: string;
  lagDays: number;
  correlationAtLag: number;
  confidence: CausalConfidence;
  interpretation: string;
}

// --------------------------- Health & scoring -------------------------------

export type MetricStatus = "healthy" | "warning" | "critical";
export type TrendDirection = "strong_up" | "up" | "flat" | "down" | "strong_down";

export interface MetricHealthFull {
  metricKey: string;
  currentValue: number;
  previousValue: number | null;
  target: number | null;
  vsTargetPct: number | null;
  status: MetricStatus;
  trend: TrendDirection;
  trendArrow: "↑" | "↗" | "→" | "↘" | "↓";
  slope: number;
  r2: number;
  recencyWeightedScore: number;
  lastUpdated: string;
  dataPoints: number;
}

export interface DomainMetricScore {
  domain: Domain;
  score: number;
  metricsAboveTarget: number;
  metricsBelowTarget: number;
  trend: "improving" | "stable" | "degrading";
  drivers: string[];
}

// --------------------------- Alerts -----------------------------------------

export type MetricAlertType =
  | "anomaly"
  | "target_miss"
  | "trend_reversal"
  | "structural_break"
  | "forecast_threshold";

export interface MetricAlert {
  metricKey: string;
  type: MetricAlertType;
  severity: 1 | 2 | 3 | 4 | 5;
  message: string;
  value: number;
  threshold: number | null;
  detectedAt: Date;
}

// --------------------------- Report -----------------------------------------

export interface MetricsIntelligenceReport {
  metricHealthMap: Record<string, MetricHealthFull>;
  forecasts: Record<string, Forecast>;
  anomalies: Anomaly[];
  correlationMatrix: CorrelationMatrix;
  causalHypotheses: MetricCausalHypothesis[];
  compositeScores: Record<string, DomainMetricScore>;
  alertQueue: MetricAlert[];
  generatedAt: string;
}
