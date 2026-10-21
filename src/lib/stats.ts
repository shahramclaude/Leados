/**
 * stats.ts — scoring rules & calibration metrics used by the eval harness
 * (npm run eval:intelligence) and by the weekly self-check in ai-learn.
 *
 * Formulas (documented so no "invented metric" rule is violated):
 *   Brier score:  BS = (1/N) * Σ (p_i − o_i)^2            o_i ∈ {0,1}
 *   Log loss:     LL = −(1/N) * Σ [ o·ln(p) + (1−o)·ln(1−p) ]
 *   ECE:          Σ_b (|B_b|/N) * |acc(B_b) − conf(B_b)|   10 equal-width bins
 */

export interface PredictionOutcome {
  /** Predicted probability of the positive outcome, in [0, 1]. */
  p: number;
  /** Realized outcome: 1 = event happened, 0 = it did not. */
  o: 0 | 1;
}

export function brierScore(samples: PredictionOutcome[]): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => acc + (s.p - s.o) ** 2, 0);
  return sum / samples.length;
}

const LOG_EPS = 1e-12;

export function logLoss(samples: PredictionOutcome[]): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => {
    const p = Math.min(1 - LOG_EPS, Math.max(LOG_EPS, s.p));
    return acc + (s.o === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);
  return -sum / samples.length;
}

export interface ReliabilityBin {
  binLo: number;
  binHi: number;
  count: number;
  avgConfidence: number;
  avgAccuracy: number;
  gap: number;
}

export interface CalibrationReport {
  n: number;
  brierScore: number;
  logLoss: number;
  ece: number;
  bins: ReliabilityBin[];
}

/** Expected Calibration Error with `numBins` equal-width confidence bins. */
export function expectedCalibrationError(
  samples: PredictionOutcome[],
  numBins = 10,
): { ece: number; bins: ReliabilityBin[] } {
  const bins: ReliabilityBin[] = Array.from({ length: numBins }, (_, i) => ({
    binLo: i / numBins,
    binHi: (i + 1) / numBins,
    count: 0,
    avgConfidence: 0,
    avgAccuracy: 0,
    gap: 0,
  }));

  const sums = bins.map(() => ({ conf: 0, acc: 0, count: 0 }));

  for (const s of samples) {
    let idx = Math.floor(s.p * numBins);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    sums[idx].conf += s.p;
    sums[idx].acc += s.o;
    sums[idx].count += 1;
  }

  let ece = 0;
  const n = samples.length || 1;
  for (let i = 0; i < numBins; i++) {
    const { conf, acc, count } = sums[i];
    if (count === 0) continue;
    const avgConfidence = conf / count;
    const avgAccuracy = acc / count;
    const gap = Math.abs(avgAccuracy - avgConfidence);
    bins[i].count = count;
    bins[i].avgConfidence = avgConfidence;
    bins[i].avgAccuracy = avgAccuracy;
    bins[i].gap = gap;
    ece += (count / n) * gap;
  }

  return { ece, bins };
}

export function calibrationReport(samples: PredictionOutcome[], numBins = 10): CalibrationReport {
  const { ece, bins } = expectedCalibrationError(samples, numBins);
  return {
    n: samples.length,
    brierScore: brierScore(samples),
    logLoss: logLoss(samples),
    ece,
    bins,
  };
}

export function reliabilityBinsToCsv(bins: ReliabilityBin[]): string {
  const header = "bin_lo,bin_hi,count,avg_confidence,avg_accuracy,gap";
  const rows = bins.map(
    (b) =>
      `${b.binLo.toFixed(2)},${b.binHi.toFixed(2)},${b.count},${b.avgConfidence.toFixed(4)},${b.avgAccuracy.toFixed(4)},${b.gap.toFixed(4)}`,
  );
  return [header, ...rows].join("\n");
}

export function reliabilityBinsToText(bins: ReliabilityBin[]): string {
  const lines = [
    "bin            n     avg_conf   avg_acc    gap",
    "-------------  ----  ---------  ---------  ------",
  ];
  for (const b of bins) {
    const label = `${b.binLo.toFixed(1)}-${b.binHi.toFixed(1)}`.padEnd(13);
    lines.push(
      `${label}  ${String(b.count).padEnd(4)}  ${b.avgConfidence.toFixed(3).padEnd(9)}  ${b.avgAccuracy.toFixed(3).padEnd(9)}  ${b.gap.toFixed(3)}`,
    );
  }
  return lines.join("\n");
}

/** Coverage check: fraction of outcomes that actually fell inside their declared interval. */
export function intervalCoverage(
  samples: { lo: number; hi: number; observed: number }[],
): number {
  if (samples.length === 0) return NaN;
  const covered = samples.filter((s) => s.observed >= s.lo && s.observed <= s.hi).length;
  return covered / samples.length;
}

/** Relative Monte Carlo standard error: SE / |mean|, used as the convergence criterion. */
export function relativeMcError(se: number, meanEstimate: number): number {
  const denom = Math.max(Math.abs(meanEstimate), 1e-9);
  return se / denom;
}
