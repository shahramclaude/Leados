// Core decision model shared across the Leados strategic layer.

export type DecisionDomain = "revenue" | "product" | "people" | "capital" | "gtm" | "operations";
export type DecisionStatus = "proposed" | "approved" | "rejected" | "deferred" | "executed";
export type DoorType = "one_way" | "two_way";

export interface PreMortemPrompt {
  prompt: string;
  answer?: string;
}

export const DEFAULT_PRE_MORTEM_PROMPTS: string[] = [
  "It's 12 months from now and this decision failed badly. What happened?",
  "What assumption, if wrong, breaks this decision the most?",
  "Who would have seen this failure coming, and what did they know that we don't?",
  "What's the cheapest experiment that would have told us this was wrong sooner?",
];

export interface DecisionCriterion {
  id?: number;
  name: string;
  weight: number; // 0..1, should sum to ~1 across a decision's criteria
}

export interface DecisionOption {
  id: number;
  label: string;
  description?: string | null;
  criteriaScores: Record<string, number>; // criterion name -> 0..1
  estimatedValue: number; // expected dollar/strategic value if this option is chosen and succeeds
  uncertaintyLow: number; // low end of the value estimate
  uncertaintyHigh: number; // high end of the value estimate
  probabilityOfSuccess: number; // 0..1
}

export interface Decision {
  id: number;
  title: string;
  domain: DecisionDomain;
  status: DecisionStatus;
  context?: string | null;
  doorType: DoorType;
  impact: number; // 1..5
  deadline: string | null; // ISO date
  preMortem: PreMortemPrompt[];
  chosenOptionId: number | null;
  retrospectiveScore: number | null;
  retrospectiveNotes: string | null;
  retrospectiveDueAt: string | null;
}
