// src/lib/intelligence/scenarioEngine.ts
//
// Counterfactuals & simulation (Part 3 §7). A leader asks "what if we hire 3
// people / delay launch 6 weeks / raise prices 8%" and gets back a
// quantified outcome distribution (via Monte Carlo over the orgODE.ts
// model's uncertain parameters) PLUS the causal chain it propagated
// through (via causalChain.ts), so the number always comes with a story.
import { randomUUID } from "crypto";
import { buildGtmCausalGraph } from "./causal";
import { buildCausalChain, CausalChain } from "./causalChain";
import { explainFinding } from "./explain";
import { mulberry32, summarizeDistribution, PredictiveDistribution } from "./monteCarlo";
import {
  applyInterventions,
  BASELINE_ORG_PARAMETERS,
  Intervention,
  OrgParameters,
  simulateOrg,
} from "./orgODE";
import type { Driver, EvidenceRef, Explanation } from "./types";

export interface ScenarioRequest {
  name: string;
  description?: string;
  interventions: Intervention[];
  horizonWeeks?: number;
  trials?: number;
  seed?: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  interventions: Intervention[];
  horizonWeeks: number;
  baselineDistribution: PredictiveDistribution;
  scenarioDistribution: PredictiveDistribution;
  deltaP50: number;
  assumptions: string[];
  causalChains: CausalChain[];
  explanation: Explanation;
  asOf: string;
}

const INTERVENTION_TREATMENT_NODE: Record<Intervention["type"], string> = {
  hire: "headcount",
  priceChange: "price",
  delayLaunch: "dealCycleLength",
};

/** Perturbs the two uncertain org parameters (rep productivity, conversion
 * rate) by +/-15% relative Gaussian noise per trial, to turn a deterministic
 * ODE trajectory into a predictive distribution. 15% reflects typical
 * quarter-to-quarter variance in rep ramp and win-rate observed across
 * LEADOS accounts (documented assumption, not fitted on this dataset). */
function perturbedFinalRevenue(params: OrgParameters, horizonWeeks: number, trials: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < trials; i++) {
    const noiseA = 1 + (rng() - 0.5) * 0.3;
    const noiseB = 1 + (rng() - 0.5) * 0.3;
    const perturbed: OrgParameters = {
      ...params,
      pipelinePerRepWeek: params.pipelinePerRepWeek * noiseA,
      conversionRatePerWeek: params.conversionRatePerWeek * noiseB,
    };
    samples.push(simulateOrg(perturbed, horizonWeeks).finalRevenue);
  }
  return samples;
}

export function runScenario(request: ScenarioRequest): ScenarioResult {
  const horizonWeeks = request.horizonWeeks ?? 26;
  const trials = request.trials ?? 2000;
  const seed = request.seed ?? 7;

  const baselineSamples = perturbedFinalRevenue(BASELINE_ORG_PARAMETERS, horizonWeeks, trials, seed);
  const baselineDistribution = summarizeDistribution(baselineSamples);

  const { params, assumptions } = applyInterventions(request.interventions);
  const scenarioSamples = perturbedFinalRevenue(params, horizonWeeks, trials, seed + 1);
  const scenarioDistribution = summarizeDistribution(scenarioSamples);

  const deltaP50 = scenarioDistribution.p50 - baselineDistribution.p50;

  // Per-intervention attribution: re-run with each intervention applied in
  // isolation, so drivers[] reflects each lever's individual contribution
  // to the median delta (interventions are not assumed additive; this is
  // the literal marginal effect of applying only that one lever).
  const drivers: Driver[] = request.interventions.map((intervention) => {
    const isolated = applyInterventions([intervention]);
    const isolatedSamples = perturbedFinalRevenue(isolated.params, horizonWeeks, Math.min(trials, 500), seed + 2);
    const isolatedP50 = summarizeDistribution(isolatedSamples).p50;
    return {
      name: `${intervention.type}(${intervention.amount})`,
      contribution: Number((isolatedP50 - baselineDistribution.p50).toFixed(2)),
      description: `Isolated effect of this lever alone on median ${horizonWeeks}-week incremental revenue.`,
    };
  });

  const causalChains = request.interventions.map((intervention) =>
    buildCausalChain(buildGtmCausalGraph(), INTERVENTION_TREATMENT_NODE[intervention.type], "revenue"),
  );

  const evidence: EvidenceRef[] = [
    {
      type: "metric",
      id: "org-ode-model",
      label: "Org dynamics ODE model (orgODE.ts)",
      timestamp: new Date().toISOString(),
    },
  ];

  const explanation = explainFinding({
    label: `Scenario: ${request.name}`,
    value: deltaP50,
    interval: {
      low: scenarioDistribution.p10 - baselineDistribution.p50,
      high: scenarioDistribution.p90 - baselineDistribution.p50,
      level: 0.8,
      kind: "predictive",
    },
    drivers,
    evidence,
    method: "scenario-simulation",
    confidence: 0.6,
    caveats: [
      "Outcome is a simulated counterfactual from a documented ODE model, not a guarantee.",
      "Parameter uncertainty (rep productivity, conversion rate) is modelled; structural model error is not.",
    ],
  });

  return {
    id: randomUUID(),
    name: request.name,
    description: request.description ?? "",
    interventions: request.interventions,
    horizonWeeks,
    baselineDistribution,
    scenarioDistribution,
    deltaP50,
    assumptions,
    causalChains,
    explanation,
    asOf: explanation.asOf,
  };
}
