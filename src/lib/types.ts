// Shared type definitions for the Unified Intelligence Core.
//
// Every report produced by a pipeline stage in src/lib/orchestrator.ts is
// typed here. No `any`, no type assertions. Timestamps are ISO-8601 strings
// (not Date instances) so results serialize cleanly to JSONB / SSE payloads.

export type Domain =
  | "workload"
  | "sentiment"
  | "retention"
  | "culture"
  | "engagement"
  | "collaboration"
  | "performance"
  | "risk";

export type Severity = 1 | 2 | 3 | 4 | 5;

export type BeliefKey = "flight_risk" | "burnout" | "disengagement";

export type RiskBand = "low" | "moderate" | "elevated" | "high" | "critical";

// --- Stage 1: rule evaluation (src/lib/engine.ts) -----------------------

export interface Finding {
  id: number;
  ruleId: string;
  domain: Domain;
  personId: number | null;
  teamId: string | null;
  severity: Severity;
  message: string;
  evidence: Record<string, number | string>;
  active: boolean;
  createdAt: string;
}

export interface RuleEvaluationResult {
  computedAt: string;
  rulesEvaluated: number;
  peopleEvaluated: number;
  findings: Finding[];
}

// --- Stage 2: Bayesian belief updates (src/lib/bayesianNetwork.ts) ------

export interface BeliefNode {
  personId: number;
  nodeKey: BeliefKey;
  priorProbability: number;
  probability: number;
  evidenceCount: number;
  updatedAt: string;
}

export interface BayesianUpdateResult {
  computedAt: string;
  beliefs: BeliefNode[];
}

// --- Stage 3: causal chain detection (src/lib/causalChain.ts) -----------

export interface CausalLink {
  fromDomain: Domain;
  toDomain: Domain;
  occurrences: number;
  averageLagDays: number;
  confidence: number;
}

export interface CausalChainResult {
  computedAt: string;
  chains: CausalLink[];
}

// --- Stage 4: signal fusion (src/lib/signalFusion.ts) --------------------

export interface FusedSignal {
  personId: number;
  riskScore: number;
  findingContribution: number;
  beliefContribution: number;
  causalContribution: number;
  contributingDomains: Domain[];
}

export interface SignalFusionResult {
  computedAt: string;
  fusedSignals: FusedSignal[];
  orgFusedScore: number;
}

// --- Stage 5: predictive scoring (src/lib/predictiveScoring.ts) ---------

export interface PersonRiskScore {
  personId: number;
  score: number;
  band: RiskBand;
  drivers: string[];
}

export interface BurnoutRiskResult {
  computedAt: string;
  scores: PersonRiskScore[];
  orgAverage: number;
}

export interface FlightRiskResult {
  computedAt: string;
  scores: PersonRiskScore[];
  orgAverage: number;
}

// --- Stage 6: decision health index (src/lib/metricsEngine.ts) ----------

export interface DecisionHealthComponent {
  label: string;
  value: number;
  weight: number;
}

export interface DecisionHealthIndex {
  computedAt: string;
  score: number;
  components: DecisionHealthComponent[];
}

// --- Stage 7: knowledge graph (src/lib/knowledgeGraph.ts) ---------------

export type GraphNodeType = "person" | "team" | "domain";
export type GraphEdgeKind = "causal" | "finding" | "collaboration";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: GraphEdgeKind;
}

export interface OrgNetworkReport {
  computedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  density: number;
}

// --- Stage 8: narrative synthesis (src/lib/synthesis.ts / narrativeIntel.ts)

export interface NarrativeItem {
  id: string;
  title: string;
  summary: string;
  domain: Domain | "org";
  severity: Severity;
  relatedPersonIds: number[];
}

export interface NarrativeReport {
  computedAt: string;
  narratives: NarrativeItem[];
}

// --- Stage 9: scenario scoring (src/lib/scenarioEngine.ts) ---------------

export interface ScenarioScore {
  id: string;
  name: string;
  description: string;
  likelihood: number;
  impactScore: number;
  exposure: number;
  affectedPersonIds: number[];
}

export interface ScenarioReport {
  computedAt: string;
  scenarios: ScenarioScore[];
}

// --- Legacy-shaped aggregate (what /api/intelligence historically returned)

export interface IntelligenceReport {
  computedAt: string;
  ruleEvaluation: RuleEvaluationResult;
  bayesian: BayesianUpdateResult;
  causal: CausalChainResult;
  fusion: SignalFusionResult;
}

// --- Orchestrator -----------------------------------------------------

export interface OrgHealthWeights {
  ruleSeverity: number;
  belief: number;
  causal: number;
  fusion: number;
  burnout: number;
  flightRisk: number;
  decisionHealth: number;
  network: number;
  scenario: number;
}

export interface StageTiming {
  stage: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
}

/**
 * OrchestratorResult is the single unified payload produced by
 * runFullOrchestration(). It is a strict union (intersection, in TS terms)
 * of every sub-engine's report plus pipeline metadata.
 */
export interface OrchestratorResult {
  generatedAt: string;
  orgHealthScore: number;
  weights: OrgHealthWeights;
  timings: StageTiming[];
  intelligence: IntelligenceReport;
  burnout: BurnoutRiskResult;
  flightRisk: FlightRiskResult;
  decisionHealth: DecisionHealthIndex;
  network: OrgNetworkReport;
  narratives: NarrativeReport;
  scenarios: ScenarioReport;
}
