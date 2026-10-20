/**
 * stats.ts — the ONE math/statistics module for the intelligence subsystem.
 *
 * Every formula below is named and cited. Nothing here is decorative: each
 * function has a property or numeric test in `__tests__/stats.test.ts` and
 * is consumed by at least one engine (`bayesian.ts`, `ruleCalibration.ts`,
 * `monteCarlo.ts`, `signalFusion.ts`). This file replaces any ad hoc math
 * previously scattered across `math.ts` / `mathUtils.ts` — those names are
 * intentionally not reintroduced; everything numeric lives here.
 */

const EPS = 1e-9;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** logit(p) = ln(p / (1-p)). Probability is clamped to (eps, 1-eps) to avoid
 * ±Infinity at the boundary — standard numerical-stability practice for
 * log-odds pooling (Genest & Zidek, 1986, "Combining Probability
 * Distributions: A Critique and an Annotated Bibliography"). */
export function logit(p: number): number {
  const pc = clamp(p, EPS, 1 - EPS);
  return Math.log(pc / (1 - pc));
}

/** sigmoid(x) = 1 / (1 + e^-x), the inverse of logit. */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Abramowitz & Stegun (1964) formula 7.1.26 rational approximation of the
 * error function, max absolute error 1.5e-7. Used to build the standard
 * normal CDF for Gaussian conjugate updates and CRPS. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
}

export function std(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

export function quantile(sortedXs: number[], q: number): number {
  if (sortedXs.length === 0) return NaN;
  const pos = clamp(q, 0, 1) * (sortedXs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedXs[lo];
  const frac = pos - lo;
  return sortedXs[lo] * (1 - frac) + sortedXs[hi] * frac;
}

// ---------------------------------------------------------------------------
// Calibration / scoring-rule metrics (Part 04-D)
// ---------------------------------------------------------------------------

export type ProbOutcome = { p: number; outcome: 0 | 1 };

/** Brier score (Brier, 1950, "Verification of Forecasts Expressed in Terms
 * of Probability"): mean squared error between predicted probability and
 * the realized binary outcome. 0 = perfect, 0.25 = uninformative p=0.5,
 * 1 = perfectly wrong. */
export function brierScore(samples: ProbOutcome[]): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => acc + (s.p - s.outcome) ** 2, 0);
  return sum / samples.length;
}

/** Logarithmic (log) loss / negative log-likelihood for binary probabilistic
 * forecasts: -mean(y*ln(p) + (1-y)*ln(1-p)). Punishes confident wrong calls
 * far more harshly than Brier score. */
export function logLoss(samples: ProbOutcome[]): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => {
    const p = clamp(s.p, EPS, 1 - EPS);
    return acc + (s.outcome === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0);
  return -sum / samples.length;
}

/** Expected Calibration Error with 10 equal-width bins over [0,1]
 * (Naeini, Cooper & Hauskrecht, 2015, "Obtaining Well Calibrated
 * Probabilities Using Bayesian Binning"). ECE = Σ (|bin| / N) * |acc(bin) -
 * conf(bin)|. Lower is better; this program's gate is ECE ≤ 0.05 per
 * calibrated rule family. */
export function expectedCalibrationError(samples: ProbOutcome[], bins = 10): number {
  if (samples.length === 0) return NaN;
  const buckets: ProbOutcome[][] = Array.from({ length: bins }, () => []);
  for (const s of samples) {
    const idx = Math.min(bins - 1, Math.floor(clamp(s.p, 0, 1) * bins));
    buckets[idx].push(s);
  }
  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    const conf = mean(bucket.map((b) => b.p));
    const acc = mean(bucket.map((b) => b.outcome));
    ece += (bucket.length / samples.length) * Math.abs(acc - conf);
  }
  return ece;
}

/** Reliability-diagram data: per-bin (confidence, accuracy, count) used by
 * the rule-health UI surface. Same binning as `expectedCalibrationError`. */
export function reliabilityDiagram(samples: ProbOutcome[], bins = 10) {
  const buckets: ProbOutcome[][] = Array.from({ length: bins }, () => []);
  for (const s of samples) {
    const idx = Math.min(bins - 1, Math.floor(clamp(s.p, 0, 1) * bins));
    buckets[idx].push(s);
  }
  return buckets.map((bucket, i) => ({
    binLo: i / bins,
    binHi: (i + 1) / bins,
    count: bucket.length,
    avgConfidence: bucket.length ? mean(bucket.map((b) => b.p)) : null,
    avgAccuracy: bucket.length ? mean(bucket.map((b) => b.outcome)) : null,
  }));
}

/** CRPS (Continuous Ranked Probability Score) for a Gaussian forecast,
 * closed form (Gneiting & Raftery, 2007, "Strictly Proper Scoring Rules,
 * Prediction, and Estimation", eq. 21):
 *   CRPS(N(mu,sigma), y) = sigma * [ z*(2*Phi(z) - 1) + 2*phi(z) - 1/sqrt(pi) ]
 *   where z = (y - mu) / sigma.
 * Lower is better; 0 is a perfect deterministic hit. */
export function crpsGaussian(mu: number, sigma: number, y: number): number {
  const s = Math.max(sigma, EPS);
  const z = (y - mu) / s;
  return s * (z * (2 * normalCdf(z) - 1) + 2 * normalPdf(z) - 1 / Math.sqrt(Math.PI));
}

/** CRPS estimated from a sample/ensemble forecast (empirical CDF), via the
 * standard energy-score identity (Gneiting & Raftery 2007, eq. 3):
 *   CRPS = E|X - y| - 0.5*E|X - X'|
 * approximated with the finite sample mean over all pairs. Used for
 * Monte Carlo / histogram forecasts that are not assumed Gaussian. */
export function crpsEmpirical(samples: number[], y: number): number {
  const n = samples.length;
  if (n === 0) return NaN;
  const termA = mean(samples.map((x) => Math.abs(x - y)));
  let pairSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      pairSum += Math.abs(samples[i] - samples[j]);
    }
  }
  const termB = pairSum / (n * n);
  return termA - 0.5 * termB;
}

/** Population Stability Index between a baseline and current distribution,
 * computed over shared bin edges (industry-standard drift metric, e.g.
 * Siddiqi, 2006, "Credit Risk Scorecards"). PSI = Σ (cur% - base%) *
 * ln(cur% / base%). Rule-of-thumb thresholds: <0.1 stable, 0.1-0.25 minor
 * drift, >0.25 major drift — this program alarms at >0.25 (see
 * `driftDetection.ts`). */
export function populationStabilityIndex(
  baseline: number[],
  current: number[],
  bins = 10,
  lo = 0,
  hi = 1,
): number {
  if (baseline.length === 0 || current.length === 0) return 0;
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins);
  const bucketOf = (x: number) => {
    const c = clamp(x, lo, hi - EPS);
    for (let i = 0; i < bins; i++) {
      if (c >= edges[i] && c < edges[i + 1]) return i;
    }
    return bins - 1;
  };
  const baseCounts = new Array(bins).fill(0);
  const curCounts = new Array(bins).fill(0);
  for (const x of baseline) baseCounts[bucketOf(x)]++;
  for (const x of current) curCounts[bucketOf(x)]++;
  let psi = 0;
  for (let i = 0; i < bins; i++) {
    const basePct = Math.max(baseCounts[i] / baseline.length, EPS);
    const curPct = Math.max(curCounts[i] / current.length, EPS);
    psi += (curPct - basePct) * Math.log(curPct / basePct);
  }
  return psi;
}

export type CusumState = { sHi: number; sLo: number; alarmed: boolean };

/** Two-sided CUSUM control chart (Page, 1954, "Continuous Inspection
 * Schemes") over a residual stream. `k` is the allowance (slack, typically
 * 0.5 * expected shift in std-dev units) and `h` the decision interval
 * (alarm threshold, typically 4-5 std-devs). Returns the updated state;
 * `alarmed` flips true once either accumulator crosses `h` and stays true
 * until explicitly reset, matching standard SPC practice. */
export function cusumStep(
  prev: CusumState,
  residual: number,
  target: number,
  k: number,
  h: number,
): CusumState {
  const sHi = Math.max(0, prev.sHi + (residual - target) - k);
  const sLo = Math.max(0, prev.sLo + (target - residual) - k);
  return { sHi, sLo, alarmed: prev.alarmed || sHi > h || sLo > h };
}

export function cusumInit(): CusumState {
  return { sHi: 0, sLo: 0, alarmed: false };
}

/** p95 latency helper used by the eval harness to gate engine performance. */
export function p95(durationsMs: number[]): number {
  if (durationsMs.length === 0) return 0;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return quantile(sorted, 0.95);
}
