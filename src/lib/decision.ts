// Quantified decision intelligence (scoped): expected utility + EVPI.
//
// EU(a) = Σ_s P(s) · V(a, s)                      (expected utility)
// EVPI  = E[max_a V(a, s) over s] − max_a EU(a)    (value of perfect info,
//                                                    always ≥ 0 — an upper
//                                                    bound on what any study
//                                                    or signal could be worth)

export type Effect = { state: string; prob: number; value: number };
export type Alternative = {
  id: string;
  label: string;
  costUsd: number;
  effects: Effect[];
};

export type DecisionAnalysis = {
  expectedUtility: Record<string, number>;
  evpi: number;
  bestAlternativeId: string | null;
  recommendation: string;
  sensitivity: { state: string; swingValue: number }[];
};

export function analyzeDecision(alternatives: Alternative[]): DecisionAnalysis {
  if (alternatives.length === 0) {
    return {
      expectedUtility: {},
      evpi: 0,
      bestAlternativeId: null,
      recommendation: "No alternatives supplied.",
      sensitivity: [],
    };
  }

  const expectedUtility: Record<string, number> = {};
  for (const alt of alternatives) {
    const probSum = alt.effects.reduce((s, e) => s + e.prob, 0);
    const eu = alt.effects.reduce((sum, e) => {
      const normalizedProb = probSum > 0 ? e.prob / probSum : 0;
      return sum + normalizedProb * e.value - (alt.costUsd ? 0 : 0);
    }, 0);
    // Net of cost (cost expressed in the same currency unit as value).
    expectedUtility[alt.id] = eu - alt.costUsd;
  }

  let bestId = alternatives[0].id;
  for (const alt of alternatives) {
    if (expectedUtility[alt.id] > expectedUtility[bestId]) bestId = alt.id;
  }
  const bestEu = expectedUtility[bestId];

  // Expected value with perfect information: for every state, pick the
  // alternative that performs best in that state, weighted by the state's
  // (normalized, alternative-averaged) probability.
  const states = new Map<string, number>();
  for (const alt of alternatives) {
    const probSum = alt.effects.reduce((s, e) => s + e.prob, 0);
    for (const e of alt.effects) {
      const norm = probSum > 0 ? e.prob / probSum : 0;
      states.set(e.state, (states.get(e.state) ?? 0) + norm / alternatives.length);
    }
  }
  let evWithPerfectInfo = 0;
  for (const [state, prob] of states) {
    let bestValueInState = -Infinity;
    for (const alt of alternatives) {
      const effect = alt.effects.find((e) => e.state === state);
      const v = (effect?.value ?? 0) - alt.costUsd;
      if (v > bestValueInState) bestValueInState = v;
    }
    evWithPerfectInfo += prob * bestValueInState;
  }
  const evpi = Math.max(0, evWithPerfectInfo - bestEu);

  // Sensitivity: for each state, how much the outcome swings between the
  // best and worst alternative (a crude "what would change my mind" proxy).
  const sensitivity = Array.from(states.keys()).map((state) => {
    const values = alternatives.map((alt) => {
      const effect = alt.effects.find((e) => e.state === state);
      return (effect?.value ?? 0) - alt.costUsd;
    });
    const swingValue = Math.max(...values) - Math.min(...values);
    return { state, swingValue };
  });
  sensitivity.sort((a, b) => b.swingValue - a.swingValue);

  const bestAlt = alternatives.find((a) => a.id === bestId)!;
  const recommendation = `${bestAlt.label} has the highest expected utility (${bestEu.toFixed(
    2,
  )}). EVPI is an upper bound of ${evpi.toFixed(2)} on what resolving the uncertainty below would be worth.`;

  return { expectedUtility, evpi, bestAlternativeId: bestId, recommendation, sensitivity };
}
