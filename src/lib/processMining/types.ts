// Part 28 — shared types for the process-intelligence module.
//
// HONESTY CONTRACT: anything produced here that is "mined" describes what the
// event log shows happened, not what anyone designed or intended. Anything
// "declared" comes from an explicit reference definition and is the only
// thing conformance can legitimately be checked against as "correct/incorrect".

export interface Explain<T> {
  value: T;
  formula: string;
  inputs: Record<string, number | string | boolean>;
  /** event ids / case ids / table refs the value was computed from (sampled) */
  citations: string[];
  /** 'measured' = computed from instrumented fields; 'estimated' = heuristic fallback was used */
  confidence: "measured" | "estimated";
  notes?: string[];
}

export interface RawEvent {
  eventId: string;
  caseId: string;
  correlationId: string;
  processName: string;
  activity: string;
  resourceId: string | null;
  occurredAt: Date;
  /** active handling time for this step, ms (0 for instantaneous markers) */
  durationMs: number;
  status: string;
  attributes: Record<string, unknown>;
}

export interface CaseEventView {
  eventId: string;
  activity: string;
  resourceId: string | null;
  occurredAt: Date;
  durationMs: number;
  attributes: Record<string, unknown>;
  /** wait time observed immediately before this activity started, ms */
  queueMs: number;
}

export type ReconstructionIssue =
  | "overlapping-start-before-prior-end"
  | "no-end-activity-observed"
  | "shared-correlation-id-multiple-cases";

export interface CaseInstance {
  caseId: string;
  processName: string;
  correlationId: string;
  events: CaseEventView[];
  startedAt: Date;
  endedAt: Date;
  cycleTimeMs: number;
  open: boolean;
  ambiguous: boolean;
  issues: ReconstructionIssue[];
}

export interface ReconstructionReport {
  processName: string;
  totalRawEvents: number;
  totalCases: number;
  ambiguousCases: number;
  openCases: number;
  issueCounts: Record<string, number>;
}

export interface GapStats {
  count: number;
  avgMs: number;
  p50Ms: number;
  p85Ms: number;
  maxMs: number;
}

export interface DFGEdge {
  from: string;
  to: string;
  count: number;
  gap: GapStats;
  /** heuristics-miner-lite dependency measure in [-1,1]; higher = more deterministic */
  dependency: number;
  /** whether this edge survived the frequency/dependency filter into the model */
  kept: boolean;
  /** bounded reservoir of raw gap samples (ms), used to support incremental merges */
  gapSamplesMs: number[];
}

export interface DiscoveredModel {
  processName: string;
  source: "mined";
  periodStart: Date;
  periodEnd: Date;
  caseCount: number;
  activities: string[];
  edges: DFGEdge[];
  startActivities: { activity: string; count: number }[];
  endActivities: { activity: string; count: number }[];
  threshold: number;
  minFrequency: number;
}

export interface DeclaredStep {
  activity: string;
  mandatory: boolean;
  allowedNext: string[];
}

export interface ProcessDefinition {
  processName: string;
  version: number;
  steps: DeclaredStep[];
}

export type DeviationType = "unseen_transition" | "skip" | "insert" | "reorder" | "rework";

export interface Deviation {
  type: DeviationType;
  detail: string;
  activity?: string;
  /** 'statistical' = rare-but-observed (mined model); 'rule' = violates a declared constraint */
  severity: "statistical" | "rule";
}

export interface ConformanceResult {
  caseId: string;
  conformant: boolean;
  deviations: Deviation[];
}

export interface ConformanceReport {
  processName: string;
  checkedAgainst: "mined" | "declared";
  caseCount: number;
  conformantCount: number;
  conformanceRate: number;
  results: ConformanceResult[];
}

export interface BottleneckEntry {
  processName: string;
  activity: string;
  occurrences: number;
  distinctResources: number;
  avgActiveMs: number;
  avgQueueMs: number;
  p85QueueMs: number;
  totalQueueMs: number;
  rootCauseHypothesis: string;
  flagged: boolean;
}

export interface QueueingStats {
  processName: string;
  activity: string;
  periodMs: number;
  arrivals: number;
  lambdaPerHour: number;
  avgServiceMs: number;
  muPerHour: number;
  servers: number;
  utilization: number;
  wipTimeAverage: number;
  wMeasuredMs: number;
  wLittleMs: number;
  littlesLawDeltaPct: number;
  trend: EwmaTrend;
}

export interface EwmaPoint {
  periodStart: Date;
  raw: number;
  ewma: number;
}

export interface EwmaTrend {
  alpha: number;
  points: EwmaPoint[];
  direction: "rising" | "falling" | "stable";
  slopePerPeriod: number;
}

export interface BusFactorEntry {
  processName: string;
  activity: string;
  distinctResources: number;
  topResourceShare: number;
  redacted: boolean;
  topResourceId: string | null;
  risk: "high" | "medium" | "low";
}

export interface AutomationScore {
  processName: string;
  activity: string;
  volumeAnnualized: number;
  avgHandlingTimeHours: number;
  errorRate: number;
  ruleBasedFraction: number;
  automationCost: number;
  score: Explain<number>;
  roi: {
    savedHoursPerYear: number;
    fteEquivalent: number;
    additionalCaseThroughputPerYear: number;
    twinNote: string;
  };
}

export interface ControlChartPoint {
  periodStart: Date;
  value: number;
  outOfControl: boolean;
}

export interface ControlChart {
  metric: string;
  mean: number;
  ucl: number;
  lcl: number;
  points: ControlChartPoint[];
}

export interface OperationalMetrics {
  processName: string;
  caseCount: number;
  cycleTimeMsAvg: number;
  cycleTimeMsP50: number;
  cycleTimeMsP85: number;
  throughputPerDay: number;
  firstPassYield: number | null;
  reworkRate: number;
  slaAttainment: number | null;
  slaInstrumented: boolean;
}
