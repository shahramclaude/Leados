// Shared types for decisionEngine.ts / decisionTrees.ts / realOptions.ts.
// Split out because three previously-separate modules all needed the same
// vocabulary — consolidating avoids drift between them.

export type Reversibility = "one-way-door" | "two-way-door";
export type DecisionStatus = "open" | "decided" | "retrospective_due" | "reviewed";

export type DecisionOption = {
  id: number;
  decisionId: number;
  label: string;
  description: string;
  scores: Record<string, number>;
};

export type DecisionCriterion = {
  id: number;
  decisionId: number;
  label: string;
  weight: number;
};

export type DecisionOutcome = {
  id: number;
  optionId: number;
  scenarioLabel: string;
  probability: number;
  payoffLow: number;
  payoffBase: number;
  payoffHigh: number;
};

export type PreMortemPrompt = { prompt: string; rationale: string };

export const PRE_MORTEM_PROMPTS_CORE: PreMortemPrompt[] = [
  { prompt: "It is 12 months from now and this decision failed. What is the single most likely reason?", rationale: "Forces concrete failure-mode generation before commitment (Klein pre-mortem)." },
  { prompt: "What evidence would have told us this was wrong within 30 days?", rationale: "Surfaces early-warning indicators to actually monitor." },
  { prompt: "Who disagrees with this option, and what do they know that we don't?", rationale: "Surfaces dissent that groupthink suppresses." },
  { prompt: "What is the worst credible outcome, not the average one?", rationale: "Anchors on the downside tail, not just expected value." },
];

export const PRE_MORTEM_PROMPTS_ONE_WAY_DOOR: PreMortemPrompt[] = [
  { prompt: "Can any part of this be sequenced or piloted to convert it into a two-way door?", rationale: "One-way doors deserve a de-risking pass before being treated as irreversible." },
  { prompt: "If we are wrong, what is the cost and time to partially unwind this?", rationale: "Even 'irreversible' decisions usually have a costly-but-possible undo path; it should be named, not assumed away." },
];
