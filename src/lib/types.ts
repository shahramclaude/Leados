// src/lib/types.ts
// Shared types for the pt-U "Attention Optimizer" delivery.
// ORIGINAL to this sandbox. See AI-SESSION-LOG.md for what was and was not
// verified against github.com/wbweve/Leados before this was written.

export type Category =
  | "people"
  | "finance"
  | "ops"
  | "strategy"
  | "legal"
  | "product";

export const CATEGORIES: Category[] = [
  "people",
  "finance",
  "ops",
  "strategy",
  "legal",
  "product",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  people: "People",
  finance: "Finance",
  ops: "Operations",
  strategy: "Strategy",
  legal: "Legal",
  product: "Product",
};

// Rule IDs R1/R4/R7/R10/R17/R73/R88/R103/R104 are deliberately reused from
// the task's pasted "pt-U" brief so its own named examples (growth-plan
// dependency, LTV:CAC dependency chain) stay explorable here. They are NOT
// claimed to come from any verified rule engine in the real repo — none was
// found. All other rule IDs below and all titles/categories are invented for
// this delivery.
export interface RuleDef {
  rule: string;
  category: Category;
  title: string;
  baseSev: 1 | 2 | 3 | 4 | 5;
  playId: PlaybookId;
  personLinked?: boolean;
}

export type PlaybookId =
  | "oneonone-bundle"
  | "termination-prep"
  | "pl-review"
  | "sprint-plan"
  | "board-narrative"
  | "crisis-response"
  | "contract-review"
  | "roadmap-sync";

export interface Finding {
  key: string; // unique instance key
  rule: string;
  category: Category;
  title: string;
  sev: 1 | 2 | 3 | 4 | 5;
  score: number; // sev-weighted score used as "benefit" proxy
  sources: string[]; // synthetic signal ids this finding touches, used for overlap/leverage proxy
  person?: string;
  active: boolean;
}

export interface CircadianProfile {
  phase: string;
  label: string;
  analytical: number; // 0..1
  workingMemory: number; // 0..1
  note: string;
}

export interface AttentionItem {
  key: string;
  finding: Finding;
  benefit: number;
  timeHours: number;
  cogLoad: number;
  urgency: number; // days until escalation; 0 = immediate
  dependencies: string[]; // rule IDs that must be addressed first
  roi: number;
  playId: PlaybookId | null;
  label: string;
}

export interface AttentionConstraints {
  availableHours: number;
  maxCogLoad: number;
  temperature: number;
  coolingRate: number;
  iterations: number;
}

export interface AttentionPlanResult {
  sequence: AttentionItem[];
  totalBenefit: number;
  totalHours: number;
  totalCogLoad: number;
  utilizationHours: number;
  utilizationCog: number;
  deferred: AttentionItem[];
  iterations: number;
  label: string;
}

export interface WeeklyAttentionPlan extends AttentionPlanResult {
  scheduled: Record<string, AttentionItem[]>;
  weekSummary: string;
}
