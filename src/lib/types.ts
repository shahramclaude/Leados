// =============================================================================
// Leados — shared domain types
// Part 6 adds Project / Milestone / Blocker / CrossDependency / execution
// intelligence types. Earlier-part types (Person, LeadosEvent) are rebuilt
// here at minimal fidelity since this checkout does not include Parts 1-5.
// =============================================================================

export type Domain =
  | "engineering"
  | "product"
  | "design"
  | "sales"
  | "marketing"
  | "support"
  | "finance"
  | "operations";

export const DOMAINS: Domain[] = [
  "engineering",
  "product",
  "design",
  "sales",
  "marketing",
  "support",
  "finance",
  "operations",
];

export interface PersonRecord {
  id: number;
  name: string;
  domain: string | null;
  flightRisk: number; // 0-1
  burnoutRisk: number; // 0-1
}

export interface LeadosEvent {
  id: number;
  type: string;
  projectId: number | null;
  personId: number | null;
  domain: string | null;
  payload: string | null;
  createdAt: Date;
}

export type ProjectStatus = "planning" | "active" | "blocked" | "complete";
export type MilestoneStatus = "pending" | "done" | "overdue" | "cancelled";
export type DependencyType = "blocks" | "enables" | "shares_resource";

export interface Project {
  id: number;
  name: string;
  domain: string | null;
  ownerId: number | null;
  startDate: Date | null;
  targetDate: Date | null;
  status: ProjectStatus;
  scopeStatement: string;
  confidence: number; // base, self-assessed
  impact: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  id: number;
  projectId: number;
  title: string;
  dueDate: Date | null;
  status: MilestoneStatus;
  completedAt: Date | null;
}

export interface Blocker {
  id: number;
  projectId: number;
  title: string;
  description: string;
  severity: number; // 1-5
  reportedBy: number | null;
  assignedTo: number | null;
  domain: string | null;
  reportedAt: Date;
  resolvedAt: Date | null;
}

export interface ProjectSnapshot {
  id: number;
  projectId: number;
  snapshotAt: Date;
  confidence: number;
  status: string;
  blockerCount: number;
  milestoneDone: number;
  milestoneTotal: number;
}

export interface CrossDependency {
  id: number;
  fromProject: number;
  toProject: number;
  type: DependencyType;
  strength: number;
}

// -----------------------------------------------------------------------------
// Execution Intelligence (Part 6)
// -----------------------------------------------------------------------------

export interface RiskFactor {
  label: string;
  impact: number; // negative = bad, positive = good, in confidence points
  category:
    | "milestone"
    | "blocker"
    | "people"
    | "physics"
    | "dependency"
    | "signal";
}

export interface ProjectDeliveryModel {
  projectId: number;
  name: string;
  status: ProjectStatus;
  targetDate: Date | null;
  baseConfidence: number;
  computedConfidence: number;
  confidenceDelta: number;
  completionProbability: number;
  expectedCompletionDate: Date | null;
  lateByDays: number | null;
  riskFactors: RiskFactor[];
  physicsAnnotation: string;
}

export interface CriticalPathResult {
  chain: number[];
  chainLength: number;
  cyclesDetected: number[][];
  bottleneckProject: number | null;
  bottleneckReason: string;
}

export interface BlockerHeatmapCell {
  domain: string;
  severity: number;
  count: number;
  blockerIds: number[];
}

export interface OrgPhysicsState {
  entropy: number;
  energyBudget: number;
  inertia: number;
  momentum: number;
  frictionIndex: number;
}

export interface ExecutionIntelligenceReport {
  executionHealthScore: number;
  deliveryConfidence: ProjectDeliveryModel[];
  criticalPath: CriticalPathResult;
  blockerHeatmap: BlockerHeatmapCell[][];
  momentumIndex: number;
  velocityTrend: "accelerating" | "stable" | "decelerating";
  physicsState: OrgPhysicsState;
  atRiskProjects: ProjectDeliveryModel[];
  generatedAt: string;
}

export type ProjectAnomalyType = "structural_break" | "trend_reversal";

export interface ProjectAnomaly {
  projectId: number;
  type: ProjectAnomalyType;
  detectedAt: string;
  detail: string;
  magnitude: number;
}
