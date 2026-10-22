// src/lib/twin/modelVersion.ts
//
// Single source of truth for the twin's model version string and its model
// card. Bump MODEL_VERSION whenever the generative mechanics change in a way
// that would invalidate cached results or backtests (cache keys include this
// string; see forecastCache.ts).

export const MODEL_VERSION = "twin-0.6.0";

export const MODEL_CHANGELOG: Array<{ version: string; notes: string }> = [
  {
    version: "twin-0.6.0",
    notes:
      "Part 06: introduces agents/workSystem/network/shocks/financeBridge, " +
      "ensemble with antithetic + control-variate variance reduction, " +
      "OAT + exact-Shapley attribution, synthetic self-consistency backtest.",
  },
];

export interface ModelCardFiction {
  parameter: string;
  status: "fictional" | "illustrative-constant" | "synthetic-calibration";
  explanation: string;
}

/**
 * Parameters in the twin that are NOT derived from any measurement and are
 * flagged here so the UI's disclaimer contract and /api/simulate/modelcard
 * can surface them verbatim. Phase 5 attack question #1 answers from this list.
 */
export const MODEL_CARD_KNOWN_FICTIONS: ModelCardFiction[] = [
  {
    parameter: "network.edgeWeight (p_uv, independent cascade probability)",
    status: "fictional",
    explanation:
      "Edge activation probabilities are drawn from a synthetic distribution " +
      "(team-boosted random graph) and are not estimated from any real " +
      "communication, collaboration, or survey data. There is no org in the " +
      "loop. Treat cascade reach numbers as structural what-ifs only.",
  },
  {
    parameter: "agents.fatigue / agents.motivation dynamics",
    status: "illustrative-constant",
    explanation:
      "Recovery and decay rates (see agents.ts FATIGUE_* / MOTIVATION_* " +
      "constants) are hand-set to produce plausible-looking curves. They are " +
      "not calibrated against psychometric or engagement-survey instruments.",
  },
  {
    parameter: "financeBridge cost/value rates",
    status: "illustrative-constant",
    explanation:
      "costPerHeadWeek, costPerEffortHr and valuePerEffortHr are scenario " +
      "inputs with sensible-looking defaults, not derived from any finance " +
      "system of record. The expected-value draw itself reuses the Part 04 " +
      "Monte Carlo belief stand-in (src/lib/forecast/monteCarloCore.ts), " +
      "which is also synthetic in this build (see that file's header).",
  },
  {
    parameter: "backtest ground truth",
    status: "synthetic-calibration",
    explanation:
      "There is no real historical organisational outcome data available to " +
      "this project. backtest.ts generates 'ground truth' by drawing a single " +
      "run from the SAME generative model used for prediction. This is a " +
      "self-consistency / coverage-calibration check on the engine's own " +
      "quantile machinery, not validation against reality. See backtest.ts " +
      "header and the model card page for the full caveat.",
  },
  {
    parameter: "orgWorld agent count, skill levels, team structure",
    status: "fictional",
    explanation:
      "The initial organisation (headcount, skills, tenure, team assignment) " +
      "is procedurally generated from a seed, standing in for the Part 01 " +
      "org-world generator referenced by this part's dependency chain. It is " +
      "a synthetic organisation, not an import of any real company's data.",
  },
];
