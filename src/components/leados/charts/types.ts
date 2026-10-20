/**
 * Shared chart data shapes. `Explain<T>` is the forward-compatible envelope
 * Part 04 will standardize for monteCarlo/forecastCache outputs — consuming
 * it now means uncertainty bands are a first-class mark, not a bolt-on.
 */
export interface Explain<T> {
  /** Point estimate / most likely value. */
  value: T;
  /** 10th percentile — lower bound of the credible band. */
  p10?: T;
  /** 50th percentile (median), when distinct from `value`. */
  p50?: T;
  /** 90th percentile — upper bound of the credible band. */
  p90?: T;
  /** 0-1 confidence in the estimate, surfaced in tooltips/tables. */
  confidence?: number;
  /** Where the number came from — always shown in the "view as table" fallback. */
  source?: string;
}

export interface SeriesPoint {
  t: string; // ISO date or category label
  v: number;
  p10?: number;
  p90?: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: SeriesPoint[];
  colorVar?: string;
  dash?: string;
}
