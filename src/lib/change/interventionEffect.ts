import { explain, type Explain } from "@/lib/explain";
import { steppedWedgeEffect, phraseEffect, type SteppedWedgeObservation, type DesignIdentification } from "@/lib/stats/estimators";
import type { RolloutDesign } from "./types";
import { isExposed } from "./rollout";

export interface GroupPeriodObservation {
  groupId: string;
  period: number;
  /** Aggregate adoption-proxy rate for the group-period (e.g. habit-stage fraction), 0..1. */
  adoptionRate: number;
}

export interface InterventionEffectResult {
  estimate: number;
  ci95: [number, number];
  se: number;
  nTreatment: number;
  nControl: number;
  language: string;
}

/**
 * Estimate an intervention's effect on the adoption-proxy rate, given the
 * rollout design and observed group-period aggregates. Uses Part 05's
 * (bootstrapped) stepped-wedge DiD estimator and applies the causal-language
 * rule: only a clean randomized design is phrased as identified; otherwise
 * "associated with".
 */
export function estimateInterventionEffect(
  design: RolloutDesign,
  observations: readonly GroupPeriodObservation[],
  subject: string,
  designIdentification: DesignIdentification = "randomized_clean"
): Explain<InterventionEffectResult> {
  const swObservations: SteppedWedgeObservation[] = observations.map((o) => ({
    groupId: o.groupId,
    period: o.period,
    exposed: isExposed(design, o.groupId, o.period),
    value: o.adoptionRate,
  }));

  const result = steppedWedgeEffect(swObservations);
  const language = phraseEffect(result.estimate, designIdentification, subject);

  return explain<InterventionEffectResult>(
    {
      estimate: Number(result.estimate.toFixed(4)),
      ci95: [Number(result.ci95[0].toFixed(4)), Number(result.ci95[1].toFixed(4))],
      se: Number(result.se.toFixed(4)),
      nTreatment: result.nTreatment,
      nControl: result.nControl,
      language,
    },
    "stepped_wedge_did_v1",
    { designKind: design.kind, designIdentification, nObservations: observations.length },
    {
      confidence: result.nTreatment >= 10 && result.nControl >= 10 ? "medium" : "low",
      caveats: [
        "Pooled difference-in-differences across groups/periods; does not model secular trends or group-specific slopes.",
        "Assumes no interference between groups (one group's exposure does not change another's outcome) and no contamination of the control condition.",
        "Effect is estimated on an aggregate adoption-proxy rate, not on any individual's behavior.",
      ],
    }
  );
}

export interface InterventionResultRecord {
  interventionId: string;
  expectedEffect: number;
  estimatedEffect: number;
  surprise: number;
  withinExpectedBounds: boolean;
}

/**
 * Closes the loop (mirrors Part 23's decision journal): records the planned
 * expectation next to the measured result so overconfidence is visible over
 * time, rather than only the wins being remembered.
 */
export function recordInterventionResult(
  interventionId: string,
  expectedEffect: number,
  estimated: InterventionEffectResult,
  toleranceBand = 0.1
): InterventionResultRecord {
  const surprise = Number(Math.abs(estimated.estimate - expectedEffect).toFixed(4));
  const withinExpectedBounds = surprise <= toleranceBand;
  return { interventionId, expectedEffect, estimatedEffect: estimated.estimate, surprise, withinExpectedBounds };
}
