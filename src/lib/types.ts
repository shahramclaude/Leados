// ─────────────────────────────────────────────────────────────────────────
// Leados — Core Types
// Event-sourced organizational intelligence platform.
// Every domain (people, finance, strategy, execution, rd, sales, knowledge,
// manufacturing) is derived purely from an append-only event log.
// ─────────────────────────────────────────────────────────────────────────

export const DOMAINS = [
  "people",
  "finance",
  "strategy",
  "execution",
  "rd",
  "sales",
  "knowledge",
  "manufacturing",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

// All event types recognized by the projection engine. New types for
// Prompts 6-12 are grouped below the original core set.
export const EVENT_TYPES = [
  // People / org
  "person.added",
  "person.updated",
  "person.exit_signal",
  "person.review",
  // Commitments / decisions (generic strategy ledger)
  "commitment.made",
  "commitment.resolved",
  "decision.logged",
  "decision.outcome",
  // Generic metric stream
  "metric.recorded",
  // OKRs (Prompt 6)
  "goal.set",
  "goal.progress",
  "goal.closed",
  // Strategy (Prompt 6)
  "scenario.created",
  "scenario.probability.updated",
  "competitor.signal",
  "market.move",
  "strategy.board.note",
  // Finance (Prompt 7)
  "finance.snapshot",
  "finance.fundraise.update",
  // Execution (Prompt 8)
  "project.created",
  "project.updated",
  "project.completed",
  "milestone.created",
  "milestone.completed",
  "milestone.overdue",
  "blocker.raised",
  "blocker.resolved",
  "project.snapshot",
  // Knowledge (Prompt 9)
  "playbook.used",
  "root_cause.logged",
  // Signals / rules (Prompt 11)
  "hypothesis.created",
  "hypothesis.resolved",
  // Onboarding (Prompt 12)
  "onboarding.completed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number] | (string & {});

export interface LeadosEvent<T = Record<string, unknown>> {
  id: number;
  type: EventType;
  domain: Domain;
  entityId: string | null;
  ts: string; // ISO 8601
  data: T;
  source: string; // 'system' | 'seed' | 'onboarding_sample' | 'user' | 'import'
}

export type NewLeadosEvent = Omit<LeadosEvent, "id" | "entityId"> & { entityId?: string | null };

// ───────────────────────────── People ──────────────────────────────────
export interface Person {
  id: string;
  name: string;
  role: string;
  domain: Domain;
  startDate: string;
  performance: number; // 0-100
  potential: number; // 0-100
  flightRisk: number; // 0-1
  exitSignals: string[];
}

// ───────────────────────────── OKRs ────────────────────────────────────
export type OKRHealth = "on_track" | "at_risk" | "off_track";

export interface OKRKeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  progressPct: number; // 0-1
  health: OKRHealth;
  trend: "up" | "down" | "flat";
}

export interface OKRObjective {
  id: string;
  title: string;
  owner: string;
  quarterStart: string;
  quarterLength: number; // days
  progress: number; // 0-1 average of key results
  keyResults: OKRKeyResult[];
  health: OKRHealth;
  linkedDecisions: string[];
  velocity: number; // progress per week
}

export interface OKRHealthReport {
  objectives: OKRObjective[];
  overallProgress: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  teamHealthScore: number; // 0-100
}

// ───────────────────────────── Scenarios ───────────────────────────────
export interface MetricDefinition {
  key: string;
  label: string;
  baseline: number;
  stdev: number;
  unit: string;
  domain: Domain;
}

export interface MonteCarloResult {
  n: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  mean: number;
  histogram: { bucket: number; count: number }[];
  seed: number;
}

export interface ActivatedScenario {
  metricKey: string;
  metricLabel: string;
  actual: number;
  baseline: number;
  sigma: number; // number of std deviations away
  urgency: Severity;
  monteCarlo: MonteCarloResult;
  narrative: string;
}

// ───────────────────────────── Wargame ─────────────────────────────────
export interface CompetitorProfile {
  id: string;
  name: string;
  aggressiveness: number; // 0-1
  strengths: string[];
  weaknesses: string[];
  recentSignals: string[];
}

export interface Move {
  id: string;
  label: string;
  category: "price" | "product" | "partnership" | "talent" | "market";
  ourCostScore: number; // 0-1 (higher = more expensive)
  impactScore: number; // 0-1
  counterable: string[]; // ids of moves that counter this one
}

export interface WargameResult {
  ourBestMove: Move;
  expectedCompetitorCounters: { competitor: CompetitorProfile; move: Move; likelihood: number }[];
  blindspots: string[];
  generatedAt: string;
}

// ───────────────────────────── Board pack ──────────────────────────────
export interface BoardPack {
  executiveSummary: string;
  top3Risks: string[];
  top3Decisions: string[];
  okrSnapshotTable: string; // HTML
  scenariosActive: { count: number; mostCritical: ActivatedScenario | null };
  wargameInsight: WargameResult | null;
  confidenceStatement: string;
  generatedAt: string;
}

// ───────────────────────────── Finance ─────────────────────────────────
export interface UnitEconomics {
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  grossMargin: number;
  paybackPeriodMonths: number;
  health: "healthy" | "watch" | "critical";
}

export interface FundraisingReadiness {
  score: number; // 0-100
  raiseNowOrWait: "raise_now" | "wait" | "urgent";
  strengths: string[];
  weaknesses: string[];
}

export interface CapitalEfficiencyReport {
  burnMultiple: number;
  revenuePerEmployee: number;
  costPerAcquisition: number;
  paybackPeriodMonths: number;
  engineeringEfficiency: number;
  overallRating: "excellent" | "good" | "fair" | "poor";
  narrativeBullets: string[];
  score: number;
}

export interface RunwayPath {
  weeks: number[];
  cash: number[];
}

export interface RunwayReport {
  monteCarlo: MonteCarloResult; // months of runway
  paths: RunwayPath[]; // sample GBM paths
  bankruptcyRisk: number; // probability runway < 1 month
  currentCash: number;
  monthlyBurn: number;
}

// ───────────────────────────── Execution ───────────────────────────────
export type ProjectStatus = "backlog" | "in_progress" | "blocked" | "done";

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  overdue: boolean;
}

export interface Project {
  id: string;
  title: string;
  domain: Domain;
  owner: string;
  status: ProjectStatus;
  confidence: number; // 0-1
  dependsOn: string[];
  durationDays: number;
  milestones: ProjectMilestone[];
  blockers: { id: string; severity: Severity; description: string; resolved: boolean; raisedAt: string }[];
}

export interface CriticalPathResult {
  order: string[]; // topological order
  criticalPath: string[]; // longest chain of project ids
  bottleneck: string | null;
  cyclesDetected: boolean;
  totalDurationDays: number;
}

export interface MomentumReport {
  momentumIndex: number;
  label: "ACCELERATING" | "STEADY" | "DECELERATING" | "STALLED";
  completed14d: number;
  pending14d: number;
}

export interface ExecutionReport {
  kpis: {
    activeProjects: number;
    blockedProjects: number;
    overdueMilestones: number;
    avgConfidence: number;
    openBlockers: number;
  };
  criticalPath: CriticalPathResult;
  momentum: MomentumReport;
  projects: Project[];
  blockerHeatmap: { domain: Domain; severity: Severity; count: number }[];
}

// ───────────────────────────── Rule Engine ─────────────────────────────
export type RuleStatus = "active" | "inactive" | "snoozed" | "calibrating";

export interface RuleEvaluation {
  ruleId: string;
  domain: Domain;
  name: string;
  description: string;
  firesWhen: string;
  resolvesWhen: string;
  status: RuleStatus;
  firing: boolean;
  severity: Severity | null;
  confidence: number; // 0-1
  scoreMath: string;
  basis: string;
  playbookId: string;
}

export interface Hypothesis {
  id: string;
  ruleId: string;
  entityId: string | null;
  createdAt: string;
  status: "open" | "confirmed" | "refuted";
  confidence: number;
  resolveBy: string;
  statement: string;
}

export interface CausalLink {
  id: string;
  fromRuleId: string;
  toRuleId: string;
  description: string;
  amplification: number; // multiplier applied to severity when active
}

export interface Cascade {
  link: CausalLink;
  active: boolean;
  originalSeverityScore: number;
  effectiveSeverityScore: number;
}

// ───────────────────────────── Knowledge ───────────────────────────────
export interface GraphNode {
  id: string;
  label: string;
  domain: Domain;
  kind: "rule" | "finding" | "decision" | "person";
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  active: boolean;
  weight: number;
}

export interface InstitutionalPattern {
  pattern: string;
  occurrences: number;
  domains: Domain[];
  lastSeen: string;
  confirmedRate: number;
}

export interface AdaptivePlaybook {
  domain: Domain;
  title: string;
  steps: string[];
  basedOn: string;
}

// ───────────────────────────── Metrics ─────────────────────────────────
export interface TimeSeriesPoint {
  ts: string;
  value: number;
}

export interface ForecastResult {
  history: TimeSeriesPoint[];
  forecast: TimeSeriesPoint[];
  level: number;
  trend: number;
  seasonal: number[];
}

export interface StructuralBreak {
  index: number;
  ts: string;
  cusumValue: number;
  isBreak: boolean;
}

export interface CrossMetricHypothesis {
  metricA: string;
  metricB: string;
  lagDays: number;
  correlation: number;
  statement: string;
}

export interface CalibrationPoint {
  predictedBucket: number; // 0-1
  actualRate: number; // 0-1
  n: number;
}

export interface CalibrationReport {
  ruleId: string;
  points: CalibrationPoint[];
  status: "good" | "over-sensitive" | "under-sensitive" | "insufficient data";
  predictions: number;
  confirmed: number;
  refuted: number;
  confirmationRate: number;
}

// ───────────────────────────── Onboarding ──────────────────────────────
export type OrgSize = "startup" | "scaleup" | "enterprise" | "nonprofit" | "other";

export interface OrgProfile {
  orgType: OrgSize;
  activeDomains: Domain[];
  leaders: { name: string; role: string }[];
  topConcern:
    | "retention"
    | "runway"
    | "execution"
    | "culture"
    | "strategy"
    | "compliance";
}

// ───────────────────────────── Health self-tests ───────────────────────
export interface HealthTestResult {
  id: string;
  name: string;
  pass: boolean;
  actual: string;
  expected: string;
  durationMs: number;
}

export interface HealthSuiteReport {
  tests: HealthTestResult[];
  passing: number;
  total: number;
  totalMs: number;
  allPass: boolean;
}
