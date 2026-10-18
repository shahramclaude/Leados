// ─────────────────────────────────────────────────────────────────────────
// Shared types for the LeadOS probabilistic intelligence layer.
//
// `Finding` and `Person` are kept as stable, backward-compatible exports —
// every other module in src/app and src/lib that rendered the old flat
// rule-engine output can keep importing them unchanged.
// ─────────────────────────────────────────────────────────────────────────

export type Domain = "people" | "finance" | "sales" | "ops" | "strategy";

export type Severity = 1 | 2 | 3 | 4 | 5;

/**
 * The closed set of raw signal types the event log accepts. Every
 * probabilistic module below (Bayesian network, fusion, causal chains,
 * predictive scoring) is written against this vocabulary.
 */
export type EventType =
  | "people.oneonone.logged"
  | "people.pulse.logged"
  | "people.feedback.logged"
  | "people.comp.reviewed"
  | "hr.flightrisk.flag"
  | "hr.attrition"
  | "engagement.decline"
  | "decision.logged"
  | "decision.escalate"
  | "decision.resolved"
  | "ops.incident"
  | "sales.pipeline.snapshot"
  | "pipeline.thin"
  | "fin.runway.snapshot"
  | "fin.runway.drop"
  | "fin.pl.logged"
  | "strategy.okr.review";

export type PersonId = string;

/** Backward-compatible Person shape (id normalized to string everywhere). */
export interface Person {
  id: PersonId;
  name: string;
  role: string;
  team: string;
  tenureStartAt: Date;
}

export interface LeadosEvent {
  id: string;
  type: EventType;
  domain: Domain;
  personId: PersonId | null;
  data: Record<string, unknown>;
  occurredAt: Date;
}

/** Backward-compatible Finding shape, extended with an optional posterior. */
export interface Finding {
  key: string;
  rule: string;
  domain: Domain;
  sev: Severity;
  personId?: PersonId;
  personName?: string;
  title: string;
  detail: string;
  /** Posterior probability (0-1) backing this finding, when derived from the belief network. */
  probability?: number;
}

// ───────────────────────── Bayesian belief network ─────────────────────────

export type ObservableNodeId =
  | "cadenceSlip"
  | "moralePulse"
  | "flightRiskFlag"
  | "decisionBacklogAge"
  | "pipelineCoverage"
  | "runwayMonths";

export type LatentNodeId = "flightRisk" | "strategyRisk";

export type NodeId = ObservableNodeId | LatentNodeId;

export interface NodeMarginal {
  /** P(node = elevated-risk state), in [0, 1]. */
  p: number;
  /** Confidence in that estimate, in [0, 1], driven by evidence volume/recency. */
  confidence: number;
}

export type BeliefNetworkPriors = Record<NodeId, number>;

export type BeliefNetworkPosteriors = Record<NodeId, NodeMarginal>;

// ───────────────────────── Signal fusion ─────────────────────────

export type DomainWeights = Record<Domain, number>;

export interface OrgHealthScore {
  /** 0-100 composite organizational health score. */
  composite: number;
  /** 0-100 score per domain. */
  breakdown: Record<Domain, number>;
  trend: "up" | "flat" | "down";
  /** 0-1 confidence in the composite, driven by evidence volume/recency. */
  confidence: number;
}

// ───────────────────────── Causal chains ─────────────────────────

export interface CausalChain {
  path: EventType[];
  avgLagDays: number;
  occurrences: number;
  nextLikely: EventType;
  /** 0-1 empirical confidence (conditional frequency) behind this chain. */
  confidence: number;
}

// ───────────────────────── Predictive scoring ─────────────────────────

export type RiskHorizon = "30d" | "90d";

export interface FlightRiskScore {
  personId: PersonId;
  score: number; // 0-1
  drivers: string[];
  horizon: RiskHorizon;
}

export interface BurnoutRiskIndex {
  value: number; // 0-1 org-wide
  hotspots: PersonId[];
  evidence: string[];
}

export interface DecisionHealthIndex {
  stale: number;
  velocityTrend: "accelerating" | "decelerating";
  blockedCount: number;
}

// ───────────────────────── Intelligence report ─────────────────────────

export interface IntelligenceReport {
  generatedAt: string;
  healthScore: OrgHealthScore;
  findings: Finding[];
  causalChains: CausalChain[];
  predictions: {
    flightRisk: FlightRiskScore[];
    burnoutIndex: BurnoutRiskIndex;
    decisionHealth: DecisionHealthIndex;
  };
  counts: {
    critical: number;
    major: number;
    minor: number;
    findings: number;
  };
}

export interface AppState {
  events: LeadosEvent[];
  roster: Person[];
}
