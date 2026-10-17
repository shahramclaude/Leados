// Original to this delivery. Not copied from github.com/wbweve/Leados
// (verified absent there — see AI-SESSION-LOG.md).

export type DimensionKey =
  | "PEOPLE_SYSTEMS"
  | "FINANCIAL_INTELLIGENCE"
  | "OPERATIONAL_MATURITY"
  | "STRATEGIC_CLARITY"
  | "GOVERNANCE_MATURITY"
  | "ANALYTICAL_MATURITY"
  | "RESILIENCE_MATURITY"
  | "CULTURE_MATURITY"
  | "SELF_AWARENESS_MATURITY"
  | "INNOVATION_MATURITY"
  | "EXECUTION_MATURITY"
  | "MARKET_INTELLIGENCE";

export interface OrgEvent {
  id: string;
  type: string;
  ts: number; // days since epoch-ish counter, synthetic
  personId?: string;
  data?: Record<string, unknown>;
}

export interface DimensionDef {
  key: DimensionKey;
  name: string;
  short: string;
  levels: [string, string, string, string, string]; // level1..level5 labels
  score: (events: OrgEvent[]) => number;
}

export interface DimensionResult {
  key: DimensionKey;
  name: string;
  score: number;
  maxScore: 5;
  label: string;
  nextLevel: string;
  gap: number;
}

export interface PatternResult {
  name:
    | "ADVANCED_LEADER"
    | "BALANCED_PRACTITIONER"
    | "SPECIALIST"
    | "EMERGING_PRACTITIONER"
    | "BEGINNING";
  description: string;
}

export interface MaturityProfile {
  dimensions: Record<DimensionKey, DimensionResult>;
  meanMaturity: number;
  variance: number;
  pattern: PatternResult;
  priorityGaps: { key: DimensionKey; name: string; score: number; gap: number }[];
}

export interface EventCatalogItem {
  type: string;
  label: string;
  dimensions: DimensionKey[];
  hint: string;
}

export interface AppState {
  events: OrgEvent[];
  orgName: string;
  presetApplied: string | null;
}
