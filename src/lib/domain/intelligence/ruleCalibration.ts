/**
 * ruleCalibration.ts — Part 04-D calibration metrics, pure functions over a
 * rule's historical (predicted probability, realized outcome) pairs. This
 * is the ONE calibration-metrics module; `autoCalibrate.ts` (platform
 * layer) is the stateful loop that *acts* on these numbers.
 */

import {
  brierScore,
  crpsEmpirical,
  expectedCalibrationError,
  logLoss,
  reliabilityDiagram,
  type ProbOutcome,
} from "./stats";

export type RuleCalibrationReport = {
  ruleId: string;
  n: number;
  brier: number;
  logLoss: number;
  ece: number;
  reliabilityDiagram: ReturnType<typeof reliabilityDiagram>;
};

export function calibrateRule(ruleId: string, samples: ProbOutcome[]): RuleCalibrationReport {
  return {
    ruleId,
    n: samples.length,
    brier: brierScore(samples),
    logLoss: logLoss(samples),
    ece: expectedCalibrationError(samples, 10),
    reliabilityDiagram: reliabilityDiagram(samples, 10),
  };
}

export function calibrateDomain(domain: string, perRule: Record<string, ProbOutcome[]>): {
  domain: string;
  perRule: RuleCalibrationReport[];
  domainBrier: number;
  domainEce: number;
} {
  const perRuleReports = Object.entries(perRule).map(([ruleId, samples]) => calibrateRule(ruleId, samples));
  const allSamples = Object.values(perRule).flat();
  return {
    domain,
    perRule: perRuleReports,
    domainBrier: brierScore(allSamples),
    domainEce: expectedCalibrationError(allSamples, 10),
  };
}

/** CRPS for a rule/forecast that outputs a sampled distribution rather than
 * a single probability (e.g. a rule feeding into a continuous belief). */
export function calibrateDistributional(samples: number[], realizedOutcomes: number[]): number {
  if (samples.length === 0 || realizedOutcomes.length === 0) return NaN;
  const scores = realizedOutcomes.map((y) => crpsEmpirical(samples, y));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export const ECE_THRESHOLD = 0.05; // standing order G gate: ECE <= 0.05 per calibrated rule family
