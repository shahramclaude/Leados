// Part 8 — Knowledge Architecture
// Shared types for the knowledge graph, institutional memory digest, and the
// adaptive playbooks engine. Kept framework-agnostic so both server (API
// routes) and client (views) can import from here.

export type NodeType =
  | "person"
  | "decision"
  | "finding"
  | "insight"
  | "belief"
  | "playbook"
  | "domain";

export type RelationType =
  | "caused"
  | "resolved"
  | "informed"
  | "triggered"
  | "blocked"
  | "created";

export type Domain =
  | "people"
  | "risk"
  | "finance"
  | "strategy"
  | "operations"
  | "culture"
  | "customer"
  | "compliance";

export const ALL_DOMAINS: Domain[] = [
  "people",
  "risk",
  "finance",
  "strategy",
  "operations",
  "culture",
  "customer",
  "compliance",
];

export interface MemoryNode {
  id: number;
  key: string;
  type: NodeType;
  label: string;
  domain: Domain | string;
  severity: number | null;
  tags: string[];
  importance: number;
  metadata: Record<string, unknown>;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface MemoryEdge {
  id: number;
  sourceId: number;
  targetId: number;
  relation: RelationType;
  weight: number;
  createdAt: string; // ISO
}

export interface GraphSubgraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  generatedAt: string;
  windowDays: number;
}

// ---------------------------------------------------------------------------
// Findings / beliefs (minimal shapes — these would normally come from the
// earlier parts of the Leados pipeline: rule evaluation + belief fabric).
// ---------------------------------------------------------------------------
export interface Finding {
  id: number;
  key: string;
  ruleKey: string;
  title: string;
  description: string;
  domain: Domain | string;
  severity: number; // 1-5
  tags: string[];
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export interface BeliefFabricResult {
  posteriors: Record<string, number>;
  priorShift?: number;
  cascadeRisk?: { p: number; description?: string };
}

// ---------------------------------------------------------------------------
// Root cause analysis
// ---------------------------------------------------------------------------
export interface RootCauseAnalysis {
  finding: MemoryNode;
  causalChain: MemoryNode[];
  rootNodes: MemoryNode[];
  contributingDecisions: MemoryNode[];
  affectedPeople: MemoryNode[];
  confidenceDecay: number;
  narrative: string;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------
export interface PatternMatch {
  node: MemoryNode;
  similarity: number;
  resolvedHow: string | null;
  resolutionDays: number | null;
}

// ---------------------------------------------------------------------------
// Institutional memory digest
// ---------------------------------------------------------------------------
export interface DecisionLedgerEntry {
  id: number;
  key: string;
  label: string;
  domain: Domain | string;
  outcome: boolean | null;
  daysToOutcome: number | null;
  confidenceAtDecision: number;
  confidenceError: number | null; // |actual - predicted|
}

export interface RepeatingPattern {
  ruleKey: string;
  label: string;
  domain: Domain | string;
  occurrences: number;
  avgSeverity: number;
  avgResolutionDays: number | null;
  trend: "worsening" | "improving" | "flat";
}

export interface KnowledgeGap {
  domain: Domain | string;
  nodeCount: number;
  mostRecentNodeAgeDays: number | null;
  reason: "too_few_nodes" | "stale" | "both";
}

export interface InstitutionalMemoryDigest {
  decisionsWithOutcomes: DecisionLedgerEntry[];
  repeatingPatterns: RepeatingPattern[];
  unresolvedChronicIssues: MemoryNode[];
  knowledgeHalfLife: number; // days
  topKnowledgeGaps: KnowledgeGap[];
}

// ---------------------------------------------------------------------------
// Adaptive playbooks
// ---------------------------------------------------------------------------
export type PlaybookUrgency = "immediate" | "this_week" | "this_month";
export type ResponsibleParty = "leader" | "manager" | "hr" | "finance" | "system";

export interface AdaptiveStep {
  order: number;
  title: string;
  responsible: ResponsibleParty;
  timeboxDays: number;
  automaticallyDone: boolean;
  automationAction: string | null;
}

export interface AdaptivePlaybook {
  name: string;
  description: string;
  urgency: PlaybookUrgency;
  steps: AdaptiveStep[];
  expectedOutcome: string;
  successMetric: string;
  failureSignal: string;
  basedOnPastPattern: PatternMatch | null;
  confidenceScore: number;
}
