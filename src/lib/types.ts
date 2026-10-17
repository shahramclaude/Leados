// src/lib/types.ts
// Original type layer for this sandbox build. Not copied from any verified
// file in github.com/wbweve/Leados (see AI-SESSION-LOG.md).

export type Category =
  | "STRATEGIC"
  | "OPERATIONAL"
  | "FINANCIAL"
  | "PEOPLE"
  | "GOVERNANCE"
  | "MARKET"
  | "REPUTATIONAL"
  | "RESILIENCE";

export const CATEGORIES: Category[] = [
  "STRATEGIC",
  "OPERATIONAL",
  "FINANCIAL",
  "PEOPLE",
  "GOVERNANCE",
  "MARKET",
  "REPUTATIONAL",
  "RESILIENCE",
];

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface RuleDef {
  id: string; // "R1".."R100", bare IDs, non-contiguous by design
  title: string;
  category: Category;
  sev: 1 | 2 | 3 | 4 | 5;
  personLinkable?: boolean;
  polarity?: "positive"; // marks a small number of intentionally "healthy signal" rules
}

export interface ToggleLogEntry {
  ruleId: string;
  active: boolean;
  ts: number; // epoch ms
}

export interface SignalState {
  ruleId: string;
  active: boolean;
  sev: 1 | 2 | 3 | 4 | 5;
  personId?: string;
  lastToggledAt: number;
}

export interface OrgEvent {
  id: string;
  ts: number; // epoch ms
  type: string; // event type, substrate for Shannon entropy
  category: Category;
  personId?: string;
  direction?: "in" | "out"; // used for bottleneck ("information in") detection
}

export interface AppState {
  version: number;
  signals: Record<string, SignalState>;
  toggleLog: ToggleLogEntry[];
  people: Person[];
  runwayMonths: number;
  events: OrgEvent[];
}

export interface Finding {
  key: string; // ruleId, or ruleId:personId when linked
  ruleId: string;
  title: string;
  category: Category;
  sev: 1 | 2 | 3 | 4 | 5;
  score: number;
  personId?: string;
  ts: number;
  polarity?: "positive";
}
