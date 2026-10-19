// src/lib/intelligence/orgODE.ts
//
// A small, documented system of ODEs modelling GTM organisation dynamics,
// used by scenarioEngine.ts to answer counterfactual questions ("what if we
// hire 3 people / delay launch 6 weeks / raise prices 8%"). State variables:
//   pipeline(t)  — open pipeline value ($)
//   revenue(t)   — cumulative closed revenue ($)
// Parameters (documented, not hidden):
//   headcount           — number of quota-carrying reps generating pipeline
//   pipelinePerRepWeek  — $ of new pipeline one rep generates per week
//   conversionRatePerWk — fraction of open pipeline that converts per week
//   avgDealSize         — not used directly (folded into conversion $ via pipeline)
//   priceMultiplier     — multiplies conversion rate (price elasticity of demand)
//   launchDelayWeeks    — weeks before the model's ramp begins (0 = no delay)
// This mirrors the `headcount -> pipelineGenerated -> revenue` and
// `price -> winRate -> revenue` edges in causal.ts's buildGtmCausalGraph(),
// so the causal chain narrative and the numeric simulation tell the same
// story.
import { Derivative, integrateRK4, StateVector } from "./simulation";

export interface OrgParameters {
  headcount: number;
  pipelinePerRepWeek: number;
  conversionRatePerWeek: number;
  priceMultiplier: number;
  launchDelayWeeks: number;
}

export const BASELINE_ORG_PARAMETERS: OrgParameters = {
  headcount: 12,
  pipelinePerRepWeek: 9000,
  conversionRatePerWeek: 0.045,
  priceMultiplier: 1,
  launchDelayWeeks: 0,
};

export interface Intervention {
  type: "hire" | "delayLaunch" | "priceChange";
  /** hire: number of reps added; delayLaunch: weeks added; priceChange: % change e.g. 0.08 for +8% */
  amount: number;
}

/** Applies named interventions to baseline parameters. Each mapping is a
 * stated, documented assumption:
 *   - hiring N reps adds directly to headcount, effective after a 4-week
 *     ramp (modelled as launchDelayWeeks when hiring is the only change),
 *   - a price increase of x% reduces the weekly conversion rate by
 *     0.5x (an assumed demand elasticity of -0.5, i.e. a 10% price rise
 *     costs ~5% of conversion rate) — this elasticity is a documented
 *     assumption, not a fitted value, and is surfaced in `assumptions`.
 */
export function applyInterventions(interventions: Intervention[], base: OrgParameters = BASELINE_ORG_PARAMETERS) {
  const params: OrgParameters = { ...base };
  const assumptions: string[] = [];
  for (const i of interventions) {
    if (i.type === "hire") {
      params.headcount += i.amount;
      params.launchDelayWeeks = Math.max(params.launchDelayWeeks, 4);
      assumptions.push(`Hiring ${i.amount} rep(s): assumed 4-week ramp before new reps generate full pipeline.`);
    } else if (i.type === "delayLaunch") {
      params.launchDelayWeeks += i.amount;
      assumptions.push(`Launch delayed by ${i.amount} week(s): pipeline/conversion ramp pushed back by that much.`);
    } else if (i.type === "priceChange") {
      const elasticity = -0.5;
      params.priceMultiplier *= 1 + elasticity * i.amount;
      params.conversionRatePerWeek *= 1 + elasticity * i.amount;
      assumptions.push(
        `Price change of ${(i.amount * 100).toFixed(1)}%: assumed demand elasticity of ${elasticity} applied to weekly conversion rate.`,
      );
    }
  }
  return { params, assumptions };
}

function derivative(params: OrgParameters): Derivative {
  return (t: number, state: StateVector): StateVector => {
    const [pipeline, revenue] = state;
    const ramped = t >= params.launchDelayWeeks ? 1 : 0;
    const newPipeline = ramped * params.headcount * params.pipelinePerRepWeek;
    const converted = pipeline * params.conversionRatePerWeek * params.priceMultiplier;
    return [newPipeline - converted, converted];
  };
}

export interface OrgTrajectory {
  weeks: number[];
  pipeline: number[];
  revenue: number[];
  finalRevenue: number;
}

/** Integrates the org dynamics ODE for `horizonWeeks` from a zeroed
 * starting state (pipeline=0, revenue=0 at t=0 — i.e. "incremental" revenue
 * attributable to the scenario, which is what a what-if question asks for). */
export function simulateOrg(params: OrgParameters, horizonWeeks = 26): OrgTrajectory {
  const result = integrateRK4(derivative(params), [0, 0], 0, 1, horizonWeeks);
  const pipeline = result.states.map((s) => s[0]);
  const revenue = result.states.map((s) => s[1]);
  return { weeks: result.times, pipeline, revenue, finalRevenue: revenue[revenue.length - 1] };
}
