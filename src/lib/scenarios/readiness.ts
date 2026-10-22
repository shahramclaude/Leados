export interface ReadinessInputs {
  /** 0–1, from wind-tunnel robustness score normalized against best-case utility. */
  robustnessScore: number;
  /** 0–1, from resilience.ts averaged across stress tests. */
  resilienceScore: number;
  /** 0–1, lower is better: org-wide Brier score from the foresight registry. */
  foresightBrier: number;
  /** 0–1, share of the named scenario quadrants/morphological cells actually modeled. */
  scenarioCoverageRatio: number;
}

export interface ReadinessBreakdown {
  robustnessContribution: number;
  resilienceContribution: number;
  foresightContribution: number;
  coverageContribution: number;
}

export interface ReadinessResult {
  index: number; // 0-100
  breakdown: ReadinessBreakdown;
  inputs: ReadinessInputs;
}

const WEIGHTS = {
  robustness: 0.35,
  resilience: 0.25,
  foresight: 0.2,
  coverage: 0.2,
};

/**
 * Composite readiness index — deliberately a planning-posture metric
 * ("how prepared are we across plausible futures"), never framed as a
 * probability that any particular future occurs.
 */
export function computeReadinessIndex(inputs: ReadinessInputs): ReadinessResult {
  const foresightQuality = 1 - clamp01(inputs.foresightBrier); // Brier 0 = perfect, so invert
  const robustnessContribution = clamp01(inputs.robustnessScore) * WEIGHTS.robustness;
  const resilienceContribution = clamp01(inputs.resilienceScore) * WEIGHTS.resilience;
  const foresightContribution = foresightQuality * WEIGHTS.foresight;
  const coverageContribution = clamp01(inputs.scenarioCoverageRatio) * WEIGHTS.coverage;

  const index = (robustnessContribution + resilienceContribution + foresightContribution + coverageContribution) * 100;

  return {
    index: Math.round(index * 10) / 10,
    breakdown: { robustnessContribution, resilienceContribution, foresightContribution, coverageContribution },
    inputs,
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
