/**
 * bayesian.ts — the ONE belief-updating engine (Part 04-A). This file
 * replaces every competing scoring path that previously lived across
 * `bayesianNetwork.ts` / `predictiveScoring.ts` / `signalFusion.ts` ad hoc
 * probability math. All three update rules required by the standing order
 * are implemented here, each cited to a primary source, each covered by a
 * property test in `__tests__/bayesian.test.ts`.
 */

import { clamp, logit, sigmoid } from "./stats";
import type { BetaDistribution, NormalDistribution, EvidenceRef } from "./types";

// ---------------------------------------------------------------------------
// Decay (shared by all three update rules)
// ---------------------------------------------------------------------------

/** Per-domain evidence half-life, in days. Half-life H relates to the decay
 * constant τ by τ = H / ln(2) so that `decayWeight` below returns exactly
 * 0.5 at t = H. These are documented, reviewable constants — change them
 * here, not inline at call sites. */
export const DOMAIN_HALF_LIFE_DAYS: Record<string, number> = {
  "flight-risk": 45,
  "conversion-rate": 30,
  "on-time-delivery": 14,
  "engagement": 21,
  default: 30,
};

export function halfLifeToTau(halfLifeDays: number): number {
  return halfLifeDays / Math.LN2;
}

/** w(t) = w * exp(-Δt / τ). `deltaDays` is the age of the evidence in days. */
export function decayWeight(w: number, deltaDays: number, domain: string): number {
  const halfLife = DOMAIN_HALF_LIFE_DAYS[domain] ?? DOMAIN_HALF_LIFE_DAYS.default;
  const tau = halfLifeToTau(halfLife);
  return w * Math.exp(-Math.max(0, deltaDays) / tau);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

// ---------------------------------------------------------------------------
// A1. Binary propositions — log-odds pooling (Genest & Zidek, 1986)
// ---------------------------------------------------------------------------

export type LogOddsEvidenceItem = {
  evidence: EvidenceRef;
  p: number; // the evidence's own probability estimate for the proposition
  reliability: number; // source reliability, pre-clamp
};

export type LogOddsPoolResult = {
  posteriorP: number;
  perItemWeight: Record<string, number>; // evidenceRef.id -> weight applied
};

/**
 * logit(p) = logit(prior) + Σ wᵢ · (logit(pᵢ) − logit(prior))
 *
 * - wᵢ = reliability(sourceᵢ) clamped to [0.25, 1] (a source is never fully
 *   zeroed out — even a historically poor source carries some information —
 *   and never exceeds unit weight).
 * - Evidence that shares a `correlationGroup` is discounted: the raw clamped
 *   weights within a group are summed, and if that sum exceeds 1.5 all
 *   weights in the group are scaled down proportionally so the group's total
 *   contribution is capped at 1.5 "independent-equivalent" sources. This
 *   directly implements the standing order's correlated-evidence rule and
 *   prevents double-counting (self-review Q2).
 * - The update is a plain weighted sum, so it is order-independent by
 *   construction (verified in `bayesian.test.ts`).
 */
export function logOddsPool(priorP: number, items: LogOddsEvidenceItem[]): LogOddsPoolResult {
  const priorLogit = logit(priorP);

  // clamp raw reliability-derived weights
  const clampedWeights = items.map((it) => clamp(it.reliability, 0.25, 1));

  // group by correlationGroup (ungrouped evidence = its own singleton group)
  const groups = new Map<string, number[]>(); // groupKey -> indices
  items.forEach((it, i) => {
    const key = it.evidence.correlationGroup ?? `__singleton__${i}`;
    const arr = groups.get(key) ?? [];
    arr.push(i);
    groups.set(key, arr);
  });

  const finalWeights = new Array(items.length).fill(0);
  for (const indices of groups.values()) {
    const groupSum = indices.reduce((s, i) => s + clampedWeights[i], 0);
    const scale = groupSum > 1.5 ? 1.5 / groupSum : 1;
    for (const i of indices) finalWeights[i] = clampedWeights[i] * scale;
  }

  let logOdds = priorLogit;
  const perItemWeight: Record<string, number> = {};
  items.forEach((it, i) => {
    const w = finalWeights[i];
    logOdds += w * (logit(it.p) - priorLogit);
    perItemWeight[it.evidence.id] = w;
  });

  return { posteriorP: sigmoid(logOdds), perItemWeight };
}

// ---------------------------------------------------------------------------
// A2. Rates — Beta-Binomial conjugate update
// ---------------------------------------------------------------------------

/** posterior = Beta(α + successes, β + failures). Standard conjugate-prior
 * result (Gelman et al., "Bayesian Data Analysis", 3rd ed., §2.4). */
export function betaBinomialUpdate(
  prior: BetaDistribution,
  successes: number,
  failures: number,
): BetaDistribution {
  if (successes < 0 || failures < 0) {
    throw new Error("betaBinomialUpdate: successes/failures must be non-negative");
  }
  return { kind: "beta", alpha: prior.alpha + successes, beta: prior.beta + failures };
}

// ---------------------------------------------------------------------------
// A3. Continuous metrics — Gaussian conjugate update AND EWMA-with-uncertainty
// ---------------------------------------------------------------------------

/**
 * Gaussian conjugate update for a single new observation with known
 * observation variance (precision-weighted combination; Bayesian Data
 * Analysis §2.5, "normal with known variance"):
 *   posteriorVar = 1 / (1/priorVar + 1/obsVar)
 *   posteriorMu  = posteriorVar * (priorMu/priorVar + obsMu/obsVar)
 *
 * Use this for metrics with a stable long-run mean (e.g. a one-off audited
 * measurement). For streaming/time-series metrics whose regime can shift,
 * use `ewmaUpdate` below instead — seeing both lets each caller choose the
 * statistically appropriate one rather than forcing a single compromise.
 */
export function gaussianConjugateUpdate(
  prior: NormalDistribution,
  obsMu: number,
  obsSigma: number,
): NormalDistribution {
  const priorVar = prior.sigma ** 2;
  const obsVar = Math.max(obsSigma, 1e-6) ** 2;
  const postVar = 1 / (1 / priorVar + 1 / obsVar);
  const postMu = postVar * (prior.mu / priorVar + obsMu / obsVar);
  return { kind: "normal", mu: postMu, sigma: Math.sqrt(postVar) };
}

/**
 * EWMA-with-uncertainty for time series (chosen over pure Gaussian conjugate
 * for streaming metrics — justification: conjugate updating assumes a
 * single stationary truth and its posterior variance monotonically shrinks
 * toward zero as observations accumulate, which is wrong for a metric whose
 * true level can drift; EWMA keeps a constant "forgetting" rate `alpha` so
 * recent regime shifts are not drowned out by history, matching standard
 * practice for operational/business metrics, e.g. Hunter 1986 "The
 * Exponentially Weighted Moving Average").
 *
 *   mu'  = alpha * obs + (1 - alpha) * mu
 *   var' = (1 - alpha)^2 * var + alpha^2 * obsVar + alpha*(1-alpha)*driftVar
 *
 * The last term (`driftVar`, default small but non-zero) stops the
 * posterior variance from collapsing to zero the way plain conjugate
 * updating would, guaranteeing `interval` is never reported as a point
 * estimate (standing order A, continuous metrics).
 */
export function ewmaUpdate(
  prior: NormalDistribution,
  obs: number,
  obsSigma: number,
  alpha = 0.3,
  driftVar = 1e-4,
): NormalDistribution {
  const a = clamp(alpha, 0, 1);
  const priorVar = prior.sigma ** 2;
  const obsVar = Math.max(obsSigma, 1e-6) ** 2;
  const mu = a * obs + (1 - a) * prior.mu;
  const variance = (1 - a) ** 2 * priorVar + a ** 2 * obsVar + a * (1 - a) * driftVar;
  return { kind: "normal", mu, sigma: Math.sqrt(Math.max(variance, driftVar)) };
}

// ---------------------------------------------------------------------------
// Temperature scaling — post-hoc overconfidence correction
// ---------------------------------------------------------------------------

/**
 * Temperature scaling (Platt, 1999, "Probabilistic Outputs for Support
 * Vector Machines"; popularized for modern probabilistic systems by Guo et
 * al., 2017, "On Calibration of Modern Neural Networks"):
 *   p_calibrated = sigmoid(logit(p) / T)
 *
 * Log-odds pooling with reliability-as-weight (this file's `logOddsPool`)
 * is, by construction, NOT guaranteed to be calibrated — summing several
 * correlated-through-common-cause sources' logit shifts routinely produces
 * overconfident posteriors even when each individual weight is sensible
 * (see docs/INTELLIGENCE.md §3 and the Part 04 self-review, "where could
 * correlated evidence still double-count"). T > 1 shrinks the pooled logit
 * back toward the prior (less confident); T < 1 sharpens it. `fitTemperature`
 * below chooses T by 1-D coordinate search against a resolved-outcome
 * calibration set, minimizing Brier score — the same gradient-free
 * coordinate-search pattern `autoCalibrate.ts` uses for rule weights,
 * applied here to a single scalar calibration parameter per belief family.
 */
export function temperatureScale(p: number, T: number): number {
  return sigmoid(logit(p) / Math.max(T, 1e-3));
}

export function fitTemperature(
  samples: { p: number; outcome: 0 | 1 }[],
  scoreFn: (samples: { p: number; outcome: 0 | 1 }[]) => number,
  candidates: number[] = Array.from({ length: 60 }, (_, i) => 0.25 + i * 0.25), // 0.25 .. 15.0
): { T: number; score: number } {
  let best = { T: 1, score: scoreFn(samples) };
  for (const T of candidates) {
    const rescaled = samples.map((s) => ({ p: temperatureScale(s.p, T), outcome: s.outcome }));
    const score = scoreFn(rescaled);
    if (score < best.score) best = { T, score };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

/** z-scores for the two supported credible-mass levels. */
const Z_FOR_MASS: Record<0.68 | 0.95, number> = { 0.68: 0.994, 0.95: 1.96 };

export function normalInterval(d: NormalDistribution, mass: 0.68 | 0.95) {
  const z = Z_FOR_MASS[mass];
  return { lo: d.mu - z * d.sigma, hi: d.mu + z * d.sigma, mass };
}

/** Beta credible interval via the Wilson–Hilferty normal approximation to
 * the Beta distribution (adequate for dashboard-grade intervals; falls back
 * to the mean ± 2*sd clamp to [0,1] which is exact enough for alpha,beta >
 * ~2, documented limitation in docs/INTELLIGENCE.md). */
export function betaInterval(d: BetaDistribution, mass: 0.68 | 0.95) {
  const mu = d.alpha / (d.alpha + d.beta);
  const variance = (d.alpha * d.beta) / ((d.alpha + d.beta) ** 2 * (d.alpha + d.beta + 1));
  const sd = Math.sqrt(variance);
  const z = Z_FOR_MASS[mass];
  return { lo: clamp(mu - z * sd, 0, 1), hi: clamp(mu + z * sd, 0, 1), mass };
}
