// src/lib/types.ts
//
// Single shared type root for the Leados intelligence layer.
// Part 1: belief fabric (10 latent / 22 observable Bayesian network).
// Part 2: autonomous agent orchestration types.

// ─────────────────────────────────────────────────────────────────────────
// Primitive domain types
// ─────────────────────────────────────────────────────────────────────────

export type ISODateString = string;

export interface LeadosEvent {
  id: string;
  type: string;
  occurredAt: Date | ISODateString;
  personId?: string | number;
  teamId?: string;
  projectId?: string | number;
  domain?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

export type SeniorityLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export interface LeadosPerson {
  id: string;
  name: string;
  teamId?: string;
  level?: SeniorityLevel | string;
  startDate?: Date | ISODateString;
  hasSuccessor?: boolean;
  calendarLoadPct?: number;
  status?: string;
  flightRiskScore?: number;
}

export interface DecisionHealthIndex {
  avgCycleTimeDays: number;
}

export interface OrgNetworkNode {
  personId: string;
  connections: number;
}

export interface OrgNetwork {
  nodes: OrgNetworkNode[];
  isolatedCount: number;
  totalNodes: number;
}

export interface ProjectConfidenceSnapshot {
  projectId: string;
  takenAt: Date | ISODateString;
  confidence: number;
}

export interface NpsSnapshot {
  takenAt: Date | ISODateString;
  score: number;
}

export interface LeadosMetrics {
  decisionHealthIndex: DecisionHealthIndex;
  orgNetwork: OrgNetwork;
  projectConfidenceSnapshots: ProjectConfidenceSnapshot[];
  npsSnapshots: NpsSnapshot[];
}

// ─────────────────────────────────────────────────────────────────────────
// Domains
// ─────────────────────────────────────────────────────────────────────────

export const DOMAINS = [
  "people",
  "execution",
  "culture",
  "finance",
  "innovation",
  "strategy",
] as const;
export type Domain = (typeof DOMAINS)[number];

// ─────────────────────────────────────────────────────────────────────────
// Bayesian network node identifiers (Part 1)
// ─────────────────────────────────────────────────────────────────────────

export const LEGACY_LATENT_NODES = ["flightRisk", "strategyRisk"] as const;
export type LegacyLatentNodeId = (typeof LEGACY_LATENT_NODES)[number];

export const NEW_LATENT_NODES = [
  "burnoutRisk",
  "executionRisk",
  "cultureRisk",
  "financialRisk",
  "innovationStall",
  "decisionParalysis",
  "cascadeRisk",
  "leadershipEnergyDepletion",
] as const;
export type NewLatentNodeId = (typeof NEW_LATENT_NODES)[number];

export const LATENT_NODES = [...LEGACY_LATENT_NODES, ...NEW_LATENT_NODES] as const;
export type LatentNodeId = (typeof LATENT_NODES)[number];

export const LEGACY_OBSERVABLE_NODES = [
  "cadenceSlip",
  "moralePulse",
  "runwayMonths",
  "compGapSignal",
  "peerAttritionSignal",
  "sentimentDrop",
] as const;
export type LegacyObservableNodeId = (typeof LEGACY_OBSERVABLE_NODES)[number];

export const NEW_OBSERVABLE_NODES = [
  "actionItemSlipRate",
  "decisionCycleBloom",
  "budgetDeviationPct",
  "techDebtVelocity",
  "onboardingCohortDrop",
  "conflictFrequency",
  "meetingLoadIndex",
  "knowledgeSiloIndex",
  "retrospectiveHealth",
  "deliveryConfidenceDrop",
  "boardSentiment",
  "talentBenchDepth",
  "successionGapCount",
  "psychologicalSafetyIndex",
  "regulatoryFlagRate",
  "customerNPSDrift",
] as const;
export type NewObservableNodeId = (typeof NEW_OBSERVABLE_NODES)[number];

export const OBSERVABLE_NODES = [...LEGACY_OBSERVABLE_NODES, ...NEW_OBSERVABLE_NODES] as const;
export type ObservableNodeId = (typeof OBSERVABLE_NODES)[number];

/** Maps every PRIMARY latent node (i.e. excluding the cascadeRisk
 * aggregate) to the business domain it belongs to. Used for domain health
 * rollups and for routing findings/playbooks. */
export const LATENT_NODE_DOMAIN: Record<Exclude<LatentNodeId, "cascadeRisk">, Domain> = {
  flightRisk: "people",
  strategyRisk: "strategy",
  burnoutRisk: "people",
  executionRisk: "execution",
  cultureRisk: "culture",
  financialRisk: "finance",
  innovationStall: "innovation",
  decisionParalysis: "strategy",
  leadershipEnergyDepletion: "people",
};

// ─────────────────────────────────────────────────────────────────────────
// Bayesian network primitives
// ─────────────────────────────────────────────────────────────────────────

export interface NodeMarginal {
  p: number;
  confidence: number;
}

export interface CausalParent<TParentId extends string = string> {
  nodeId: TParentId;
  q: number;
}

export interface NoisyOrNode<TId extends string = string, TParentId extends string = string> {
  id: TId;
  leak: number;
  prior: number;
  parents: CausalParent<TParentId>[];
}

export interface BeliefFabricResult {
  posteriors: Record<LatentNodeId, NodeMarginal>;
  observables: Record<ObservableNodeId, number>;
  cascadeRisk: NodeMarginal;
  dominantRisk: LatentNodeId;
  dominantRiskDetail: string;
  generatedAt: ISODateString;
}

// ─────────────────────────────────────────────────────────────────────────
// Belief drift tracking
// ─────────────────────────────────────────────────────────────────────────

export interface BeliefTrajectoryPoint {
  date: ISODateString;
  p: number;
  confidence: number;
}

export interface BeliefDrift {
  node: LatentNodeId;
  drifting: boolean;
  ratePerDay: number;
  projectedCrossing: Date | null;
}

// Alias retained for modules that only care about the raw regression
// output without the node id attached.
export type BeliefDriftResult = Omit<BeliefDrift, "node">;

// ─────────────────────────────────────────────────────────────────────────
// Findings / notifications
// ─────────────────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  ruleKey: string;
  domain: Domain | string;
  severity: number; // 1-5
  title: string;
  description: string;
  createdAt: ISODateString;
  cycleId?: string | null;
}

export interface NotificationPayload {
  severity: number;
  title: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────

export interface RuleDefinition {
  key: string;
  name: string;
  domain: Domain | string;
  baseSeverity: number;
  evaluate: (ctx: RuleEvalContext) => RuleEvalOutcome;
}

export interface RuleEvalContext {
  beliefs: BeliefFabricResult;
  events: LeadosEvent[];
  now: Date;
}

export interface RuleEvalOutcome {
  fired: boolean;
  probability: number; // predicted probability of the underlying bad outcome
  detail?: string;
}

export interface EvaluatedRule {
  ruleKey: string;
  name: string;
  domain: Domain | string;
  fired: boolean;
  severity: number;
  weight: number;
  probability: number;
  finding: Finding | null;
}

export interface RuleAccuracyReport {
  ruleKey: string;
  name: string;
  domain: Domain | string;
  brierScore: number | null;
  calibration: number | null;
  truePositives: number;
  falsePositives: number;
  totalEvaluations: number;
  recommendedWeightAdjustment: "increase" | "decrease" | "none";
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Playbooks
// ─────────────────────────────────────────────────────────────────────────

export interface PlaybookDefinition {
  key: string;
  name: string;
  domain: Domain | string;
  ruleKey: string;
  steps: string[];
}

export interface TriggeredPlaybook {
  instanceId: number;
  playbookKey: string;
  playbookName: string;
  domain: Domain | string;
  triggerFindingId: string;
  assignedTo: number | null;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Hypotheses
// ─────────────────────────────────────────────────────────────────────────

export type HypothesisStatus = "open" | "confirmed" | "refuted";

export interface Hypothesis {
  id: string;
  key: string;
  entityId: string;
  entityType: string;
  claim: string;
  predictedBy: ISODateString;
  resolveBy: ISODateString;
  status: HypothesisStatus;
  outcomeNote: string | null;
  outcomeValue: number | null;
  metricToCheck: string | null;
  threshold: number | null;
  ruleKey?: string | null;
}

export interface HypothesisResolution {
  hypothesisId: string;
  key: string;
  status: "confirmed" | "refuted";
  outcomeNote: string;
  actualValue: number;
  threshold: number;
  ruleKey: string | null;
}

export interface RuleCalibrationRecord {
  ruleKey: string;
  oldWeight: number;
  newWeight: number;
  reason: "hypothesis_confirmed" | "hypothesis_refuted" | "brier_audit";
  hypothesisId?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator result
// ─────────────────────────────────────────────────────────────────────────

export interface DomainHealthScore {
  domain: Domain | string;
  score: number; // 0-100
  trend: "improving" | "stable" | "declining";
}

export interface ProjectSummary {
  id: number;
  name: string;
  domain: Domain | string;
  deliveryConfidence: number;
  previousDeliveryConfidence: number;
  targetDate: ISODateString | null;
}

export interface DecisionSummary {
  id: number;
  title: string;
  domain: Domain | string;
  confidence: number;
  deadline: ISODateString | null;
  status: string;
}

export interface OrchestratorResult {
  beliefs: BeliefFabricResult;
  findings: Finding[];
  domainHealth: Record<string, DomainHealthScore>;
  projects: ProjectSummary[];
  decisions: DecisionSummary[];
  flightRiskByPerson: Record<string, { personId: string; name: string; p: number }>;
  narrative: string[];
  generatedAt: ISODateString;
}

// ─────────────────────────────────────────────────────────────────────────
// Agent cycle (Part 2)
// ─────────────────────────────────────────────────────────────────────────

export type AgentPriority = "normal" | "elevated" | "critical";

export interface DomainDropEvent {
  domain: Domain | string;
  previousScore: number;
  currentScore: number;
  drop: number;
}

export interface MetricBreachEvent {
  metric: string;
  target: number;
  actual: number;
  deviationPct: number;
}

export interface CycleDelta {
  newCritical: Finding[];
  scoreDrop: DomainDropEvent[];
  beliefCrossings: LatentNodeId[];
  metricBreaches: MetricBreachEvent[];
}

export interface UncertaintyFlag {
  node: LatentNodeId;
  confidence: number;
  missingSignals: ObservableNodeId[];
  recommendation: string;
}

export interface WeeklyBriefing {
  briefingDate: string; // YYYY-MM-DD
  executiveSummary: string;
  top3Priorities: Finding[];
  top3Risks: BeliefDrift[];
  decisionsNeeded: DecisionSummary[];
  playbooksActive: number;
  hypothesesPending: number;
  uncertaintyStatement: string;
}

export interface AgentCycleResult {
  cycleId: string;
  startedAt: Date;
  completedAt: Date;
  priority: AgentPriority;
  beliefResult: BeliefFabricResult;
  orchestratorResult: OrchestratorResult;
  driftsDetected: BeliefDrift[];
  playbooksTriggered: TriggeredPlaybook[];
  hypothesesCreated: Hypothesis[];
  hypothesesResolved: HypothesisResolution[];
  rulesCalibrated: RuleCalibrationRecord[];
  briefingUpdated: boolean;
  uncertaintyFlags: UncertaintyFlag[];
  deltaVsPrevious: CycleDelta | null;
  stepTimingsMs: Record<string, number>;
  warnings: string[];
}

export interface AgentCycleInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  now: Date;
  previousCycle: AgentCycleResult | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduler (Part 2)
// ─────────────────────────────────────────────────────────────────────────

export interface SchedulerConfig {
  normalIntervalMs: number;
  criticalIntervalMs: number;
  morningBriefingHour: number;
}

export interface SchedulerStatus {
  running: boolean;
  lastRunAt: ISODateString | null;
  nextRunAt: ISODateString | null;
  currentIntervalMs: number;
  lastCycleId: string | null;
  consecutiveErrors: number;
  degradedMode: boolean;
}

export interface AgentCycleSummary {
  cycleId: string;
  startedAt: ISODateString;
  durationMs: number;
  findingsDelta: number;
  playbooksTriggered: number;
  cascadeRiskAtCompletion: number;
}
