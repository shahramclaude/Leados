// Shared types for this sandbox.
// NOTE ON PROVENANCE: this entire file (and every file under src/lib and
// src/components) is original work written for THIS delivery. None of it is
// copied from github.com/wbweve/Leados. See ProvenanceView.tsx / the
// AI-SESSION-LOG.md / README.md "Verification ledger" for exactly what was
// inspected in that repo and why nothing from it was ported byte-for-byte.

export type Domain = "people" | "finance" | "ops" | "strategy" | "legal" | "product";

export const DOMAINS: Domain[] = ["people", "finance", "ops", "strategy", "legal", "product"];

export const DOMAIN_LABEL: Record<Domain, string> = {
  people: "People",
  finance: "Finance",
  ops: "Ops",
  strategy: "Strategy",
  legal: "Legal",
  product: "Product",
};

export type Severity = "low" | "medium" | "high" | "critical";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];

export interface Person {
  id: string;
  name: string;
  role: string;
  cadenceDays: number; // expected 1:1 cadence
  lastOneOnOne: string; // ISO date
  lastFeedback: string | null; // ISO date
  lastFeedbackSentiment: "positive" | "neutral" | "negative" | null;
}

export interface DecisionItem {
  id: string;
  domain: Domain;
  title: string;
  loggedAt: string;
  reviewBy: string;
  outcome: "validated" | "reversed" | null;
}

export interface GoalItem {
  id: string;
  domain: Domain;
  title: string;
  ownerId: string | null;
  lastUpdate: string;
}

export interface VendorItem {
  id: string;
  name: string;
  renewalDue: string;
  counterpartRespondedAt: string | null;
}

export interface Metrics {
  budgetVariancePct: number; // + = over budget
  deployFreqDeltaPct: number; // - = slower deploys
  churnDeltaPct: number; // + = more churn
}

export interface AppState {
  people: Person[];
  decisions: DecisionItem[];
  goals: GoalItem[];
  vendors: VendorItem[];
  metrics: Metrics;
  settings: {
    oneOnOneCadenceDefault: number;
    feedbackGapDays: number;
  };
  meta: {
    createdAt: string;
    idSeq: number;
  };
}

export type RuleId =
  | "ONE_ON_ONE_OVERDUE"
  | "FEEDBACK_GAP"
  | "BURNOUT_RISK"
  | "DECISION_STALE"
  | "GOAL_OWNERLESS"
  | "GOAL_STALE"
  | "VENDOR_RENEWAL_AT_RISK"
  | "BUDGET_OVERRUN"
  | "DEPLOY_FREQ_DROP"
  | "CHURN_UPTICK"
  | "DOMAIN_CONCENTRATION";

export interface Finding {
  key: string; // stable id for this finding instance
  rule: RuleId;
  domain: Domain | "org";
  title: string;
  detail: string;
  severity: Severity;
  ageDays: number; // how far past threshold / how overdue, >= 0
  sourceIds: string[]; // ids of underlying records this finding is about
}

export interface DomainScore {
  domain: Domain;
  score: number;
  openFindings: number;
  bucket: "clear" | "moderate" | "elevated" | "critical";
}

export interface Projection {
  findings: Finding[];
  domainScores: DomainScore[];
  overallScore: number;
}
