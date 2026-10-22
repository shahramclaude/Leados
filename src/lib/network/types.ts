// LEADOS Part 31 — Ecosystem Intelligence shared types.
// Pure data shapes, no DB/runtime imports, so the metric library stays testable
// in isolation (Phase 3 requirement: "tested pure functions").

export type NodeType =
  | "internal_person"
  | "internal_team"
  | "partner"
  | "supplier"
  | "customer"
  | "regulator";

export type EdgeType =
  | "employs"
  | "reports_to"
  | "depends_on"
  | "partners_with"
  | "serves"
  | "regulated_by"
  | "supplies";

export type EvidenceClass =
  | "verified_primary"
  | "verified_secondary"
  | "self_reported"
  | "inferred";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  isExternal: boolean;
  personId?: string | null;
  scopeTags: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edgeType: EdgeType;
  /** 0..1 — how material this dependency is. */
  strength: number;
  /** 0..1 — 0 = irreplaceable, 1 = freely substitutable. */
  substitutability: number;
  evidenceClass: EvidenceClass;
  evidenceRefs: string[];
}

export interface EcosystemGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Edge types treated as "directed dependency" edges for critical-path analysis. */
export const DEPENDENCY_EDGE_TYPES: ReadonlySet<EdgeType> = new Set([
  "depends_on",
  "reports_to",
  "supplies",
  "regulated_by",
]);

export interface CentralityResult {
  nodeId: string;
  degree: number;
  inDegree: number;
  outDegree: number;
  betweenness: number;
  eigenvector: number;
}

export interface ShareInput {
  key: string;
  amount: number;
}

export interface HhiResult {
  hhi: number;
  topShare: number;
  shares: { key: string; share: number }[];
  /** Standard thresholds, US DOJ/FTC style bands adapted for internal concentration risk. */
  band: "low" | "moderate" | "high";
}

export interface SkillCoverageInput {
  personId: string;
  capacity: number;
  isPrimary: boolean;
}

export interface BusFactorResult {
  capability: string;
  busFactor: number;
  totalCapacity: number;
  requiredCapacity: number;
  criticalPeople: string[];
}

export interface BlastRadiusNode {
  nodeId: string;
  hops: number;
  /** Estimated days to recover this node's function, given substitutability decay. */
  estimatedRecoveryDays: number;
}

export interface BlastRadiusResult {
  removedNodeId: string;
  affected: BlastRadiusNode[];
  maxRecoveryDays: number;
  totalAffectedNodes: number;
}

export interface ChokePointResult {
  source: string;
  sink: string;
  minCutValue: number;
  cutEdgeIds: string[];
}
