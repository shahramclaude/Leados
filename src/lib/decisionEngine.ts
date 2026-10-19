// decisionEngine — the decision intelligence workspace: weighted-criteria
// scoring, expected-value under uncertainty (Monte Carlo, not a point
// guess), reversible/irreversible ("one-way door" / "two-way door") framing,
// pre-mortems, and automatic retrospective scoring once a decision's
// deadline has passed.
import { mulberry32 } from "@/lib/prng";
import { calculateRealOptionValue } from "@/lib/realOptions";
import {
  DEFAULT_PRE_MORTEM_PROMPTS,
  type Decision,
  type DecisionCriterion,
  type DecisionOption,
  type PreMortemPrompt,
} from "@/lib/decisionTypes";

export function generatePreMortem(): PreMortemPrompt[] {
  return DEFAULT_PRE_MORTEM_PROMPTS.map((prompt) => ({ prompt }));
}

/** Weighted-criteria score in 0..1, normalizing weights so they don't need to sum to exactly 1. */
export function computeWeightedScore(option: Pick<DecisionOption, "criteriaScores">, criteria: DecisionCriterion[]): number {
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const sum = criteria.reduce((s, c) => s + (option.criteriaScores[c.name] ?? 0) * c.weight, 0);
  return sum / totalWeight;
}

export interface ExpectedValueResult {
  pointEstimate: number; // probabilityOfSuccess * estimatedValue
  distribution: { p10: number; p50: number; p90: number; mean: number };
}

/**
 * Monte Carlo expected value: draws the realized value from a triangular
 * distribution (low, estimate, high) each trial, gates it on a Bernoulli
 * success draw at `probabilityOfSuccess`, and reports the resulting
 * distribution rather than a single number.
 */
export function computeExpectedValue(option: Pick<DecisionOption, "estimatedValue" | "uncertaintyLow" | "uncertaintyHigh" | "probabilityOfSuccess">, seed = 7, n = 4000): ExpectedValueResult {
  const rng = mulberry32(seed);
  const { estimatedValue, uncertaintyLow, uncertaintyHigh, probabilityOfSuccess } = option;
  const low = Math.min(uncertaintyLow || estimatedValue * 0.5, estimatedValue);
  const high = Math.max(uncertaintyHigh || estimatedValue * 1.5, estimatedValue);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = rng();
    // Inverse-CDF sampling of a triangular distribution with mode = estimatedValue.
    const fc = (estimatedValue - low) / (high - low || 1);
    let value: number;
    if (u < fc) value = low + Math.sqrt(u * (high - low) * (estimatedValue - low));
    else value = high - Math.sqrt((1 - u) * (high - low) * (high - estimatedValue));
    const succeeds = rng() < probabilityOfSuccess;
    samples.push(succeeds ? value : 0);
  }
  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { pointEstimate: Math.round(probabilityOfSuccess * estimatedValue), distribution: { p10: Math.round(pct(10)), p50: Math.round(pct(50)), p90: Math.round(pct(90)), mean: Math.round(mean) } };
}

export interface RankedOption {
  option: DecisionOption;
  weightedCriteriaScore: number;
  expectedValue: ExpectedValueResult;
  optionValue: number | null;
  isRecommended: boolean;
}

/** Ranks a decision's options by a blend of weighted-criteria fit and expected value. */
export function rankOptions(decision: Pick<Decision, "deadline">, options: DecisionOption[], criteria: DecisionCriterion[]): RankedOption[] {
  const ranked = options.map((option) => {
    const weightedCriteriaScore = computeWeightedScore(option, criteria);
    const expectedValue = computeExpectedValue(option);
    const optionValueResult = decision.deadline ? calculateRealOptionValue({ estimatedValue: option.estimatedValue, deadline: decision.deadline }) : null;
    return { option, weightedCriteriaScore, expectedValue, optionValue: optionValueResult?.optionValue ?? null, isRecommended: false };
  });
  // Blended rank: normalize EV p50 to 0..1 within this option set, blend 50/50 with criteria score.
  const maxEv = Math.max(1, ...ranked.map((r) => r.expectedValue.distribution.p50));
  ranked.forEach((r) => {
    (r as { blended?: number }).blended = 0.5 * r.weightedCriteriaScore + 0.5 * (r.expectedValue.distribution.p50 / maxEv);
  });
  ranked.sort((a, b) => (b as { blended?: number }).blended! - (a as { blended?: number }).blended!);
  if (ranked.length) ranked[0].isRecommended = true;
  return ranked;
}

export interface DoorGuidance {
  label: string;
  guidance: string;
}

/** Reversible vs. irreversible framing: how much process a decision deserves. */
export function doorGuidance(doorType: Decision["doorType"], impact: number): DoorGuidance {
  if (doorType === "one_way") {
    return {
      label: "One-way door",
      guidance:
        impact >= 4
          ? "High-impact and irreversible: slow down, widen the input group, write a pre-mortem, and consider a reversible pilot before committing fully."
          : "Irreversible but lower-impact: a lightweight pre-mortem and a single accountable owner is enough ceremony.",
    };
  }
  return {
    label: "Two-way door",
    guidance: "Reversible: a single owner should decide quickly and cheaply; the cost of being wrong is a correction, not a crisis. Don't over-process this.",
  };
}

export function isRetrospectiveDue(decision: Pick<Decision, "deadline" | "retrospectiveScore" | "status">, now: Date = new Date()): boolean {
  if (decision.retrospectiveScore !== null) return false;
  if (decision.status !== "executed" && decision.status !== "approved") return false;
  if (!decision.deadline) return false;
  return new Date(decision.deadline).getTime() <= now.getTime();
}

export interface RetrospectiveResult {
  score: number; // 0..100 calibration score
  notes: string;
}

/**
 * Automatic retrospective scoring: compares the chosen option's *predicted*
 * expected value and success probability against the *actual* outcome once
 * the deadline has passed. This feeds the same 0-100 calibration convention
 * used elsewhere in LEADOS for "how well-calibrated were our confidence
 * estimates" tracking — a well-calibrated decision-maker who said "60%
 * likely" should be right about 60% of the time across many decisions.
 */
export function scoreRetrospective(chosenOption: Pick<DecisionOption, "estimatedValue" | "probabilityOfSuccess">, actualOutcomeValue: number, actualSucceeded: boolean): RetrospectiveResult {
  const probabilityError = Math.abs((actualSucceeded ? 1 : 0) - chosenOption.probabilityOfSuccess);
  const probabilityComponent = (1 - probabilityError) * 60; // 0..60

  const valueError =
    chosenOption.estimatedValue > 0 ? Math.min(1, Math.abs(actualOutcomeValue - chosenOption.estimatedValue) / chosenOption.estimatedValue) : actualOutcomeValue === 0 ? 0 : 1;
  const valueComponent = (1 - valueError) * 40; // 0..40

  const score = Math.round(Math.max(0, Math.min(100, probabilityComponent + valueComponent)));
  const notes = `Predicted ${Math.round(chosenOption.probabilityOfSuccess * 100)}% success / $${Math.round(chosenOption.estimatedValue).toLocaleString()} value; actual outcome was ${actualSucceeded ? "a success" : "not a success"} worth $${Math.round(actualOutcomeValue).toLocaleString()}. Calibration score ${score}/100.`;
  return { score, notes };
}
