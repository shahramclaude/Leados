// src/lib/intelligence/ruleCalibration.ts
//
// Calibration math (Part 3 §3): Brier score, reliability diagrams, and
// drift detection. These are the metrics autoCalibrate.ts and
// calibrateRules.ts act on, and the metrics eval:intelligence prints.
import { brierScoreSingle } from "./bayesian";
import type { LabeledPrediction } from "./goldenDataset";

export interface ReliabilityBin {
  binStart: number;
  binEnd: number;
  avgPredicted: number;
  avgObserved: number;
  count: number;
}

/** Mean Brier score over a set of labeled predictions. Reference points:
 * 0 = perfect, 0.25 = always predicting 0.5, 1 = maximally wrong & confident.
 * (Brier, G.W. 1950, "Verification of forecasts expressed in terms of
 * probability", Monthly Weather Review.) */
export function brierScore(predictions: LabeledPrediction[]): number {
  if (predictions.length === 0) return NaN;
  const sum = predictions.reduce((acc, p) => acc + brierScoreSingle(p.predictedProbability, p.outcome), 0);
  return sum / predictions.length;
}

/** Buckets predictions into `numBins` equal-width probability bins and
 * computes, per bin, the average predicted probability vs. the average
 * observed outcome rate — the standard reliability-diagram construction. A
 * perfectly calibrated model has avgPredicted ≈ avgObserved in every bin. */
export function reliabilityBins(predictions: LabeledPrediction[], numBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = Array.from({ length: numBins }, (_, i) => ({
    binStart: i / numBins,
    binEnd: (i + 1) / numBins,
    avgPredicted: 0,
    avgObserved: 0,
    count: 0,
  }));
  const sums = bins.map(() => ({ predictedSum: 0, outcomeSum: 0 }));

  for (const pred of predictions) {
    const idx = Math.min(numBins - 1, Math.floor(pred.predictedProbability * numBins));
    sums[idx].predictedSum += pred.predictedProbability;
    sums[idx].outcomeSum += pred.outcome;
    bins[idx].count += 1;
  }
  return bins.map((bin, i) => ({
    ...bin,
    avgPredicted: bin.count > 0 ? sums[i].predictedSum / bin.count : (bin.binStart + bin.binEnd) / 2,
    avgObserved: bin.count > 0 ? sums[i].outcomeSum / bin.count : 0,
  }));
}

/** Expected Calibration Error: the bin-count-weighted average absolute gap
 * between predicted and observed rates across all bins (Naeini, Cooper &
 * Hauskrecht, 2015, "Obtaining Well Calibrated Probabilities Using Bayesian
 * Binning"). Lower is better; 0 is perfect calibration. */
export function expectedCalibrationError(bins: ReliabilityBin[], sampleSize: number): number {
  if (sampleSize === 0) return NaN;
  return bins.reduce((acc, bin) => acc + (bin.count / sampleSize) * Math.abs(bin.avgPredicted - bin.avgObserved), 0);
}

export interface DriftResult {
  driftDetected: boolean;
  baselineBrier: number;
  recentBrier: number;
  delta: number;
  detail: string;
}

/** Per-rule drift detection: compares Brier score on a trailing "recent"
 * window against a "baseline" window. A relative increase beyond
 * `thresholdRatio` (default 25%) flags drift — the rule's real-world
 * accuracy has gotten meaningfully worse than when it was last calibrated. */
export function detectDrift(
  baseline: LabeledPrediction[],
  recent: LabeledPrediction[],
  thresholdRatio = 0.25,
): DriftResult {
  const baselineBrier = brierScore(baseline);
  const recentBrier = brierScore(recent);
  const delta = recentBrier - baselineBrier;
  const driftDetected = baselineBrier > 0 && delta / baselineBrier > thresholdRatio;
  return {
    driftDetected,
    baselineBrier,
    recentBrier,
    delta,
    detail: driftDetected
      ? `Recent Brier score (${recentBrier.toFixed(4)}) is ${((delta / baselineBrier) * 100).toFixed(1)}% worse than baseline (${baselineBrier.toFixed(4)}); exceeds ${(thresholdRatio * 100).toFixed(0)}% drift threshold.`
      : `No significant drift (recent ${recentBrier.toFixed(4)} vs baseline ${baselineBrier.toFixed(4)}).`,
  };
}

export interface CalibrationReport {
  ruleId: string;
  domain: string;
  periodLabel: string;
  sampleSize: number;
  brierScoreValue: number;
  expectedCalibrationErrorValue: number;
  bins: ReliabilityBin[];
  drift?: DriftResult;
}

export function buildCalibrationReport(
  ruleId: string,
  domain: string,
  periodLabel: string,
  predictions: LabeledPrediction[],
  driftComparison?: { baseline: LabeledPrediction[]; recent: LabeledPrediction[] },
): CalibrationReport {
  const bins = reliabilityBins(predictions);
  return {
    ruleId,
    domain,
    periodLabel,
    sampleSize: predictions.length,
    brierScoreValue: brierScore(predictions),
    expectedCalibrationErrorValue: expectedCalibrationError(bins, predictions.length),
    bins,
    drift: driftComparison ? detectDrift(driftComparison.baseline, driftComparison.recent) : undefined,
  };
}
