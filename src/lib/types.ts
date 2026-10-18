// ---------------------------------------------------------------------------
// Shared contracts for the Leados command center. Every API route and every
// view imports from here — nothing is typed inline so the orchestrator
// payload shape only has one source of truth.
// ---------------------------------------------------------------------------

/** The fixed 8-domain taxonomy. Order here is the fixed radar axis order. */
export const DOMAINS = [
  "people",
  "risk",
  "pipeline",
  "finance",
  "product",
  "customer",
  "strategy",
  "operations",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  people: "People",
  risk: "Risk",
  pipeline: "Pipeline",
  finance: "Finance",
  product: "Product",
  customer: "Customer",
  strategy: "Strategy",
  operations: "Operations",
};

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface Finding {
  id: string;
  ruleKey: string;
  domain: Domain;
  severity: Severity;
  title: string;
  description: string;
  probability: number | null;
  causalChainId: string | null;
  amplificationFactor: number | null;
  dismissed: boolean;
  createdAt: string;
}

export interface RuleEvaluation {
  ruleKey: string;
  domain: Domain;
  title: string;
  score: number;
  severity: Severity;
  /** Last up-to-7 score values, oldest first, used for sparklines. */
  history: number[];
  evaluatedAt: string;
}

export interface DomainScore {
  domain: Domain;
  score: number;
  priorScore: number;
}

export interface CausalChain {
  id: string;
  description: string;
  ruleKeys: string[];
  amplificationFactor: number;
}

export interface RiskItem {
  id: number;
  title: string;
  domain: Domain;
  probability: number;
  impact: number;
  amplificationFactor: number | null;
  causalChainId: string | null;
}

export interface PersonRisk {
  id: number;
  name: string;
  role: string;
  flightRiskProbability: number;
  burnoutIndex: number;
  cadenceHealth: number;
  lastOneOnOneAt: string | null;
}

export type DecisionStatus = "open" | "overdue" | "resolved";

export interface DecisionItem {
  id: number;
  title: string;
  owner: string;
  status: DecisionStatus;
  openedAt: string;
  dueAt: string;
  resolvedAt: string | null;
  cycleTimeDays: number | null;
  overdue: boolean;
}

export type HypothesisStatus = "open" | "confirmed" | "refuted";

export interface Hypothesis {
  id: number;
  statement: string;
  domain: Domain;
  status: HypothesisStatus;
  openedAt: string;
  resolveBy: string;
  resolvedAt: string | null;
  outcome: string | null;
  daysToResolve: number;
}

/** Severity heatmap cell: the max severity active for a domain on a day. */
export interface HeatmapCell {
  domain: Domain;
  date: string;
  maxSeverity: Severity | 0;
}

/**
 * The full orchestrator payload. `GET /api/orchestrate` and
 * `POST /api/orchestrate` both resolve this shape. The SSE stream's
 * `findings_delta` event carries a `Partial<OrchestratorResult>` that a
 * consumer merges into the last known full result.
 */
export interface OrchestratorResult {
  generatedAt: string;
  orgHealthScore: number;
  priorOrgHealthScore: number;
  domainScores: DomainScore[];
  findings: Finding[];
  ruleEvaluations: RuleEvaluation[];
  causalChains: CausalChain[];
  risks: RiskItem[];
  people: PersonRisk[];
  decisions: DecisionItem[];
  decisionHealthIndex: number;
  cycleTimeTrend: number[];
  heatmap: HeatmapCell[];
  /** ruleKey -> playbook slug, used to render "-> playbook" links. */
  playbooks: Record<string, string>;
}

/** Payload shape emitted on the SSE `findings_delta` event. */
export interface FindingsDeltaEvent {
  type: "findings_delta";
  generatedAt: string;
  orgHealthScore: number;
  priorOrgHealthScore: number;
  domainScores: DomainScore[];
  findings: Finding[];
  ruleEvaluations: RuleEvaluation[];
  heatmap: HeatmapCell[];
}
