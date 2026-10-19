// Shared types for the Leados event brain + autonomous agent loop.

import type { db } from "@/db";

export type DrizzleDB = typeof db;

// ─────────────────────────────────────────────────────────────────────────
// DOMAIN MODEL
// ─────────────────────────────────────────────────────────────────────────

export const DOMAINS = [
  "financial",
  "morale",
  "attrition",
  "execution",
  "culture",
  "growth",
] as const;

export type Domain = (typeof DOMAINS)[number];

export interface EventRecord {
  id: string;
  type: string;
  domain: string;
  personId: string | null;
  entityId: string | null;
  entityType: string | null;
  severity: number;
  title: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// EVENT BRAIN — PROJECTION
// ─────────────────────────────────────────────────────────────────────────

export interface DomainProjection {
  domain: Domain;
  events: EventRecord[];
  eventCount: number;
  /** 0 (critical) — 10 (healthy) */
  score: number;
  /** rate of change of RISK (10 - score) per day; negative = improving */
  velocity: number;
  /** Bayesian-flavoured belief that this domain is "at risk", 0..1 */
  posterior: number;
  lastEventAt: Date | null;
}

export interface PersonProjection {
  personId: string;
  name: string;
  events: EventRecord[];
  flightRiskIndicatorTypes: string[];
  flightRiskCount: number;
}

export interface Projection {
  generatedAt: Date;
  lookbackDays: number;
  domains: Record<Domain, DomainProjection>;
  people: Record<string, PersonProjection>;
}

// ─────────────────────────────────────────────────────────────────────────
// RULE ENGINE
// ─────────────────────────────────────────────────────────────────────────

export interface PlaybookDefinition {
  id: string;
  name: string;
  description: string;
}

export interface RuleDefinition {
  id: string; // e.g. F01, P02, P03
  name: string;
  domain: Domain;
  /** base confidence [0,1] the rule models reality well before calibration */
  baseConfidence: number;
  suggestedPlaybook: PlaybookDefinition | null;
  description: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  domain: Domain;
  severity: number; // 1..5
  title: string;
  basis: string;
  confidence: number; // calibrated confidence, 0..1
  entityId: string | null;
  entityType: string | null;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// BRAIN FINDINGS (output of eventBrain.run)
// ─────────────────────────────────────────────────────────────────────────

export type RiskProfile = "low" | "moderate" | "elevated" | "critical";

export interface DomainMetricState extends DomainProjection {}

export interface BrainFindings {
  generatedAt: Date;
  orgHealthScore: number; // 0..100
  riskProfile: RiskProfile;
  domainMetrics: Record<Domain, DomainMetricState>;
  findings: Finding[];
  novelFindings: Finding[]; // severity >= 4
  topFinding: Finding | null;
  physicsSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────
// CAUSAL INFERENCE
// ─────────────────────────────────────────────────────────────────────────

export interface CausalCascade {
  from: Domain;
  to: Domain;
  fromRuleId: string | null;
  toRuleId: string | null;
  amplificationFactor: number;
  confidence: number;
  lagDays: { min: number; max: number };
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// AGENT LOOP
// ─────────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  normalIntervalMs: number; // default 1_800_000 (30min)
  criticalIntervalMs: number; // default 600_000 (10min)
  morningBriefingHour: number; // default 7 UTC
  hypothesisLookbackDays: number; // default 90
  calibrationLookbackDays: number; // default 30
  maxPlaybookAutoTriggers: number; // default 3 per cycle
}

export interface AgentCycleInput {
  db: DrizzleDB;
  now: Date;
  previousResult: AgentCycleResult | null;
  config: AgentConfig;
}

export interface StepResult {
  step: string;
  status: "success" | "partial" | "skipped" | "failed";
  durationMs: number;
  summary: string;
  error?: string;
}

export interface BeliefUpdate {
  domain: Domain;
  previousPosterior: number | null;
  newPosterior: number;
  amplifiedBy: number; // multiplier applied from cascades, 1 if none
}

export interface DriftAlert {
  domain: Domain;
  slope: number; // per-day slope of posterior
  projectedChange14d: number;
  projectedAt: Date | null; // when posterior is projected to cross 0.7
}

export interface TriggeredPlaybook {
  ruleId: string;
  playbookId: string;
  playbookName: string;
  domain: Domain;
  severity: number;
  findingTitle: string;
}

export interface Hypothesis {
  id: string;
  key: string;
  entityId: string | null;
  entityType: string | null;
  ruleId: string | null;
  domain: Domain | null;
  claim: string;
  predictedAt: Date;
  resolveBy: Date;
  threshold: number | null;
  metricToCheck: string | null;
  status: "open" | "confirmed" | "refuted";
  outcomeNote: string | null;
}

export interface HypothesisResolution {
  hypothesisId: string;
  ruleId: string | null;
  outcome: "confirmed" | "refuted";
  confidenceAtPrediction: number | null;
  actualValue: number | null;
  threshold: number | null;
  brierContribution: number | null;
  weightBefore: number | null;
  weightAfter: number | null;
}

export interface RuleCalibration {
  ruleId: string;
  oldWeight: number;
  newWeight: number;
  brierScore: number;
  confirmed: number;
  refuted: number;
  action: "increased_threshold" | "well_calibrated" | "no_adjustment";
}

export interface UncertaintyFlag {
  domain: Domain | "system";
  eventCount: number;
  confidenceLevel: "low" | "medium" | "high";
  message: string;
  missingEventTypes: string[];
}

export interface AgentError {
  step: string;
  message: string;
}

export interface Priority {
  title: string;
  domain: Domain;
  rationale: string;
}

export interface Risk {
  title: string;
  domain: Domain;
  severity: number;
  basis: string;
}

export interface Decision {
  title: string;
  domain: Domain;
  deadline: string;
  rationale: string;
}

export interface MorningBriefing {
  date: string;
  orgHealthScore: number;
  riskProfile: RiskProfile;
  executiveSummary: string;
  top3Priorities: Priority[];
  top3Risks: Risk[];
  decisionsNeeding48hAction: Decision[];
  physicsStatement: string;
  uncertaintyStatement: string;
  hypothesesOpen: number;
  hypothesesConfirmedThisWeek: number;
}

export interface AgentCycleResult {
  cycleId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: "running" | "complete" | "partial" | "failed";
  stepResults: StepResult[];

  brainFindings: BrainFindings;
  cascadesDetected: CausalCascade[];
  beliefsUpdated: BeliefUpdate[];
  driftsDetected: DriftAlert[];
  playbooksTriggered: TriggeredPlaybook[];
  hypothesesCreated: Hypothesis[];
  hypothesesResolved: HypothesisResolution[];
  rulesCalibrated: RuleCalibration[];
  briefingGenerated: boolean;
  uncertaintyFlags: UncertaintyFlag[];

  totalDurationMs: number;
  stepDurations: Record<string, number>;
  errors: AgentError[];
  nextCycleAt: Date;
  adaptedInterval: boolean;
}
