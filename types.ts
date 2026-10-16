// LEADOS.viz — shared data contract.
// UNVERIFIED NOTE: no js/viz.js, js/engine.js (internals), or js/ui.js source
// was read in this session beyond what AI-SESSION-LOG.md documents as
// inspected (see README.md "What was inspected"). Nothing here is a port of
// real LeadOS code — it is a fresh implementation of the pt-C brief's
// specification text, built as React components instead of the brief's
// literal "(data, options) -> SVG string | Canvas element" functions,
// because this tool environment is a React/Vite project, not a static
// multi-file <script> site. See AI-SESSION-LOG.md §1 for the full list of
// disclosed adaptations.

export type Confidence = "high" | "medium" | "low";

/** Every chart's non-optional provenance block. */
export interface VizMeta {
  /** e.g. "from fin.pl.logged, n=8 periods" */
  source: string;
  confidence: Confidence;
  /** what this chart actually shows, one sentence */
  label: string;
  /** known limitation, if any */
  caveat?: string;
}

export interface SeriesPoint {
  x: string; // ISO date
  y: number | null; // null = data gap
}

export interface LineSeries {
  label: string;
  points: SeriesPoint[];
  color: string;
  conf?: Confidence;
}

export interface Annotation {
  x: string;
  label: string;
}

export interface BulletRange {
  lo: number;
  hi: number;
  label: string;
  color: string;
}

export interface BulletMetric {
  label: string;
  actual: number;
  target: number;
  prior?: number;
  unit?: string;
  ranges: BulletRange[];
}

export interface HeatCell {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  sublabel?: string;
}

export interface CalendarEvent {
  date: string; // ISO date
  count: number;
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface WaterfallItem {
  label: string;
  value: number;
  type: "base" | "add" | "subtract" | "total";
}

export interface RadarSeries {
  label: string;
  values: number[];
  color: string;
  opacity?: number;
}

export interface NetworkNode {
  id: string;
  label: string;
  type: "direct" | "skip" | "bridge" | "isolate";
  domain: string;
  indegree: number;
  outdegree: number;
}

export interface NetworkEdge {
  from: string;
  to: string;
  type: "collaboration" | "information" | "decision" | "blocker";
  strength: number; // 1-5
}

export interface GanttItem {
  label: string;
  startFrac: number; // 0-1 across the displayed window
  endFrac: number;
  state: "planned" | "atRisk" | "done" | "blocked";
  trend: "up" | "down" | "flat" | "blocked";
}

export interface CohortRow {
  cohort: string;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
}

export interface CalibrationBucket {
  bucketLabel: string;
  statedMid: number; // midpoint of stated-confidence bucket, 0-100
  accuracy: number; // 0-100
  n: number;
}

export interface ScoreMathFinding {
  severity: number;
  confidence: Confidence;
  confidenceFactor: number;
  smartFactors: { label: string; mult: number }[];
  rank: number;
  totalActive: number;
  rule: string;
  domain: string;
  key: string;
  source: string;
  eventId: string;
  date: string;
}
