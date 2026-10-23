// Part 44 — shared types for the collective-intelligence engine.

export interface RawForecast {
  forecasterId: string;
  probability: number; // 0..1
  rationale?: string;
  /** Calibration-weighted pooling input: higher = more trusted historically. */
  calibrationScore?: number; // 0..1, higher is better
  /** Lower is better (Part 13 Brier score contract). */
  brierScore?: number; // 0..1
}

export type AggregationMethod = "mean" | "extremized" | "calibration_weighted";

export interface MinorityReport {
  forecasterId: string;
  probability: number;
  rationale: string;
  divergence: number; // |p - aggregate|
}

export interface AggregateResult {
  method: AggregationMethod;
  value: number;
  n: number;
  params: Record<string, number | string>;
  mean: number;
  stdDev: number;
  minorityReports: MinorityReport[];
}

export interface DispersionStats {
  n: number;
  mean: number;
  stdDev: number;
  /** Shannon-entropy-like diversity measure normalized 0..1 for a continuous belief distribution. */
  diversityIndex: number;
}
