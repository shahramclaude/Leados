/**
 * Shared uncertainty shape consumed by every chart in the grammar.
 * Part 04 (per the roadmap this session inherits) will standardize how
 * `monteCarlo`/`forecastCache` populate this; charts here already render
 * the band/range so no rework is needed when that data lands for real.
 */
export interface Explain<T> {
  /** Point estimate / best-known value. */
  value: T;
  /** Lower bound of the credible interval, if known. */
  low?: T;
  /** Upper bound of the credible interval, if known. */
  high?: T;
  /** 0–1 confidence in the estimate, if known. */
  confidence?: number;
  /** How the value was derived — shown in the tooltip, never hidden. */
  method?: string;
  asOf?: string;
}

export interface SeriesPoint {
  x: string;
  y: number;
  low?: number;
  high?: number;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  points: SeriesPoint[];
  /** Shape marker drawn at each point in addition to color, so overlapping
   * series stay distinguishable without relying on hue alone. */
  marker?: "circle" | "square" | "triangle" | "diamond";
}

export interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}
