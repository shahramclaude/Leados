// src/lib/types.ts
//
// BOOTSTRAP NOTE (Part 1): this repository contained no src/lib directory at
// all prior to this change (verified via list_files/read_file — see task
// response). There is therefore no pre-existing type hierarchy to import
// from. This file is the single shared type root; every other lib/* file
// imports from here and nothing else defines a parallel hierarchy.

// ─────────────────────────────────────────────────────────────────────────
// Primitive domain types
// ─────────────────────────────────────────────────────────────────────────

export type ISODateString = string;

/** A raw, immutable fact ingested from any connected system (HRIS, calendar,
 * ticketing, decision log, finance, board deck parser, pulse survey, etc).
 * `type` is a dotted namespace, e.g. "decision.action_item.overdue".
 */
export interface LeadosEvent {
  id: string;
  type: string;
  occurredAt: Date | ISODateString;
  personId?: string;
  teamId?: string;
  projectId?: string;
  data?: Record<string, unknown>;
}

export type SeniorityLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export interface LeadosPerson {
  id: string;
  name: string;
  teamId?: string;
  level?: SeniorityLevel;
  startDate?: Date | ISODateString;
  hasSuccessor?: boolean;
  /** Percent of working calendar booked in meetings, 0-100. */
  calendarLoadPct?: number;
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
  /** Delivery confidence, 0-1. */
  confidence: number;
}

export interface NpsSnapshot {
  takenAt: Date | ISODateString;
  score: number;
}

/** Aggregated/derived metrics that are not reasonably reconstructed from a
 * single event by itself (rollups owned by other subsystems).
 */
export interface LeadosMetrics {
  decisionHealthIndex: DecisionHealthIndex;
  orgNetwork: OrgNetwork;
  projectConfidenceSnapshots: ProjectConfidenceSnapshot[];
  npsSnapshots: NpsSnapshot[];
}

// ─────────────────────────────────────────────────────────────────────────
// Bayesian network node identifiers
// ─────────────────────────────────────────────────────────────────────────

/** Original 2-node latent set (baseline network, bootstrapped in this PR
 * because no prior bayesianNetwork.ts existed in the repository).
 */
export const LEGACY_LATENT_NODES = ["flightRisk", "strategyRisk"] as const;
export type LegacyLatentNodeId = (typeof LEGACY_LATENT_NODES)[number];

/** Part-1 expansion: 8 additional latent nodes -> 10 total. */
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

/** Original 6-node observable set (bootstrapped, see note above). */
export const LEGACY_OBSERVABLE_NODES = [
  "cadenceSlip",
  "moralePulse",
  "runwayMonths",
  "compGapSignal",
  "peerAttritionSignal",
  "sentimentDrop",
] as const;
export type LegacyObservableNodeId = (typeof LEGACY_OBSERVABLE_NODES)[number];

/** Part-1 expansion: 16 additional observable nodes -> 22 total. */
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

// ─────────────────────────────────────────────────────────────────────────
// Bayesian network primitives
// ─────────────────────────────────────────────────────────────────────────

/** Marginal belief for a single node after noisy-OR propagation. */
export interface NodeMarginal {
  /** Posterior probability the node is in its "elevated/true" state, 0-1. */
  p: number;
  /** Evidentiary confidence in that estimate, 0-1 (see bayesianNetwork.ts). */
  confidence: number;
}

/** A causal-power edge into a noisy-OR node. `q` is the probability that
 * this parent alone, if present, would activate the child ("causal power",
 * Pearl 1988 §4.3.2). Every q value in this codebase is a DESIGN PARAMETER
 * unless otherwise cited.
 */
export interface CausalParent<TParentId extends string = string> {
  nodeId: TParentId;
  q: number;
}

export interface NoisyOrNode<
  TId extends string = string,
  TParentId extends string = string,
> {
  id: TId;
  /** Leak probability: P(child=1) when every parent is absent. */
  leak: number;
  prior: number;
  parents: CausalParent<TParentId>[];
}

/** Original (legacy) 2-node posterior shape, preserved for callers that
 * only know about the pre-expansion network.
 */
export type BeliefNetworkPosteriors = Record<LegacyLatentNodeId, NodeMarginal>;

/** Full Part-1 belief-fabric result. Every subsequent stage of the
 * orchestrator consumes this object.
 */
export interface BeliefFabricResult {
  posteriors: Record<LatentNodeId, NodeMarginal>;
  observables: Record<ObservableNodeId, number>;
  cascadeRisk: NodeMarginal;
  dominantRisk: LatentNodeId;
  dominantRiskDetail: string;
  generatedAt: ISODateString;
}

// ─────────────────────────────────────────────────────────────────────────
// Causal chain (Markov) types
// ─────────────────────────────────────────────────────────────────────────

export interface CausalEdge {
  from: string;
  to: string;
  /** Empirical transition probability P(next=to | current=from). */
  probability: number;
  /** Number of observed transitions backing this edge. */
  support: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Knowledge graph taxonomy
// ─────────────────────────────────────────────────────────────────────────

export type MemoryNodeType =
  | "person"
  | "team"
  | "insight"
  | "finding"
  | "risk"
  | "decision"
  | "project";

export type RelationType =
  | "triggered"
  | "caused"
  | "correlates"
  | "mitigates"
  | "supports"
  | "contradicts"
  | "reportsTo"
  | "memberOf";

export interface MemoryNode {
  id: number;
  type: MemoryNodeType;
  key: string;
  label: string;
  metadata: Record<string, unknown>;
  createdAt: Date | ISODateString;
}

export interface MemoryEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  relation: RelationType;
  metadata: Record<string, unknown>;
  createdAt: Date | ISODateString;
}

// ─────────────────────────────────────────────────────────────────────────
// Belief drift tracking
// ─────────────────────────────────────────────────────────────────────────

export interface BeliefTrajectoryPoint {
  date: ISODateString;
  p: number;
  confidence: number;
}

export interface BeliefDriftResult {
  drifting: boolean;
  ratePerDay: number;
  projectedCrossing: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator-level result
// ─────────────────────────────────────────────────────────────────────────

export interface IntelligenceSynthesis {
  beliefs: BeliefFabricResult;
  causalEdges: CausalEdge[];
  fusedSignals: Record<string, number>;
  // Intentionally loosely typed here (unknown shape at the types-root
  // level) to avoid a parallel type hierarchy with talentEngine.ts /
  // financeEngine.ts / executionEngine.ts, which own their concrete result
  // shapes. orchestrator.ts assigns the concrete engine result types,
  // which are structurally compatible records of primitives.
  talent: object;
  finance: object;
  execution: object;
  narrative: string[];
  generatedAt: ISODateString;
}
