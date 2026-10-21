/**
 * beliefs.ts — pure, typed belief primitives.
 *
 * These are the only sanctioned ways to turn raw observations into an
 * uncertainty-aware estimate inside LEADOS. Each belief type documents its
 * conjugate update rule and the quantity it is appropriate for.
 *
 * MISUSE WARNING (see Phase 5 self-review): RateBelief assumes a bounded
 * [0,1] Bernoulli-generating process. It must never be fit to heavy-tailed
 * continuous quantities (money, duration) — use LevelBelief for those.
 */

import { betaQuantile, studentTQuantile } from "@/lib/mathUtils";

// ---------------------------------------------------------------------------
// RateBelief — Beta(alpha, beta)
// ---------------------------------------------------------------------------

export interface RateBeliefState {
  alpha: number;
  beta: number;
}

export class RateBelief {
  readonly alpha: number;
  readonly beta: number;

  /** alpha0/beta0 default to Beta(1,1) — the uninformative uniform prior. */
  constructor(alpha = 1, beta = 1) {
    if (alpha <= 0 || beta <= 0) {
      throw new Error("RateBelief requires alpha > 0 and beta > 0");
    }
    this.alpha = alpha;
    this.beta = beta;
  }

  static prior(alpha = 1, beta = 1): RateBelief {
    return new RateBelief(alpha, beta);
  }

  /** Conjugate posterior update: alpha' = alpha + successes, beta' = beta + failures. */
  update(successes: number, failures: number): RateBelief {
    if (successes < 0 || failures < 0) {
      throw new Error("successes/failures must be non-negative");
    }
    return new RateBelief(this.alpha + successes, this.beta + failures);
  }

  get mean(): number {
    return this.alpha / (this.alpha + this.beta);
  }

  get variance(): number {
    const a = this.alpha;
    const b = this.beta;
    return (a * b) / ((a + b) ** 2 * (a + b + 1));
  }

  /** Equal-tailed credible interval, e.g. level=0.8 -> 80% interval. */
  interval(level = 0.8): [number, number] {
    const tail = (1 - level) / 2;
    return [betaQuantile(tail, this.alpha, this.beta), betaQuantile(1 - tail, this.alpha, this.beta)];
  }

  /** Effective sample size — how much evidence underlies this belief. */
  get evidenceCount(): number {
    return this.alpha + this.beta - 2 /* subtract the Beta(1,1) prior pseudo-counts */;
  }

  toJSON(): RateBeliefState {
    return { alpha: this.alpha, beta: this.beta };
  }
}

// ---------------------------------------------------------------------------
// LevelBelief — Normal-Inverse-Gamma conjugate for unknown mean + variance
// ---------------------------------------------------------------------------

export interface LevelBeliefState {
  mu0: number;
  kappa0: number;
  alpha0: number;
  beta0: number;
  n: number;
}

/**
 * NIG(mu0, kappa0, alpha0, beta0): prior belief about a Normally distributed
 * quantity with unknown mean AND unknown variance. Appropriate for cycle
 * time, cost per unit, engagement scores — continuous, roughly-symmetric
 * metrics where we don't want to pretend we know the variance a priori.
 */
export class LevelBelief {
  readonly mu0: number;
  readonly kappa0: number;
  readonly alpha0: number;
  readonly beta0: number;
  readonly n: number;

  constructor(mu0 = 0, kappa0 = 1e-3, alpha0 = 1, beta0 = 1, n = 0) {
    if (kappa0 <= 0 || alpha0 <= 0 || beta0 <= 0) {
      throw new Error("LevelBelief requires kappa0, alpha0, beta0 > 0");
    }
    this.mu0 = mu0;
    this.kappa0 = kappa0;
    this.alpha0 = alpha0;
    this.beta0 = beta0;
    this.n = n;
  }

  static prior(mu0 = 0, kappa0 = 1e-3, alpha0 = 1, beta0 = 1): LevelBelief {
    return new LevelBelief(mu0, kappa0, alpha0, beta0, 0);
  }

  /** Conjugate NIG update given a fresh batch of real-valued samples. */
  updateWithSamples(samples: number[]): LevelBelief {
    if (samples.length === 0) return this;
    const n = samples.length;
    const xbar = samples.reduce((a, b) => a + b, 0) / n;
    const sumSq = samples.reduce((a, x) => a + (x - xbar) ** 2, 0);

    const kappaN = this.kappa0 + n;
    const muN = (this.kappa0 * this.mu0 + n * xbar) / kappaN;
    const alphaN = this.alpha0 + n / 2;
    const betaN =
      this.beta0 + 0.5 * sumSq + (this.kappa0 * n * (xbar - this.mu0) ** 2) / (2 * kappaN);

    return new LevelBelief(muN, kappaN, alphaN, betaN, this.n + n);
  }

  /** Posterior mean of the level (mu). */
  get mean(): number {
    return this.mu0;
  }

  /** Degrees of freedom of the exact marginal Student-t posterior for mu. */
  get dof(): number {
    return 2 * this.alpha0;
  }

  /** Scale (NOT variance) of the location-scale-t posterior marginal for mu: mu = mu0 + meanScale * T_dof. */
  get meanScale(): number {
    return Math.sqrt(this.beta0 / (this.alpha0 * this.kappa0));
  }

  /** Scale (NOT variance) of the predictive location-scale-t for a NEW observation. */
  get predictiveScale(): number {
    return Math.sqrt((this.beta0 * (this.kappa0 + 1)) / (this.alpha0 * this.kappa0));
  }

  /** Variance of the mean's marginal t-posterior. Only finite/meaningful for dof > 2 (alpha0 > 1). */
  get meanVariance(): number {
    const dof = this.dof;
    if (dof <= 2) return Infinity;
    return this.meanScale ** 2 * (dof / (dof - 2));
  }

  /** Posterior predictive variance for a NEW observation. Only finite for dof > 2. */
  get predictiveVariance(): number {
    const dof = this.dof;
    if (dof <= 2) return Infinity;
    return this.predictiveScale ** 2 * (dof / (dof - 2));
  }

  /**
   * Exact credible interval for the MEAN using the Student-t marginal
   * posterior (location mu0, scale meanScale, dof = 2*alpha0). Correct at
   * any sample size, including small n where the normal approximation would
   * badly understate tail width.
   */
  interval(level = 0.8): [number, number] {
    const tail = (1 - level) / 2;
    const tq = studentTQuantile(1 - tail, this.dof);
    return [this.mu0 - tq * this.meanScale, this.mu0 + tq * this.meanScale];
  }

  /** Exact predictive interval for a NEW observation (wider than `interval`, which is for the mean). */
  predictiveInterval(level = 0.8): [number, number] {
    const tail = (1 - level) / 2;
    const tq = studentTQuantile(1 - tail, this.dof);
    return [this.mu0 - tq * this.predictiveScale, this.mu0 + tq * this.predictiveScale];
  }

  get evidenceCount(): number {
    return this.n;
  }

  toJSON(): LevelBeliefState {
    return { mu0: this.mu0, kappa0: this.kappa0, alpha0: this.alpha0, beta0: this.beta0, n: this.n };
  }
}

// ---------------------------------------------------------------------------
// DriftBelief — EWMA control chart for trend detection
// ---------------------------------------------------------------------------

export interface DriftBeliefState {
  lambda: number;
  z: number;
  sigma: number;
  mean0: number;
  tSinceInit: number;
}

/**
 * EWMA(lambda): z_t = lambda*x_t + (1-lambda)*z_{t-1}.
 * Control limits: zbar +/- 3*sigma*sqrt(lambda/(2-lambda)).
 * Used for metric trend/drift detection (e.g. week-over-week engagement).
 */
export class DriftBelief {
  readonly lambda: number;
  readonly z: number;
  readonly sigma: number;
  readonly mean0: number;
  readonly tSinceInit: number;

  constructor(lambda = 0.3, z = 0, sigma = 1, mean0 = 0, tSinceInit = 0) {
    if (lambda <= 0 || lambda > 1) throw new Error("lambda must be in (0, 1]");
    if (sigma < 0) throw new Error("sigma must be >= 0");
    this.lambda = lambda;
    this.z = z;
    this.sigma = sigma;
    this.mean0 = mean0;
    this.tSinceInit = tSinceInit;
  }

  static init(lambda: number, initialMean: number, initialSigma: number): DriftBelief {
    return new DriftBelief(lambda, initialMean, initialSigma, initialMean, 0);
  }

  /** Feed one new observation; sigma is re-estimated via EWMA of squared residuals. */
  update(x: number): DriftBelief {
    const residual = x - this.z;
    const newSigma = Math.sqrt(
      this.lambda * residual * residual + (1 - this.lambda) * this.sigma * this.sigma,
    );
    const newZ = this.lambda * x + (1 - this.lambda) * this.z;
    return new DriftBelief(this.lambda, newZ, newSigma || this.sigma, this.mean0, this.tSinceInit + 1);
  }

  /** +/- 3-sigma EWMA control limits around the long-run mean. */
  controlLimits(): [number, number] {
    const width = 3 * this.sigma * Math.sqrt(this.lambda / (2 - this.lambda));
    return [this.mean0 - width, this.mean0 + width];
  }

  get isOutOfControl(): boolean {
    const [lo, hi] = this.controlLimits();
    return this.z < lo || this.z > hi;
  }

  /** Reported interval is the current EWMA statistic's own uncertainty band (not the control limits). */
  interval(): [number, number] {
    const width = 1.96 * this.sigma * Math.sqrt(this.lambda / (2 - this.lambda));
    return [this.z - width, this.z + width];
  }

  get evidenceCount(): number {
    return this.tSinceInit;
  }

  toJSON(): DriftBeliefState {
    return { lambda: this.lambda, z: this.z, sigma: this.sigma, mean0: this.mean0, tSinceInit: this.tSinceInit };
  }
}
