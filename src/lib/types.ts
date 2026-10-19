// ─────────────────────────────────────────────────────────────
// LEADOS core domain types — org physics data model
// ─────────────────────────────────────────────────────────────

export type DomainKey =
  | "finance"
  | "people"
  | "strategy"
  | "ops"
  | "rd"
  | "compliance"
  | "manufacturing"
  | "cs";

export type Severity = 1 | 2 | 3 | 4 | 5;

export type RiskProfile = "green" | "amber" | "red" | "critical";

/** One point in a domain's historical score series, used to draw the
 *  "ghost" polygon on the radar (score N days ago). */
export interface DomainHistoryPoint {
  daysAgo: number;
  score: number; // 0-10
}

export interface Domain {
  key: DomainKey;
  name: string;
  /** CSS variable name (without var()) holding this domain's fixed hue */
  colorVar: string;
  score: number; // 0-10 current composite score
  velocity: number; // signed score delta / week, e.g. +0.4 or -0.9
  dataDensity90d: number; // # of source events in the last 90 days
  history: DomainHistoryPoint[];
}

export interface Finding {
  id: string;
  domain: DomainKey;
  sev: Severity;
  ruleId: string;
  title: string;
  basis: string;
  confidence: number; // 0-1
  timestamp: string; // ISO string
  suggestedPlaybook?: string;
  /** If this finding is being amplified by an upstream cascade */
  cascadeFromRuleId?: string;
  amplificationFactor?: number;
}

export interface Decision {
  id: string;
  title: string;
  domain: DomainKey;
  deadline: string; // ISO
}

export type HypothesisStatus = "open" | "confirmed" | "refuted";

export interface Hypothesis {
  id: string;
  title: string;
  status: HypothesisStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface CausalLink {
  fromRuleId: string;
  fromRuleLabel: string;
  toRuleId: string;
  toRuleLabel: string;
  lagDays: number;
  amplificationFactor: number;
  confidence: number; // 0-1
  strength: number; // 0-1, used for bar length
}

export interface OrgDataset {
  domains: Domain[];
  findings: Finding[];
  decisions: Decision[];
  hypotheses: Hypothesis[];
  causalLinks: CausalLink[];
  lastRunAt: string; // ISO
}
