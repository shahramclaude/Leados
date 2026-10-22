// LEADOS — Part 38: generic statistical drift detectors.
//
// Two complementary detectors are implemented, matching the Phase 3(b)
// requirement for "statistical: CUSUM/EWMA on check metrics — documented
// sensitivity":
//
//  * EWMA (Exponentially Weighted Moving Average) control chart — good at
//    catching small, sustained shifts quickly without being too sensitive
//    to single-point noise.
//  * CUSUM (Cumulative Sum) — good at catching small persistent drifts that
//    accumulate over many cycles, which EWMA can be slow to flag.
//
// SENSITIVITY (documented, not tunable-by-magic):
//  - EWMA: lambda (smoothing, default 0.3) trades off responsiveness
//    (higher = more reactive to recent points, noisier) vs. smoothness
//    (lower = slower to react, more robust to noise). Control limits are
//    L * sigma (default L = 3) around the baseline, the classic Shewhart-style
//    band. With lambda=0.3 and L=3 a sustained shift of ~1 sigma is typically
//    flagged within 4-6 cycles; a shift of ~2 sigma within 2-3 cycles.
//  - CUSUM: k (slack, default 0.5 * sigma) ignores drift smaller than k per
//    step; h (decision threshold, default 5 * sigma) is how much cumulative
//    deviation is allowed before alarming. Smaller k/h = more sensitive but
//    more false positives. These defaults are the standard Montgomery (2009)
//    SPC recommendation and are intentionally conservative to avoid alert
//    fatigue — see Phase 5 "noise" answer in the delivery notes.

export interface EwmaPoint {
  value: number;
  ewma: number;
  ucl: number;
  lcl: number;
  flagged: boolean;
}

export interface EwmaResult {
  points: EwmaPoint[];
  lambda: number;
  L: number;
  flagged: boolean;
}

export function computeEWMA(
  series: number[],
  baseline: number,
  sigma: number,
  lambda = 0.3,
  L = 3,
): EwmaResult {
  const safeSigma = sigma > 0 ? sigma : Math.max(Math.abs(baseline) * 0.05, 0.0001);
  const ewmaSigma = safeSigma * Math.sqrt(lambda / (2 - lambda));
  let prevEwma = baseline;
  const points: EwmaPoint[] = series.map((value) => {
    const ewma = lambda * value + (1 - lambda) * prevEwma;
    prevEwma = ewma;
    const ucl = baseline + L * ewmaSigma;
    const lcl = baseline - L * ewmaSigma;
    return { value, ewma, ucl, lcl, flagged: ewma > ucl || ewma < lcl };
  });
  return { points, lambda, L, flagged: points.some((p) => p.flagged) };
}

export interface CusumResult {
  pos: number[];
  neg: number[];
  k: number;
  h: number;
  flagged: boolean;
  flagIndex: number | null;
}

export function computeCUSUM(
  series: number[],
  baseline: number,
  sigma: number,
  kFactor = 0.5,
  hFactor = 5,
): CusumResult {
  const safeSigma = sigma > 0 ? sigma : Math.max(Math.abs(baseline) * 0.05, 0.0001);
  const k = kFactor * safeSigma;
  const h = hFactor * safeSigma;
  let sPos = 0;
  let sNeg = 0;
  const pos: number[] = [];
  const neg: number[] = [];
  let flagIndex: number | null = null;
  series.forEach((value, i) => {
    const dev = value - baseline;
    sPos = Math.max(0, sPos + dev - k);
    sNeg = Math.min(0, sNeg + dev + k);
    pos.push(sPos);
    neg.push(sNeg);
    if (flagIndex === null && (sPos > h || Math.abs(sNeg) > h)) {
      flagIndex = i;
    }
  });
  return { pos, neg, k, h, flagged: flagIndex !== null, flagIndex };
}

export function stddev(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}

export interface DriftVerdict {
  method: "ewma" | "cusum" | "both";
  flagged: boolean;
  ewma: EwmaResult;
  cusum: CusumResult;
  latestEwma: number;
  latestCusumPos: number;
  latestCusumNeg: number;
}

/** Runs both detectors on a series vs. a declared baseline and combines them. */
export function detectDrift(series: number[], baseline: number): DriftVerdict {
  const sigma = stddev(series) || Math.max(Math.abs(baseline) * 0.05, 0.0001);
  const ewma = computeEWMA(series, baseline, sigma);
  const cusum = computeCUSUM(series, baseline, sigma);
  const flagged = ewma.flagged || cusum.flagged;
  const last = series.length - 1;
  return {
    method: "both",
    flagged,
    ewma,
    cusum,
    latestEwma: ewma.points[last]?.ewma ?? baseline,
    latestCusumPos: cusum.pos[last] ?? 0,
    latestCusumNeg: cusum.neg[last] ?? 0,
  };
}
