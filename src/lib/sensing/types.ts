// Shared types for the Part 13 sensing & forecasting pipeline.

export type DetectionMethod = "ewma" | "robust_z" | "seasonal_ewma";

export type Severity = "low" | "medium" | "high";

export interface SeriesPoint {
  ts: string; // ISO timestamp
  value: number;
}

export interface SeriesMeta {
  key: string;
  name: string;
  unit: string;
  seasonalPeriod?: number | null;
  heavyTailed?: boolean;
}

/** A single detected anomaly, always carrying its own explanation. */
export interface AnomalyAlert {
  index: number; // index into the input point array
  ts: string;
  method: DetectionMethod;
  observed: number;
  expectedLow: number;
  expectedHigh: number;
  /** Deviation in the method's own native units (sigma multiples). */
  deviation: number;
  /**
   * Estimated probability that an alert like this one is a false positive,
   * derived empirically from `npm run eval:sensing` (see
   * src/lib/sensing/falsePositiveRates.ts). This is NOT a theoretical
   * control-limit alpha; it is measured on seeded injections.
   */
  falsePositiveEstimate: number;
  likelyCauses: string[];
  severity: Severity;
}

export type InjectionKind = "level_shift" | "trend_change" | "seasonal_break" | "spike";

export interface InjectedAnomaly {
  kind: InjectionKind;
  /** index range [start, end) the injection affects */
  start: number;
  end: number;
}

export interface GeneratedSeries {
  points: SeriesPoint[];
  meta: SeriesMeta;
  injections: InjectedAnomaly[];
}
