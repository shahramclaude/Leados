// Shared domain types for the Leados intelligence workspace.
// These are the contracts every API route and every view agree on.

export type Domain =
  | "people"
  | "decisions"
  | "metrics"
  | "execution"
  | "finance"
  | "product"
  | "culture"
  | "risk";

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface Finding {
  id: string;
  domain: Domain;
  severity: Severity;
  title: string;
  detail: string;
  ruleKey: string | null;
  createdAt: string;
}

export interface DomainHealth {
  domain: Domain;
  score: number; // 0-100
  trend: "up" | "down" | "flat";
  findingCount: number;
  criticalCount: number;
}

export interface IntelligenceReport {
  orgHealthScore: number; // 0-100 weighted composite
  domainHealth: DomainHealth[];
  findings: Finding[];
  criticalFindingsCount: number;
  generatedAt: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  severity: Severity;
  domain: string;
  read: boolean;
  createdAt: string;
  link: string | null;
}

export interface OrgNetworkNode {
  id: number;
  name: string;
  role: string;
  team: string;
  managerId: number | null;
  centrality: number; // PageRank score, normalized 0-1
  isolationRisk: boolean;
  daysSinceLastOneOnOne: number | null;
}

export interface OrgNetworkEdge {
  source: number;
  target: number;
  weight: number;
}

export interface OrgNetworkReport {
  nodes: OrgNetworkNode[];
  edges: OrgNetworkEdge[];
  bottleneckPersonId: number | null;
  avgSpanOfControl: number;
  isolatedCount: number;
  generatedAt: string;
}

export interface DecisionHealthIndex {
  score: number; // 0-100
  totalDecisions: number;
  overdueCount: number;
  avgCycleTimeDays: number;
  brierScore: number | null; // calibration of confidence vs outcome, lower is better
  decidedWithOutcomeCount: number;
  generatedAt: string;
}

export interface RuleHealth {
  ruleKey: string;
  name: string;
  domain: string;
  status: "healthy" | "warning" | "critical";
  score: number;
  weight: number;
  enabled: boolean;
  lastEvaluatedAt: string | null;
  detail: string;
}

export interface MetricHealth {
  key: string;
  label: string;
  domain: string;
  currentValue: number | null;
  target: number;
  benchmark: number;
  zScore: number | null;
  mapeVsTarget: number | null;
  trend: "up" | "down" | "flat";
  status: "healthy" | "warning" | "critical";
}

export interface GraphNode {
  id: string;
  type: "person" | "decision" | "metric" | "insight" | "playbook";
  label: string;
  importance: number; // PageRank score
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
}

export interface WeeklyBriefing {
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  generatedAt: string;
}

export type CaptureType =
  | "one_on_one"
  | "decision"
  | "metric_update"
  | "incident"
  | "feedback";

export interface ClassificationResult {
  type: CaptureType;
  confidence: number; // 0-1
  scores: Record<CaptureType, number>;
}

export interface PriorityItem {
  id: string;
  domain: Domain;
  severity: Severity;
  title: string;
  context: string;
  suggestedAction: string;
  sourceType: "finding" | "decision" | "notification" | "oneonone";
  sourceId: string;
}

export interface UpcomingItem {
  id: string;
  date: string;
  type: "one_on_one" | "decision" | "playbook";
  title: string;
  overdue: boolean;
}
