// src/lib/intelligence/bayesian.ts
//
// Low-level probability primitives shared by beliefFabric.ts and
// bayesianNetwork.ts. Every formula here is a textbook result — referenced
// inline — so reviewers can check the math instead of trusting a magic
// number. See docs/INTELLIGENCE.md §1 for the worked derivations.

/** Parameters of a Beta(alpha, beta) distribution used as the conjugate
 * prior/posterior for a belief about a probability (e.g. "this deal closes",
 * "this metric stays healthy"). Beta-Bernoulli conjugacy means the posterior
 * after observing `s` successes and `f` failures is simply
 * Beta(alpha + s, beta + f) — no numerical integration required. */
export interface BetaParams {
  alpha: number;
  beta: number;
}

export const UNINFORMATIVE_PRIOR: BetaParams = { alpha: 1, beta: 1 };

/** Mean of Beta(alpha, beta) = alpha / (alpha + beta). */
export function betaMean(p: BetaParams): number {
  return p.alpha / (p.alpha + p.beta);
}

/** Variance of Beta(alpha, beta) = (a*b) / ((a+b)^2 * (a+b+1)). Used to
 * derive confidence: the more concentrated the distribution, the more
 * confident the belief. */
export function betaVariance(p: BetaParams): number {
  const { alpha: a, beta: b } = p;
  const sum = a + b;
  return (a * b) / (sum * sum * (sum + 1));
}

/** Confidence score in [0, 1) derived from the "effective sample size"
 * (alpha + beta) of a Beta belief. Confidence asymptotically approaches 1 as
 * more consistent evidence accumulates, and is explicitly penalised by
 * contradictions via `contradictionPenalty` (see beliefFabric.ts). This is a
 * deliberately simple, monotonic, bounded transform — not a probability
 * itself — documented so it is reproducible:
 *   confidence = (1 - 1/(1 + n/k)) * (1 - contradictionPenalty)
 * where n = alpha+beta-2 (evidence observed beyond the uninformative prior)
 * and k is a half-saturation constant (k=8 means ~8 pieces of agreeing
 * evidence yields ~50% of maximum confidence).
 */
export function betaConfidence(p: BetaParams, contradictionPenalty = 0, k = 8): number {
  const n = Math.max(0, p.alpha + p.beta - 2);
  const base = 1 - 1 / (1 + n / k);
  return clamp01(base * (1 - clamp01(contradictionPenalty)));
}

/** Continued-fraction-free approximation of the regularized incomplete beta
 * function inverse (quantile function) using the Newton-Raphson method
 * seeded by a normal approximation. Good to ~1e-9 for our use (UI credible
 * intervals), which is far more precision than needed for a dashboard. */
export function betaQuantile(p: BetaParams, q: number): number {
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  const { alpha: a, beta: b } = p;
  // Normal approximation seed (Wilson-Hilferty style) then refine.
  let x = normalApproxQuantile(a, b, q);
  x = Math.min(0.999999, Math.max(0.000001, x));
  for (let i = 0; i < 100; i++) {
    const cdf = regularizedIncompleteBeta(x, a, b);
    const pdf = betaPdf(x, a, b);
    if (pdf === 0) break;
    const delta = (cdf - q) / pdf;
    const next = x - delta;
    const clamped = Math.min(0.999999, Math.max(0.000001, next));
    if (Math.abs(clamped - x) < 1e-10) {
      x = clamped;
      break;
    }
    x = clamped;
  }
  return x;
}

function normalApproxQuantile(a: number, b: number, q: number): number {
  const mean = a / (a + b);
  const variance = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const z = inverseStandardNormalCdf(q);
  return mean + z * Math.sqrt(variance);
}

function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b));
}

function logGamma(x: number): number {
  // Lanczos approximation (g=7, n=9), standard numerical recipe.
  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = coefficients[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += coefficients[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/** Regularized incomplete beta function I_x(a, b) via a continued fraction
 * (Numerical Recipes §6.4). This is the Beta CDF. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logBeta(a, b) * -1 + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function inverseStandardNormalCdf(p: number): number {
  // Acklam's algorithm, standard rational approximation.
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** Two-sided credible interval [low, high] covering `level` probability mass
 * (e.g. level=0.9 -> 90% credible interval), using the equal-tailed method:
 * low = quantile((1-level)/2), high = quantile(1-(1-level)/2). */
export function betaCredibleInterval(p: BetaParams, level = 0.9): { low: number; high: number } {
  const tail = (1 - level) / 2;
  return {
    low: betaQuantile(p, tail),
    high: betaQuantile(p, 1 - tail),
  };
}

/** Bayesian update of a Beta belief given weighted evidence. Weighted
 * evidence (successWeight, failureWeight) generalises simple counts so a
 * single piece of evidence can carry partial strength (e.g. a metric signal
 * worth 0.4 of a "success"). This is standard conjugate updating:
 *   posterior = Beta(alpha + successWeight, beta + failureWeight)
 */
export function betaUpdate(prior: BetaParams, successWeight: number, failureWeight: number): BetaParams {
  return {
    alpha: prior.alpha + Math.max(0, successWeight),
    beta: prior.beta + Math.max(0, failureWeight),
  };
}

/** Symmetrised KL-divergence-style "surprise" score between what new
 * evidence implies (its own mean) and what the current belief already
 * holds. Used to flag contradictions: if a new observation's implied
 * probability sits far in the tail of the current belief distribution, it
 * is evidence of disagreement between sources rather than just noise. We
 * use the z-score of the new observation against the current Beta's mean
 * and standard deviation, which is simple, explainable, and reproducible. */
export function contradictionZScore(current: BetaParams, observedMean: number): number {
  const mean = betaMean(current);
  const sd = Math.sqrt(betaVariance(current)) || 1e-6;
  return Math.abs(observedMean - mean) / sd;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Brier score for a single probabilistic prediction: (p - outcome)^2.
 * Lower is better; 0 is a perfect forecast, 0.25 is what you get from
 * always predicting 0.5, 1 is a maximally wrong confident forecast. */
export function brierScoreSingle(predictedProbability: number, outcome: 0 | 1): number {
  return (predictedProbability - outcome) ** 2;
}
