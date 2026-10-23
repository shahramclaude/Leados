// LEADOS Agent Kernel — objective taxonomy classifier.
// Deterministic keyword classifier (no LLM call, no network, no randomness)
// so that plan structure is 100% reproducible given the same objective
// string. This is the first stage of the HTN-lite decomposition algorithm
// used by the Planner (see planner.ts).
export type ObjectiveCategory =
  | "forecast"
  | "churn-diagnosis"
  | "board-pack"
  | "budget-reallocation"
  | "policy-draft"
  | "generic";

const RULES: Array<{ category: ObjectiveCategory; keywords: string[] }> = [
  { category: "forecast", keywords: ["forecast", "projection", "quarter", "outlook"] },
  { category: "churn-diagnosis", keywords: ["churn", "attrition", "retention drop", "cancellation"] },
  { category: "board-pack", keywords: ["board pack", "board deck", "board meeting", "board update"] },
  { category: "budget-reallocation", keywords: ["reallocate", "budget", "spend shift", "cost reallocation"] },
  { category: "policy-draft", keywords: ["policy", "draft a policy", "guideline", "sop"] },
];

export function classifyObjective(objective: string): ObjectiveCategory {
  const text = objective.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.category;
  }
  return "generic";
}
