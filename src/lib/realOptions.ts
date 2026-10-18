// realOptions.ts — real-options valuation for strategic decisions.
//
// Two complementary models are provided:
//  1. Black-Scholes, treating a strategic initiative as a financial option
//     (e.g. the "option" to expand, enter a market, or exercise a follow-on
//     investment).
//  2. A multi-stage decision tree evaluated by backward induction, for
//     situations that are better modelled as a sequence of go/no-go gates
//     with costs and probabilities of success (e.g. R&D phases).
//
// `analyzeStrategicOption` combines both and reports a sensitivity table.

import { normalCdf } from "./monteCarlo";

export type OptionType = "call" | "put";

/**
 * Black-Scholes valuation of a European option.
 *
 *   d1 = [ln(S / K) + (r + sigma^2 / 2) * T] / (sigma * sqrt(T))
 *   d2 = d1 - sigma * sqrt(T)
 *
 *   Call = S * N(d1) - K * e^(-rT) * N(d2)
 *   Put  = K * e^(-rT) * N(-d2) - S * N(-d1)
 *
 * Applied to strategy, the analogy is:
 *   S     = present value of expected cash flows if the option is exercised
 *           now (e.g. value of entering the market today)
 *   K     = cost of exercising the option (e.g. investment required)
 *   T     = time until the option expires (how long the opportunity stays open)
 *   r     = risk-free rate
 *   sigma = volatility of the underlying value (how uncertain the payoff is)
 *
 * @param type  'call' = option to invest/expand, 'put' = option to abandon/divest
 * @param S     current value of the underlying asset / opportunity
 * @param K     strike price / cost to exercise
 * @param T     time to expiry, in years
 * @param r     risk-free interest rate (annualized, decimal, e.g. 0.04)
 * @param sigma volatility of the underlying (annualized, decimal, e.g. 0.35)
 */
export function valuateOption(type: OptionType, S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    // At/after expiry (or degenerate inputs) the option is worth its intrinsic value.
    return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const discountedK = K * Math.exp(-r * T);

  if (type === "call") {
    return S * normalCdf(d1) - discountedK * normalCdf(d2);
  }
  return discountedK * normalCdf(-d2) - S * normalCdf(-d1);
}

// ---------------------------------------------------------------------------
// Decision-tree NPV engine (backward induction)
// ---------------------------------------------------------------------------

export interface Choice {
  label: string;
  /** Cost incurred immediately when this choice is taken. */
  cost: number;
  /** Probability this choice succeeds, 0-1. */
  pSuccess: number;
  /** Payoff received immediately on success, before any continuation value. */
  payoff?: number;
  /** Subsequent decision stage(s) reachable after this choice succeeds. */
  nextStages?: Stage[];
}

export interface Stage {
  name: string;
  choices: Choice[];
}

export interface TreeNode {
  stageName: string;
  bestChoiceLabel: string;
  expectedNPV: number;
  choices: { label: string; expectedValue: number }[];
  children?: TreeNode[];
}

/** Evaluate a chain of sequential stages, summing their expected NPVs. */
function evaluateChain(stages: Stage[]): { value: number; nodes: TreeNode[] } {
  let total = 0;
  const nodes: TreeNode[] = [];
  for (const stage of stages) {
    const { node, value } = evaluateStage(stage);
    total += value;
    nodes.push(node);
  }
  return { value: total, nodes };
}

/**
 * Backward induction: to value a stage we must first value every stage that
 * could follow it (the recursive call below), THEN fold that continuation
 * value back into the expected value of each choice at this stage.
 */
function evaluateStage(stage: Stage): { node: TreeNode; value: number } {
  let best: { label: string; expectedValue: number; children: TreeNode[] } | null = null;
  const choiceSummaries: { label: string; expectedValue: number }[] = [];

  for (const choice of stage.choices) {
    const continuation =
      choice.nextStages && choice.nextStages.length > 0
        ? evaluateChain(choice.nextStages)
        : { value: 0, nodes: [] as TreeNode[] };

    // Expected value = -cost (paid regardless) + P(success) * (immediate payoff + value of what follows)
    const expectedValue = -choice.cost + choice.pSuccess * ((choice.payoff ?? 0) + continuation.value);
    choiceSummaries.push({ label: choice.label, expectedValue });

    if (!best || expectedValue > best.expectedValue) {
      best = { label: choice.label, expectedValue, children: continuation.nodes };
    }
  }

  const node: TreeNode = {
    stageName: stage.name,
    bestChoiceLabel: best?.label ?? "",
    expectedNPV: best?.expectedValue ?? 0,
    choices: choiceSummaries,
    children: best?.children,
  };
  return { node, value: node.expectedNPV };
}

/**
 * Build and solve a (possibly multi-stage) decision tree by backward
 * induction, returning the root node with the recommended path's NPV and,
 * attached under `children`, the downstream stages that follow the optimal
 * choice at the root.
 */
export function buildDecisionTree(stages: Stage[]): TreeNode {
  if (!stages || stages.length === 0) {
    return { stageName: "empty", bestChoiceLabel: "", expectedNPV: 0, choices: [] };
  }
  const { nodes, value } = evaluateChain(stages);
  const [root, ...rest] = nodes;
  return {
    ...root,
    expectedNPV: value,
    children: rest.length > 0 ? rest : root.children,
  };
}

// ---------------------------------------------------------------------------
// Combined strategic option analysis
// ---------------------------------------------------------------------------

export interface StrategicOptionParams {
  /** Present value of the opportunity if exercised today. */
  S: number;
  /** Cost to exercise / invest. */
  K: number;
  /** Years until the opportunity closes. */
  T: number;
  /** Risk-free rate, decimal. */
  r: number;
  /** Volatility of the underlying opportunity's value, decimal. */
  sigma: number;
  /** Optional multi-stage decision tree describing a phased path to the same opportunity. */
  stages?: Stage[];
  /** Up-front investment already assumed sunk, subtracted from the combined value. */
  investmentCost?: number;
  optionType?: OptionType;
}

export interface OptionAnalysis {
  description: string;
  blackScholesValue: number;
  treeNPV: number;
  combinedValue: number;
  recommendation: string;
  sensitivity: Record<string, number>;
}

const SENSITIVITY_BUMP = 0.1; // +/-10%

export function analyzeStrategicOption(description: string, params: StrategicOptionParams): OptionAnalysis {
  const { S, K, T, r, sigma, stages, investmentCost = 0, optionType = "call" } = params;

  const blackScholesValue = valuateOption(optionType, S, K, T, r, sigma);
  const treeNPV = stages && stages.length > 0 ? buildDecisionTree(stages).expectedNPV : 0;
  const combinedValue = blackScholesValue + treeNPV - investmentCost;

  const recommendation =
    combinedValue > Math.max(S, 1) * 0.02
      ? "Proceed — the option value plus expected path NPV comfortably clears the investment hurdle. Keep the option alive and revisit as uncertainty resolves."
      : combinedValue > 0
        ? "Hold / stage cautiously — value is marginally positive. Consider a smaller, reversible first step rather than full commitment."
        : "Do not exercise now — expected value is negative. Either wait for more favorable volatility/time conditions or abandon the option.";

  // Sensitivity: bump each Black-Scholes parameter by +10% and record the effect on value.
  const bumps: Record<string, Partial<StrategicOptionParams>> = {
    S: { S: S * (1 + SENSITIVITY_BUMP) },
    K: { K: K * (1 + SENSITIVITY_BUMP) },
    T: { T: T * (1 + SENSITIVITY_BUMP) },
    r: { r: r + SENSITIVITY_BUMP * Math.max(Math.abs(r), 0.01) },
    sigma: { sigma: sigma * (1 + SENSITIVITY_BUMP) },
  };

  const sensitivity: Record<string, number> = {};
  for (const [key, bump] of Object.entries(bumps)) {
    const bumped = valuateOption(
      optionType,
      bump.S ?? S,
      bump.K ?? K,
      bump.T ?? T,
      bump.r ?? r,
      bump.sigma ?? sigma,
    );
    sensitivity[key] = bumped - blackScholesValue;
  }

  return {
    description,
    blackScholesValue,
    treeNPV,
    combinedValue,
    recommendation,
    sensitivity,
  };
}
