/**
 * app/core/domain/evidence.js — the Evidence Terminal (Schema v66, ADR-0055).
 *
 * THE QUESTION NINETY-ONE SESSIONS LEFT UNANSWERED
 * ------------------------------------------------
 * LeadOS pre-registers interventions (`impact.js`, Schema v31), freezes
 * predictions everywhere (scorecards v47, fidelity v50, merit v51, design v53,
 * survival v63, wait v64, parity v65), and grades them when reality arrives. It
 * has never done the one thing that turns a file of evaluations into
 * knowledge: **pool them**.
 *
 * A manager who has run six intervention studies owns six anecdotes. Six
 * anecdotes about the same class of problem, pooled with an explicit
 * heterogeneity estimate, are a finding — and a finding is the only thing that
 * can justify "we do it this way here". No leadership product on the market
 * runs a random-effects meta-analysis over its user's own management practice,
 * prices the value of one more experiment, and then writes the resulting
 * standard back into the work. That is what this module does.
 *
 * NAMED METHODS, IMPLEMENTED RATHER THAN GESTURED AT
 * --------------------------------------------------
 *  1. Evidence-based management (Rousseau 2006; Briner, Denyer & Rousseau
 *     2009; Pfeffer & Sutton 2006 *Hard Facts*): the practitioner's own
 *     practice is the evidence base, and the unit of analysis is the
 *     pre-registered prediction, not the retrospective story.
 *  2. Random-effects meta-analysis (DerSimonian & Laird 1986): inverse-variance
 *     pooling with a between-study variance component τ² estimated from
 *     Cochran's Q. Reported with I² (Higgins & Thompson 2002; Higgins et al.
 *     2003) and, as the conservative sensitivity, the Hartung–Knapp–Sidik–
 *     Jonkman interval (Hartung & Knapp 2001; Sidik & Jonkman 2002), which is
 *     the interval that survives when τ² is badly estimated from few studies.
 *  3. Small-study asymmetry: Egger's regression intercept test (Egger, Davey
 *     Smith, Schneider & Minder 1997), refused below ten studies because
 *     below ten it is a test of nothing.
 *  4. Empirical-Bayes shrinkage: under the random-effects model the posterior
 *     mean of a cell's true effect is (y/se² + μ/τ²)/(1/se² + 1/τ²) — the
 *     model's own shrinkage, not a tuning knob. A cell estimated from two
 *     noisy studies is pulled toward the pooled mean by exactly the amount its
 *     own evidence does not justify.
 *  5. Proportion meta-analysis on the logit scale with the Haldane–Anscombe
 *     0.5 continuity correction, plus Wilson (1927) score intervals as the
 *     descriptive per-source interval.
 *  6. Proper scoring: Brier (1950) against the sample base rate as the
 *     reference forecast, giving a skill score; calibration-in-the-large via a
 *     normal approximation to the binomial test of observed events against
 *     expected events.
 *  7. Value of information with a normal prior and linear loss (Raiffa &
 *     Schlaifer 1961; Pratt, Raiffa & Schlaifer 1995): the expected value of
 *     one more experiment is N·(g(μ, v) − max(0, μ)) where
 *     g(μ, s) = μΦ(μ/s) + sφ(μ/s) and v = √(s² − s′²) is the standard
 *     deviation of the predictive distribution of the posterior mean. When
 *     v = s the experiment is perfect and this equals EVPI; when v = 0 it is
 *     worthless and returns exactly zero. This is the same quantity the
 *     Information Value Terminal (Schema v54) computes for a decision frame,
 *     applied here to the leader's own practice.
 *  8. Replication discipline (Ioannidis 2005; Open Science Collaboration
 *     2015): a single confirmatory result is a hypothesis, not a standard.
 *     The module counts replications and refuses to call one study a finding.
 *
 * ENFORCED HONESTY BOUNDARIES
 * ---------------------------
 *  - A cell below `evidenceMinPoolStudies` is reported as counts, never pooled.
 *    Meta-analysis of two studies is a number with a confidence interval
 *    shaped like a guess, and printing it as a finding is how a practice
 *    becomes superstition.
 *  - Heterogeneity is reported before the pooled estimate is interpreted. When
 *    I² is high the module says the average is not a policy.
 *  - Designs are never mixed. An interrupted time series and a survival
 *    probability are different instruments; the terminal shows them side by
 *    side and pools within a family only.
 *  - Exploratory (post-hoc) hypotheses are counted and displayed, never
 *    pooled. Pooling them would let a leader improve the evidence base by
 *    declaring hypotheses after seeing the answer.
 *  - No person is scored. The unit of analysis is an intervention in a system.
 *  - Nothing is invented for an existing workspace: with no scored studies the
 *    terminal says there is no evidence yet and lists what would produce some.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { gradeOf } from './impact.js';
import { INTERVENTION_BY_ID, INTERVENTION_TYPES } from './interventionTypes.js';
import { VITAL_BY_ID, VITALS } from './vitals.js';

export const EVIDENCE_ENGINE_VERSION = 'evidence-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Conventions                                                      */
/* ------------------------------------------------------------------ */

export const EVIDENCE_DEFAULTS = Object.freeze({
  // Studies in one (intervention × outcome) cell before the terminal will
  // pool it. Below this the cell is counts-only. Three is the floor used by
  // Cochrane for a random-effects estimate to mean anything at all.
  evidenceMinPoolStudies: 3,
  // Studies before τ², I² and the heterogeneity test are printed.
  evidenceMinHeterogeneity: 4,
  // Studies before Egger's intercept test is allowed to speak.
  evidenceMinEggerStudies: 10,
  // Resolved probability predictions before calibration is scored.
  evidenceMinResolutions: 6,
  // N: how many more times the leader expects to face this kind of problem.
  // The value of experimenting scales with it, and it is the leader's number.
  evidenceHorizonDecisions: 6,
  // Weight on the information bonus when ranking what to do next. 1 means
  // "value a point of effect and a point of learning equally".
  evidenceExploreWeight: 1,
  // Two-sided alpha for every interval in the terminal.
  evidenceAlpha: 0.1,
  // Days after freezing before a review is due to be graded.
  evidenceReviewDays: 30,
  // Owned tasks opened per scan.
  evidenceMaxTasksPerScan: 3,
  // `recommends-for` edges written per scan, from a review to open cases.
  evidenceMaxCaseLinks: 5,
  // Frozen reviews retained.
  evidenceReviewCap: 40,
  // Post-commit propagation pause. An explicit scan always runs.
  evidenceAutoPropagate: true,
});

export function evidenceConventionsFromSettings(settings = {}) {
  const s = settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, fallback, min, max) => Math.min(max, Math.max(min, Math.round(num(value, fallback))));
  const alpha = [0.2, 0.1, 0.05].includes(Number(s.evidenceAlpha)) ? Number(s.evidenceAlpha) : EVIDENCE_DEFAULTS.evidenceAlpha;
  return {
    minPoolStudies: int(s.evidenceMinPoolStudies, EVIDENCE_DEFAULTS.evidenceMinPoolStudies, 2, 20),
    minHeterogeneity: int(s.evidenceMinHeterogeneity, EVIDENCE_DEFAULTS.evidenceMinHeterogeneity, 2, 50),
    minEggerStudies: int(s.evidenceMinEggerStudies, EVIDENCE_DEFAULTS.evidenceMinEggerStudies, 3, 50),
    minResolutions: int(s.evidenceMinResolutions, EVIDENCE_DEFAULTS.evidenceMinResolutions, 3, 50),
    horizonDecisions: int(s.evidenceHorizonDecisions, EVIDENCE_DEFAULTS.evidenceHorizonDecisions, 1, 200),
    exploreWeight: Math.min(5, Math.max(0, num(s.evidenceExploreWeight, EVIDENCE_DEFAULTS.evidenceExploreWeight))),
    alpha,
    reviewDays: int(s.evidenceReviewDays, EVIDENCE_DEFAULTS.evidenceReviewDays, 1, 365),
    maxTasksPerScan: int(s.evidenceMaxTasksPerScan, EVIDENCE_DEFAULTS.evidenceMaxTasksPerScan, 0, 10),
    maxCaseLinks: int(s.evidenceMaxCaseLinks, EVIDENCE_DEFAULTS.evidenceMaxCaseLinks, 0, 50),
    reviewCap: int(s.evidenceReviewCap, EVIDENCE_DEFAULTS.evidenceReviewCap, 5, 200),
    autoPropagate: s.evidenceAutoPropagate !== false,
  };
}

export const EVIDENCE_SIGNAL_IDS = Object.freeze([
  'EBM-01', 'EBM-02', 'EBM-03', 'EBM-04', 'EBM-05', 'EBM-06', 'EBM-07', 'EBM-08',
]);

/** The two evidence families this terminal keeps strictly apart. */
export const EVIDENCE_FAMILIES = Object.freeze(['effect', 'resolution']);

export const EVIDENCE_FAMILY_LABELS = Object.freeze({
  effect: 'Intervention effect (interrupted time series)',
  resolution: 'Pre-registered probability (Brier-scored)',
});

/** Where a resolved probability prediction came from. */
export const RESOLUTION_SOURCES = Object.freeze(['impact', 'premise', 'performance']);

export const RESOLUTION_SOURCE_LABELS = Object.freeze({
  impact: 'Pre-registered intervention study',
  premise: 'Assumption (premise) outcome',
  performance: 'Support-plan outcome',
});

/* ------------------------------------------------------------------ */
/* 1. Numerics                                                         */
/* ------------------------------------------------------------------ */

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const LN_SQRT_2PI = Math.log(SQRT_2PI);

/** Standard normal density. */
export function normalPdf(z) {
  if (!Number.isFinite(z)) return 0;
  return Math.exp(-0.5 * z * z) / SQRT_2PI;
}

/** Abramowitz & Stegun 7.1.26. |ε| < 1.5e-7, far inside any interval we print. */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return 0.5;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value from a z statistic. */
export function twoSidedPz(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))));
}

/**
 * Acklam's rational approximation to the inverse normal CDF, refined by one
 * Halley step. Accurate to ~1e-15, which is far better than the inputs deserve
 * and costs nothing.
 */
export function normalQuantile(p) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return NaN;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425;
  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley refinement.
  const e = normalCdf(x) - p;
  const u = e * SQRT_2PI * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Log-gamma (Lanczos, g = 7). */
function lnGamma(x) {
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) {
    // Reflection; x is never <= 0 here in practice, but guard anyway.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = g[0];
  const t = z + 7.5;
  for (let i = 1; i < g.length; i += 1) a += g[i] / (z + i);
  return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(s, x) by series. Requires x < s + 1. */
function gammaLowerSeries(s, x) {
  let sum = 1 / s;
  let term = sum;
  for (let n = 1; n < 1000; n += 1) {
    term *= x / (s + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
  }
  return sum * Math.exp(-x + s * Math.log(x) - lnGamma(s));
}

/** Regularized upper incomplete gamma Q(s, x) by Lentz continued fraction. */
function gammaUpperFraction(s, x) {
  const tiny = 1e-300;
  let b = x + 1 - s;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h;
}

/** Upper tail of the chi-square distribution, P(X² > x) with df. */
export function chiSquareUpper(x, df) {
  if (!Number.isFinite(x) || !(df > 0)) return 1;
  if (x <= 0) return 1;
  const s = df / 2;
  const z = x / 2;
  return z < s + 1 ? Math.max(0, Math.min(1, 1 - gammaLowerSeries(s, z))) : Math.max(0, Math.min(1, gammaUpperFraction(s, z)));
}

/** Continued fraction for the incomplete beta (Lentz). */
function betaContinuedFraction(a, b, x) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
function betaIncReg(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a Student t statistic. */
export function twoSidedPt(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return 1;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, betaIncReg(df / 2, 0.5, x)));
}

/**
 * Inverse Student t by bisection on the CDF. Bisection is used deliberately:
 * it is exact to the tolerance asked for and cannot fail to bracket, which a
 * Newton scheme on a heavy-tailed density can.
 */
export function tQuantile(p, df) {
  if (!Number.isFinite(p)) return NaN;
  const target = Math.min(0.999999, Math.max(0.5000005, p));
  let lo = 0;
  let hi = 1000;
  while (twoSidedPt(hi, df) > 2 * (1 - target)) hi *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (twoSidedPt(mid, df) > 2 * (1 - target)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Wilson (1927) score interval for a proportion, in percent. */
export function wilsonInterval(k, n, alpha = 0.1) {
  if (!(n > 0)) return { rate: null, lo: null, hi: null };
  const z = normalQuantile(1 - alpha / 2);
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    rate: round2(p * 100),
    lo: round2(Math.max(0, centre - half) * 100),
    hi: round2(Math.min(1, centre + half) * 100),
  };
}

/* ------------------------------------------------------------ rounding */

function round2(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function round3(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function round4(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

/* ------------------------------------------------------------------ */
/* 2. Random-effects meta-analysis                                     */
/* ------------------------------------------------------------------ */

/**
 * DerSimonian–Laird random-effects pool of independent estimates.
 *
 * `units` is [{ estimate, se }]. Returns the pooled mean, its standard error,
 * τ² and the heterogeneity summary, the Hartung–Knapp interval as the
 * conservative sensitivity, and the interval-agreement flag. Below two studies
 * this returns null: one study is a result, not a synthesis.
 */
export function randomEffectsPool(units, { alpha = 0.1, minHeterogeneity = 4 } = {}) {
  const rows = (units || []).filter((u) => u && Number.isFinite(u.estimate) && Number.isFinite(u.se) && u.se > 0);
  const n = rows.length;
  if (n < 2) return null;
  const z = normalQuantile(1 - alpha / 2);

  // Fixed-effect weights and Cochran's Q.
  let sumW = 0;
  let sumWy = 0;
  for (const row of rows) {
    const w = 1 / (row.se * row.se);
    row._w = w;
    sumW += w;
    sumWy += w * row.estimate;
  }
  const fixed = sumWy / sumW;
  let q = 0;
  let sumW2 = 0;
  for (const row of rows) {
    q += row._w * (row.estimate - fixed) ** 2;
    sumW2 += row._w * row._w;
  }
  const df = n - 1;
  const c = sumW - sumW2 / sumW;
  const tau2Raw = c > 0 ? (q - df) / c : 0;
  const tau2 = Math.max(0, tau2Raw);
  const i2 = q > 0 ? Math.max(0, ((q - df) / q) * 100) : 0;
  const pQ = df > 0 ? chiSquareUpper(q, df) : 1;

  // Random-effects weights.
  let sumWs = 0;
  let sumWsy = 0;
  for (const row of rows) {
    const w = 1 / (row.se * row.se + tau2);
    row._ws = w;
    sumWs += w;
    sumWsy += w * row.estimate;
  }
  const pooled = sumWsy / sumWs;
  const se = Math.sqrt(1 / sumWs);
  const ciLo = pooled - z * se;
  const ciHi = pooled + z * se;

  // Hartung–Knapp–Sidik–Jonkman: replaces z·se with a t quantile on the
  // RE-weighted residual variance. It is the interval that does not collapse
  // when τ² is badly estimated from a handful of studies.
  let hkNum = 0;
  for (const row of rows) hkNum += row._ws * (row.estimate - pooled) ** 2;
  const hkSe = df > 0 ? Math.sqrt((hkNum / df) / sumWs) : se;
  const tCrit = df > 0 ? tQuantile(1 - alpha / 2, df) : z;
  const hkLo = pooled - tCrit * hkSe;
  const hkHi = pooled + tCrit * hkSe;

  return {
    n,
    method: 'DerSimonian–Laird random effects',
    pooled: round3(pooled),
    se: round4(se),
    ciLo: round3(ciLo),
    ciHi: round3(ciHi),
    zAlpha: round4(z),
    // Hartung–Knapp sensitivity.
    hkLo: round3(hkLo),
    hkHi: round3(hkHi),
    hkSe: round4(hkSe),
    // The headline interval is the wider of the two: when a more conservative
    // method disagrees, the terminal reports the conservative one rather than
    // choosing the answer it likes.
    reportedLo: round3(Math.min(ciLo, hkLo)),
    reportedHi: round3(Math.max(ciHi, hkHi)),
    intervalsAgree: Math.abs((ciHi - ciLo) - (hkHi - hkLo)) <= Math.max(0.5, 0.25 * (ciHi - ciLo)),
    heterogeneity: {
      tau2: round4(tau2),
      tau: round3(Math.sqrt(tau2)),
      q: round3(q),
      df,
      pQ: round4(pQ),
      i2: round2(i2),
      // Heterogeneity is only *reported* above the floor; below it Q has no
      // power to distinguish "the studies agree" from "there are two studies".
      reportable: n >= minHeterogeneity,
      label: n < minHeterogeneity
        ? 'not reportable'
        : (i2 >= 75 ? 'considerable' : (i2 >= 50 ? 'substantial' : (i2 >= 25 ? 'moderate' : 'low'))),
    },
  };
}

/**
 * Empirical-Bayes posterior mean for a single cell under the pooled model.
 *
 * θ_j ~ N(pooled, τ²), y_j | θ_j ~ N(θ_j, se_j²) gives
 *   E[θ_j | y_j] = (y_j/se_j² + pooled/τ²) / (1/se_j² + 1/τ²).
 * This is shrinkage the model implies, not a penalty the app invented.
 */
export function empiricalBayesMean(estimate, se, pooled, tau2) {
  if (!Number.isFinite(estimate) || !(se > 0)) return null;
  if (!Number.isFinite(pooled)) return round3(estimate);
  if (!(tau2 > 0)) return round3(pooled);
  const wData = 1 / (se * se);
  const wPrior = 1 / tau2;
  return round3((estimate * wData + pooled * wPrior) / (wData + wPrior));
}

/**
 * Egger's regression intercept test for small-study asymmetry.
 *
 * Regresses the standardized effect z_i = y_i/se_i on precision x_i = 1/se_i
 * and tests the intercept against zero with n − 2 df. Below ten studies the
 * test has essentially no power and the funnel is a shape, not a signal, so
 * the module refuses rather than printing a p-value nobody should act on.
 */
export function eggerTest(units, { minStudies = 10 } = {}) {
  const rows = (units || []).filter((u) => u && Number.isFinite(u.estimate) && Number.isFinite(u.se) && u.se > 0);
  const n = rows.length;
  if (n < minStudies) {
    return { ok: false, n, refused: true, reason: `Egger's test needs at least ${minStudies} studies; ${n} available. Below that the funnel plot is a shape, not a signal.` };
  }
  let sx = 0;
  let sy = 0;
  for (const row of rows) {
    row._x = 1 / row.se;
    row._y = row.estimate / row.se;
    sx += row._x;
    sy += row._y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (const row of rows) {
    sxx += (row._x - mx) ** 2;
    sxy += (row._x - mx) * (row._y - my);
  }
  if (!(sxx > 0)) return { ok: false, n, refused: true, reason: 'Every study carries the same precision, so no regression is defined.' };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let rss = 0;
  for (const row of rows) rss += (row._y - (intercept + slope * row._x)) ** 2;
  const df = n - 2;
  const seResid = Math.sqrt(rss / df);
  const seIntercept = seResid * Math.sqrt(1 / n + (mx * mx) / sxx);
  if (!(seIntercept > 0)) return { ok: false, n, refused: true, reason: 'The regression is degenerate.' };
  const t = intercept / seIntercept;
  return {
    ok: true,
    n,
    refused: false,
    intercept: round4(intercept),
    seIntercept: round4(seIntercept),
    t: round3(t),
    df,
    p: round4(twoSidedPt(t, df)),
    asymmetric: twoSidedPt(t, df) < 0.1,
  };
}

/**
 * Leave-one-out sensitivity, with the influence flagged rather than left for
 * the reader to notice.
 *
 * A pooled estimate is a claim about a literature, not about one study. If
 * deleting one study moves the answer by more than one standard error of the
 * full pool, the pool is carrying that study and the reader is entitled to
 * know it — the number is the same either way, but its meaning is not.
 *
 * `signFlip` is the harsher test: whether dropping the study moves the
 * interval across zero, i.e. changes whether there is an effect at all.
 */
export function leaveOneOut(units, options = {}) {
  const rows = units || [];
  if (rows.length < 3) return [];
  const full = randomEffectsPool(rows, options);
  if (!full) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const subset = rows.filter((_, index) => index !== i);
    const pool = randomEffectsPool(subset, options);
    if (!pool) continue;
    const shift = pool.pooled - full.pooled;
    const signFlip = (full.ciLo > 0 || full.ciHi < 0)
      && !((pool.ciLo > 0 || pool.ciHi < 0) && Math.sign(pool.ciLo || pool.ciHi) === Math.sign(full.ciLo || full.ciHi));
    // The threshold is the median within-study standard error, deliberately
    // NOT the pooled SE: τ² is itself inflated by an outlier, so testing the
    // shift against the pooled SE is circular and would clear every outlier.
    const threshold = Math.max(median(rows.map((row) => Number(row.se))), 0);
    out.push({
      id: rows[i].id || `unit-${i + 1}`,
      pooled: pool.pooled,
      ciLo: pool.ciLo,
      ciHi: pool.ciHi,
      shift: round3(shift),
      influential: Math.abs(shift) > threshold || signFlip,
      signFlip,
    });
  }
  return out;
}

/** Cumulative pooling in the order the evidence was produced. */
export function cumulativePool(units, options = {}) {
  const out = [];
  const acc = [];
  for (let i = 0; i < (units || []).length; i += 1) {
    acc.push(units[i]);
    if (acc.length < 2) {
      out.push({ k: acc.length, pooled: null, ciLo: null, ciHi: null, insufficient: true });
      continue;
    }
    const pool = randomEffectsPool(acc, options);
    out.push(pool
      ? { k: acc.length, pooled: pool.pooled, ciLo: pool.ciLo, ciHi: pool.ciHi, insufficient: false }
      : { k: acc.length, pooled: null, ciLo: null, ciHi: null, insufficient: true });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Value of information for the leader's own practice               */
/* ------------------------------------------------------------------ */

/**
 * g(μ, s) = E[max(0, θ)] for θ ~ N(μ, s²).
 *
 * This is the closed form of the expected value of a decision made with
 * perfect foresight between "do it" (value θ) and "don't" (value 0).
 */
export function expectedValueWithPerfectInformation(mean, sd) {
  if (!(sd > 0)) return Math.max(0, mean);
  return mean * normalCdf(mean / sd) + sd * normalPdf(mean / sd);
}

/**
 * EVPI and EVSI for a normal prior with linear loss over N decisions.
 *
 *   v = √(s² − s′²),  s′² = (1/s² + 1/σ²)⁻¹
 *   value without information = N·max(0, μ)
 *   value after one trial     = N·(μΦ(μ/v) + vφ(μ/v))
 *   EVSI = value after one trial − value without information
 *   EVPI = N·(μΦ(μ/s) + sφ(μ/s)) − value without information
 *
 * v is the standard deviation of the *predictive* distribution of the posterior
 * mean, which is why an uninformative trial (σ → ∞ ⇒ s′ → s ⇒ v → 0) is worth
 * exactly zero and a perfect one (σ → 0 ⇒ v → s) is worth EVPI. Both limits are
 * asserted by tests in this module rather than argued in prose.
 */
export function valueOfInformation({ mean = 0, sd = 0, noise = null, decisions = 1 } = {}) {
  const N = Math.max(0, Number(decisions) || 0);
  const mu = Number.isFinite(mean) ? mean : 0;
  const s = Number.isFinite(sd) && sd > 0 ? sd : 0;
  const without = N * Math.max(0, mu);
  if (!(s > 0) || N === 0) {
    return { evpi: 0, evsi: 0, without: 0, with: 0, posteriorSd: round4(s), predictiveSd: 0, resolvable: false };
  }
  const evpi = Math.max(0, N * expectedValueWithPerfectInformation(mu, s) - without);
  if (noise === null || !Number.isFinite(noise) || !(noise > 0)) {
    return { evpi: round4(evpi), evsi: null, without: round4(without), with: null, posteriorSd: null, predictiveSd: null, resolvable: false, reason: 'No within-study noise was declared, so the value of one more trial cannot be priced.' };
  }
  const postVar = 1 / (1 / (s * s) + 1 / (noise * noise));
  const v = Math.sqrt(Math.max(0, s * s - postVar));
  const withInfo = v > 0 ? N * expectedValueWithPerfectInformation(mu, v) : without;
  return {
    evpi: round4(evpi),
    evsi: round4(Math.max(0, withInfo - without)),
    without: round4(without),
    with: round4(withInfo),
    posteriorSd: round4(Math.sqrt(postVar)),
    predictiveSd: round4(v),
    // How much of the uncertainty one trial can remove, as a share of the SD.
    resolutionShare: round3(v / s),
    resolvable: v > 0,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Harvesting the evidence                                          */
/* ------------------------------------------------------------------ */

function median(values) {
  const rows = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

/**
 * Effect units from scored impact studies.
 *
 * Only a *frozen, scored* study is evidence: an evaluation that has not been
 * locked is a draft. The standardized effect is the level shift as a
 * percentage of the pre-period mean, which is dimensionless and therefore the
 * only figure that can be pooled across different metrics. Its standard error
 * is converted the same way.
 *
 * The sign is then ORIENTED so that positive always means "better". A fall in
 * feedback latency is an improvement, not a backfire, and a pooled average
 * across metrics would be meaningless if half of them ran the other way. The
 * un-oriented level shift is kept beside it, because a reader is entitled to
 * see both the direction of the raw change and what it means.
 */
export function harvestEffectUnits(state = {}) {
  const studies = Array.isArray(state.impactStudies) ? state.impactStudies : [];
  const units = [];
  for (const study of studies) {
    if (!study || study.status !== 'scored' || !study.lockedOn) continue;
    const ev = study.evaluation;
    if (!ev || ev.ok !== true) continue;
    const its = ev.its;
    if (!its || !Number.isFinite(its.levelShift) || !Number.isFinite(its.seLevel) || !(its.seLevel > 0)) continue;
    if (!Number.isFinite(its.preMean) || Math.abs(its.preMean) <= 0) continue;
    const direction = ev.direction || VITAL_BY_ID[study.vitalId]?.direction || 'up-good';
    const sign = direction === 'down-good' ? -1 : 1;
    const rawEffect = (its.levelShift / Math.abs(its.preMean)) * 100;
    const effect = sign * rawEffect;
    const se = (its.seLevel / Math.abs(its.preMean)) * 100;
    if (!Number.isFinite(effect) || !Number.isFinite(se) || !(se > 0)) continue;
    const grade = gradeOf(study);
    units.push({
      id: study.id,
      family: 'effect',
      design: 'its',
      interventionType: study.interventionType || 'other',
      outcomeId: study.vitalId || null,
      outcomeLabel: ev.vitalLabel || (VITAL_BY_ID[study.vitalId]?.label ?? study.vitalId) || 'metric',
      outcomeDirection: direction,
      effect: round3(effect),
      rawEffect: round3(rawEffect),
      se: round4(se),
      grade,
      oriented: sign < 0,
      at: ev.window?.treatmentDate || study.windowStart || study.lockedOn.slice(0, 10),
      verdict: ev.verdict || null,
      replicationOfId: study.replicationOfId || null,
      preBuckets: ev.window?.preBuckets ?? null,
      postBuckets: ev.window?.postBuckets ?? null,
      // Window bounds, used for the overlap check below. Buckets are weekly,
      // so the pre-period is `preBuckets` weeks before the treatment date.
      windowFrom: ev.window?.treatmentDate && Number.isFinite(ev.window.preBuckets)
        ? addDays(String(ev.window.treatmentDate).slice(0, 10), -7 * ev.window.preBuckets)
        : null,
      windowTo: ev.window?.treatmentDate && Number.isFinite(ev.window.postBuckets)
        ? addDays(String(ev.window.treatmentDate).slice(0, 10), 7 * ev.window.postBuckets)
        : null,
    });
  }
  return units.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** One probability prediction that has since resolved. */
function resolutionUnit({ id, source, predicted, outcome, at, interventionType = null, label = '' }) {
  if (!Number.isFinite(predicted) || !(predicted > 0) || !(predicted < 1)) return null;
  if (outcome !== 0 && outcome !== 1) return null;
  return {
    id,
    family: 'resolution',
    source,
    sourceLabel: RESOLUTION_SOURCE_LABELS[source] || source,
    predicted: Math.min(0.99, Math.max(0.01, predicted)),
    outcome,
    at: at || null,
    interventionType,
    label,
  };
}

/**
 * Resolved probability predictions from three places the workspace already
 * records them. Only *pre-registered* numbers enter: an `expectedConfidence`
 * declared before the window closed, a premise prior recorded at registration,
 * and a support-plan probability frozen at adoption.
 *
 * A verdict the design could not resolve (underpowered, trend-broken,
 * inconclusive, partial) is not a failed prediction. Counting it as one is the
 * single easiest way to make an honest forecaster look dishonest.
 */
export function harvestResolutionUnits(state = {}) {
  const units = [];

  // (a) Pre-registered intervention hypotheses.
  for (const study of (Array.isArray(state.impactStudies) ? state.impactStudies : [])) {
    if (!study || study.status !== 'scored' || !study.lockedOn) continue;
    const ev = study.evaluation;
    if (!ev || ev.ok !== true) continue;
    if (!['supported', 'not-supported'].includes(ev.verdict)) continue;
    const confidence = Number(study.expectedConfidence);
    if (!Number.isFinite(confidence)) continue;
    const unit = resolutionUnit({
      id: study.id,
      source: 'impact',
      predicted: confidence / 100,
      outcome: ev.verdict === 'supported' ? 1 : 0,
      at: study.lockedOn.slice(0, 10),
      interventionType: study.interventionType || 'other',
    });
    if (unit) units.push(unit);
  }

  // (b) Assumption (premise) priors against their recorded outcome.
  const premises = new Map((Array.isArray(state.premises) ? state.premises : []).map((p) => [p.id, p]));
  for (const outcome of (Array.isArray(state.premiseOutcomes) ? state.premiseOutcomes : [])) {
    if (!outcome || !['held', 'failed'].includes(outcome.verdict)) continue;
    const premise = premises.get(outcome.premiseId);
    if (!premise) continue;
    const prior = Number(premise.priorPct);
    if (!Number.isFinite(prior)) continue;
    const unit = resolutionUnit({
      id: outcome.id,
      source: 'premise',
      predicted: prior / 100,
      outcome: outcome.verdict === 'held' ? 1 : 0,
      at: outcome.settledOn || null,
    });
    if (unit) units.push(unit);
  }

  // (c) Support-plan probabilities frozen at adoption.
  for (const concern of (Array.isArray(state.performanceConcerns) ? state.performanceConcerns : [])) {
    if (!concern) continue;
    const prediction = concern.plan?.prediction;
    const verdict = concern.outcome?.verdict;
    if (!prediction || !['met', 'not-met'].includes(verdict)) continue;
    const pct = Number(prediction.probabilityPct);
    if (!Number.isFinite(pct)) continue;
    const unit = resolutionUnit({
      id: concern.id,
      source: 'performance',
      predicted: pct / 100,
      outcome: verdict === 'met' ? 1 : 0,
      at: concern.outcome?.reviewedOn || null,
    });
    if (unit) units.push(unit);
  }

  return units.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

/* ------------------------------------------------------------------ */
/* 5. Verdicts on a pooled cell                                        */
/* ------------------------------------------------------------------ */

const CELL_VERDICTS = {
  'no-evidence': { label: 'No evidence yet', tone: 'neutral', plain: 'Nothing here has been pre-registered and scored, so there is nothing to synthesise.' },
  'counts-only': { label: 'Counts only', tone: 'neutral', plain: 'Too few studies to pool. This is a count, not a finding.' },
  'works-here': { label: 'Works here', tone: 'good', plain: 'The pooled effect is reliably in the useful direction.' },
  'harms-here': { label: 'Backfires here', tone: 'bad', plain: 'The pooled effect is reliably in the harmful direction.' },
  'no-detectable-effect': { label: 'No detectable effect', tone: 'caution', plain: 'The pooled effect includes zero. This is not proof of no effect — it is an interval that still contains zero.' },
  heterogeneous: { label: 'Depends where you use it', tone: 'caution', plain: 'The studies disagree by more than sampling noise allows, so the average is not a policy.' },
};

export function cellVerdictMeta(key) {
  return CELL_VERDICTS[key] || CELL_VERDICTS['no-detectable-effect'];
}

/**
 * Classify a cell. Heterogeneity outranks the point estimate on purpose: an
 * average over studies that disagree by more than chance is a statement about
 * the arithmetic, not about the world, and the terminal says so first.
 */
function classifyCell(pool, conventions) {
  if (!pool) return 'counts-only';
  const het = pool.heterogeneity;
  if (het.reportable && het.i2 >= 75 && het.pQ !== null && het.pQ < 0.1) return 'heterogeneous';
  if (pool.reportedLo > 0) return 'works-here';
  if (pool.reportedHi < 0) return 'harms-here';
  return 'no-detectable-effect';
}

/* ------------------------------------------------------------------ */
/* 6. The report                                                       */
/* ------------------------------------------------------------------ */

function interventionLabel(id) {
  return INTERVENTION_BY_ID[id]?.label || id || 'intervention';
}

/**
 * How many pairs of studies in a cell share calendar time.
 *
 * Random-effects meta-analysis assumes the study estimates are independent.
 * Two interrupted time series over the *same* team metric whose windows
 * overlap are not independent: they share the same observations, and pooling
 * them as if they were separate studies understates the pooled standard error.
 *
 * No tool this author knows of flags this for a manager, so the terminal counts
 * the overlapping pairs and prints them beside the pooled estimate instead of
 * quietly pretending the assumption held.
 */
export function overlappingPairs(units = []) {
  const rows = (units || []).filter((u) => u && u.windowFrom && u.windowTo);
  let count = 0;
  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[i].windowFrom <= rows[j].windowTo && rows[j].windowFrom <= rows[i].windowTo) {
        count += 1;
        pairs.push([rows[i].id, rows[j].id]);
      }
    }
  }
  return { count, pairs, comparable: rows.length >= 2 };
}

/** Group key for an effect cell. */
export function effectCellKey(interventionType, outcomeId) {
  return `${interventionType || 'other'}|${outcomeId || 'unknown'}`;
}

/** The pooling core speaks `estimate`; an effect unit speaks `effect`. */
function toEstimateRows(units) {
  return (units || []).map((unit) => ({ ...unit, estimate: unit.effect }));
}

function buildEffectCells(units, conventions) {
  const groups = new Map();
  for (const unit of units) {
    const key = effectCellKey(unit.interventionType, unit.outcomeId);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        interventionType: unit.interventionType,
        interventionLabel: interventionLabel(unit.interventionType),
        outcomeId: unit.outcomeId,
        outcomeLabel: unit.outcomeLabel,
        outcomeDirection: unit.outcomeDirection,
        oriented: unit.oriented === true,
        units: [],
      });
    }
    groups.get(key).units.push(unit);
  }
  const cells = [];
  for (const group of groups.values()) {
    const sorted = [...group.units].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const confirmatory = sorted.filter((u) => u.grade === 'confirmatory');
    // Pooling uses pre-registered evidence only. Exploratory studies are
    // counted and shown, never pooled: pooling them would reward declaring a
    // hypothesis after the answer arrived.
    const poolable = confirmatory.length >= conventions.minPoolStudies ? confirmatory : null;
    const pool = poolable ? randomEffectsPool(toEstimateRows(poolable), conventions) : null;
    const egger = poolable ? eggerTest(toEstimateRows(poolable), conventions) : null;
    const verdict = classifyCell(pool, conventions);
    const noise = median(sorted.map((u) => u.se));
    const eb = pool ? empiricalBayesMean(pool.pooled, pool.se, pool.pooled, pool.heterogeneity.tau2) : null;
    cells.push({
      ...group,
      n: sorted.length,
      nConfirmatory: confirmatory.length,
      nExploratory: sorted.length - confirmatory.length,
      firstAt: sorted[0]?.at || null,
      lastAt: sorted[sorted.length - 1]?.at || null,
      // Independent confirmations: a study with a replicationOfId is not a
      // new piece of evidence about whether the effect exists, it is a test of
      // whether the first one was real. Both count, but only for replication.
      roots: sorted.filter((u) => !u.replicationOfId).length,
      replications: sorted.filter((u) => u.replicationOfId).length,
      overlap: overlappingPairs(sorted),
      oriented: group.oriented === true,
      pool,
      eligible: Boolean(pool),
      refusalReason: pool
        ? null
        : `Only ${confirmatory.length} pre-registered study(ies); pooling needs ${conventions.minPoolStudies}.`,
      egger: egger && egger.ok ? egger : null,
      eggerRefusal: egger && !egger.ok ? egger.reason : null,
      leaveOneOut: poolable && poolable.length >= 3 ? leaveOneOut(toEstimateRows(poolable), conventions) : [],
      cumulative: cumulativePool(toEstimateRows(poolable || sorted), conventions),
      eb,
      noise,
      verdict,
      verdictMeta: cellVerdictMeta(verdict),
    });
  }
  return cells.sort((a, b) => (b.n - a.n) || String(a.key).localeCompare(String(b.key)));
}

/** Group key for a resolution cell. */
export function resolutionCellKey(source) {
  return source || 'unknown';
}

function buildResolutionCells(units, conventions) {
  const groups = new Map();
  for (const unit of units) {
    if (!groups.has(unit.source)) {
      groups.set(unit.source, { key: unit.source, label: RESOLUTION_SOURCE_LABELS[unit.source] || unit.source, units: [] });
    }
    groups.get(unit.source).units.push(unit);
  }
  const cells = [];
  for (const group of groups.values()) {
    const n = group.units.length;
    const k = group.units.filter((u) => u.outcome === 1).length;
    const brier = group.units.reduce((acc, u) => acc + (u.predicted - u.outcome) ** 2, 0) / n;
    const baseRate = k / n;
    const refBrier = group.units.reduce((acc, u) => acc + (baseRate - u.outcome) ** 2, 0) / n;
    const meanPredicted = group.units.reduce((acc, u) => acc + u.predicted, 0) / n;
    // Calibration-in-the-large: observed events against expected events.
    const expected = group.units.reduce((acc, u) => acc + u.predicted, 0);
    const variance = group.units.reduce((acc, u) => acc + u.predicted * (1 - u.predicted), 0);
    const z = variance > 0 ? (k - expected) / Math.sqrt(variance) : null;
    // Logit random-effects pooling of the support rate, Haldane-corrected so a
    // cell that is 0/n or n/n still has a finite (and clearly labelled) estimate.
    const kc = k + 0.5;
    const nc = n + 1;
    const logit = Math.log(kc / (nc - kc));
    const logitSe = Math.sqrt(1 / kc + 1 / (nc - kc));
    cells.push({
      ...group,
      n,
      k,
      observedRatePct: round2(baseRate * 100),
      wilson: wilsonInterval(k, n, conventions.alpha),
      meanPredictedPct: round2(meanPredicted * 100),
      calibrationGapPp: round2((meanPredicted - baseRate) * 100),
      brier: round4(brier),
      referenceBrier: round4(refBrier),
      skill: refBrier > 0 ? round4(1 - brier / refBrier) : null,
      calibrationZ: z === null ? null : round3(z),
      calibrationP: z === null ? null : round4(twoSidedPz(z)),
      overconfident: z !== null && z < 0 && twoSidedPz(z) < 0.1,
      underconfident: z !== null && z > 0 && twoSidedPz(z) < 0.1,
      // Single-cell logit estimate with its own SE; pooling across the three
      // sources happens in `resolutionPool` below with the same machinery.
      logit: round4(logit),
      logitSe: round4(logitSe),
      pooledRatePct: round2((1 / (1 + Math.exp(-logit))) * 100),
      scored: n >= conventions.minResolutions,
    });
  }
  const order = RESOLUTION_SOURCES.map((s) => s);
  return cells.sort((a, b) => (order.indexOf(a.key) - order.indexOf(b.key)));
}

function buildResolutionPool(cells, conventions) {
  const rows = cells.map((cell) => ({ estimate: cell.logit, se: cell.logitSe, id: cell.key }));
  const pool = randomEffectsPool(rows, { ...conventions, minHeterogeneity: 3 });
  if (!pool) return null;
  return {
    ...pool,
    pooledRatePct: round2((1 / (1 + Math.exp(-pool.pooled))) * 100),
    rateLoPct: round2((1 / (1 + Math.exp(-pool.reportedLo))) * 100),
    rateHiPct: round2((1 / (1 + Math.exp(-pool.reportedHi))) * 100),
    note: 'Log-odds random-effects pool with the Haldane–Anscombe 0.5 correction, which every proportion here needs because a source that is 0-for-n or n-for-n has an infinite log-odds without it.',
  };
}

/* ------------------------------------------------------------------ */
/* 7. What should I do next?                                           */
/* ------------------------------------------------------------------ */

/**
 * Rank every intervention for one outcome by expected effect plus the priced
 * value of what one more trial would teach.
 *
 * The exploitation term is the cell's empirical-Bayes posterior mean (the
 * model's own shrinkage). The exploration term is the EVSI of running one more
 * study, priced over `horizonDecisions` future applications, because an
 * intervention you will use six more times is worth learning about six times
 * over. An untested intervention is not given a zero: it is given the outcome's
 * grand mean and the between-intervention spread as its prior, which is the
 * honest way to say "we do not know, and finding out is worth something".
 */
export function recommendForOutcome(cells, { outcomeId, conventions, allOutcomes = [] }) {
  const relevant = cells.filter((cell) => cell.outcomeId === outcomeId);
  const eligible = relevant.filter((cell) => cell.pool);
  const grandMean = eligible.length
    ? eligible.reduce((acc, cell) => acc + (cell.eb ?? cell.pool.pooled), 0) / eligible.length
    : null;
  // Between-intervention spread of the shrunk effects: the prior SD for an
  // intervention nobody has tested on this outcome yet.
  const spread = eligible.length >= 2
    ? Math.sqrt(eligible.reduce((acc, cell) => acc + ((cell.eb ?? cell.pool.pooled) - grandMean) ** 2, 0) / (eligible.length - 1))
    : null;
  const priorSd = spread !== null && spread > 0 ? spread : (eligible[0] ? eligible[0].pool.se : null);
  const noise = median(relevant.flatMap((cell) => cell.units.map((u) => u.se)))
    ?? median(allOutcomes.flatMap((cell) => cell.units.map((u) => u.se)));

  const rows = [];
  for (const type of INTERVENTION_TYPES) {
    const id = type.id;
    if (id === 'other') continue;
    const cell = relevant.find((c) => c.interventionType === id);
    if (cell && cell.pool) {
      const mean = cell.eb ?? cell.pool.pooled;
      const sd = cell.pool.se;
      const voi = valueOfInformation({
        mean,
        sd,
        noise: cell.noise ?? noise,
        decisions: conventions.horizonDecisions,
      });
      rows.push({
        interventionType: id,
        label: type.label,
        tested: true,
        n: cell.n,
        nConfirmatory: cell.nConfirmatory,
        mean: round3(mean),
        sd: round4(sd),
        lcb: cell.pool.reportedLo,
        ucb: cell.pool.reportedHi,
        verdict: cell.verdict,
        verdictMeta: cell.verdictMeta,
        evsi: voi.evsi,
        evpi: voi.evpi,
        resolvable: voi.resolvable,
        exploratoryBonus: null,
        note: null,
      });
      continue;
    }
    if (cell) {
      // Tested, but too few pre-registered studies to pool.
      rows.push({
        interventionType: id,
        label: type.label,
        tested: true,
        n: cell.n,
        nConfirmatory: cell.nConfirmatory,
        mean: null,
        sd: null,
        lcb: null,
        ucb: null,
        verdict: 'counts-only',
        verdictMeta: cellVerdictMeta('counts-only'),
        evsi: null,
        evpi: null,
        resolvable: false,
        exploratoryBonus: null,
        note: cell.refusalReason,
      });
      continue;
    }
    // Untested on this outcome: price the experiment, not the effect.
    if (grandMean === null || !Number.isFinite(priorSd)) {
      rows.push({
        interventionType: id,
        label: type.label,
        tested: false,
        n: 0,
        nConfirmatory: 0,
        mean: null,
        sd: null,
        lcb: null,
        ucb: null,
        verdict: 'no-evidence',
        verdictMeta: cellVerdictMeta('no-evidence'),
        evsi: null,
        evpi: null,
        resolvable: false,
        exploratoryBonus: null,
        note: 'Not tested on this outcome, and there is no other tested intervention to borrow a prior from, so there is nothing to price.',
      });
      continue;
    }
    const voi = valueOfInformation({
      mean: grandMean,
      sd: priorSd,
      noise,
      decisions: conventions.horizonDecisions,
    });
    rows.push({
      interventionType: id,
      label: type.label,
      tested: false,
      n: 0,
      nConfirmatory: 0,
      mean: null,
      sd: round4(priorSd),
      lcb: null,
      ucb: null,
      verdict: 'no-evidence',
      verdictMeta: cellVerdictMeta('no-evidence'),
      evsi: voi.evsi,
      evpi: voi.evpi,
      resolvable: voi.resolvable,
      exploratoryBonus: round3(voi.evsi),
      note: `Untested here. Priced at this outcome's grand mean (${round2(grandMean)}%) with the between-intervention spread as its prior, so the number shown is the value of finding out.`,
    });
  }

  for (const row of rows) {
    const exploit = row.mean ?? 0;
    const explore = Number.isFinite(row.evsi) ? conventions.exploreWeight * row.evsi : 0;
    row.exploit = round3(exploit);
    row.explore = round3(explore);
    row.rank = round3(exploit + explore);
    row.explorationDominant = Number.isFinite(row.evsi)
      && Number.isFinite(row.mean)
      && explore > Math.abs(exploit) + 0.01;
  }
  rows.sort((a, b) => (b.rank ?? -Infinity) - (a.rank ?? -Infinity));
  rows.forEach((row, index) => { row.position = index + 1; });
  return {
    outcomeId,
    outcomeLabel: eligible[0]?.outcomeLabel || relevant[0]?.outcomeLabel || (VITAL_BY_ID[outcomeId]?.label ?? outcomeId) || 'metric',
    horizonDecisions: conventions.horizonDecisions,
    exploreWeight: conventions.exploreWeight,
    prior: { grandMean: round3(grandMean), sd: round4(priorSd), noise: round4(noise) },
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* 8. The report                                                       */
/* ------------------------------------------------------------------ */

/**
 * Everything the terminal, the signals, the rules and the board brief need.
 * Pure: no DOM, no storage, no wall-clock.
 */
export function evidenceReport(state = {}, now = new Date(), settings = {}) {
  const conventions = evidenceConventionsFromSettings(settings);
  const effectUnits = harvestEffectUnits(state);
  const resolutionUnits = harvestResolutionUnits(state);
  const cells = buildEffectCells(effectUnits, conventions);
  const resolutionCells = buildResolutionCells(resolutionUnits, conventions);

  // The default outcome is the one with the most eligible (poolable) evidence,
  // then the most studies at all. An empty workspace returns null and the
  // terminal says so rather than inventing a focus.
  const byOutcome = new Map();
  for (const cell of cells) {
    const entry = byOutcome.get(cell.outcomeId) || { outcomeId: cell.outcomeId, label: cell.outcomeLabel, eligible: 0, n: 0 };
    entry.n += cell.n;
    if (cell.pool) entry.eligible += 1;
    byOutcome.set(cell.outcomeId, entry);
  }
  const outcomes = [...byOutcome.values()].sort((a, b) => (b.eligible - a.eligible) || (b.n - a.n) || String(a.outcomeId).localeCompare(String(b.outcomeId)));
  const focusOutcomeId = outcomes[0]?.outcomeId ?? null;

  const recommendation = focusOutcomeId
    ? recommendForOutcome(cells, { outcomeId: focusOutcomeId, conventions, allOutcomes: cells })
    : null;

  const eligibleCells = cells.filter((cell) => cell.pool);
  const reliablePositive = eligibleCells.filter((cell) => cell.verdict === 'works-here');
  const reliableNegative = eligibleCells.filter((cell) => cell.verdict === 'harms-here');
  const heterogeneousCells = eligibleCells.filter((cell) => cell.verdict === 'heterogeneous');
  const untestedCells = cells.filter((cell) => !cell.pool);

  // Replication debt: a supported cell with exactly one root study and no
  // replication is a hypothesis, and the standard says so.
  /**
   * "Unreplicated" means fewer than two INDEPENDENT results, not "no study
   * points at another". A cell can hold three estimates and still be one
   * finding: two of them may be replications of the first, and a replication
   * tests whether the original was real — it does not add a second, separate
   * reason to believe it. Requiring `replications === 0` here would miss
   * precisely the case this count exists to surface.
   */
  const unreplicated = eligibleCells.filter((cell) => cell.verdict === 'works-here' && cell.roots <= 1);

  const resolutionPool = buildResolutionPool(resolutionCells, conventions);
  const allResolutions = resolutionUnits;
  const resolutionN = allResolutions.length;
  const resolutionK = allResolutions.filter((u) => u.outcome === 1).length;
  let overallBrier = null;
  let overallRefBrier = null;
  let overallSkill = null;
  let overallGapPp = null;
  let overallZ = null;
  let overallP = null;
  if (resolutionN >= conventions.minResolutions) {
    overallBrier = allResolutions.reduce((acc, u) => acc + (u.predicted - u.outcome) ** 2, 0) / resolutionN;
    const rate = resolutionK / resolutionN;
    overallRefBrier = allResolutions.reduce((acc, u) => acc + (rate - u.outcome) ** 2, 0) / resolutionN;
    overallSkill = overallRefBrier > 0 ? 1 - overallBrier / overallRefBrier : null;
    const expected = allResolutions.reduce((acc, u) => acc + u.predicted, 0);
    const meanPredicted = expected / resolutionN;
    overallGapPp = (meanPredicted - rate) * 100;
    const variance = allResolutions.reduce((acc, u) => acc + u.predicted * (1 - u.predicted), 0);
    if (variance > 0) {
      overallZ = (resolutionK - expected) / Math.sqrt(variance);
      overallP = twoSidedPz(overallZ);
    }
  }

  return {
    engineVersion: EVIDENCE_ENGINE_VERSION,
    at: now instanceof Date ? now.toISOString() : String(now || ''),
    week: weekKey(now),
    today: dayKey(now),
    conventions,
    counts: {
      effectUnits: effectUnits.length,
      confirmatoryUnits: effectUnits.filter((u) => u.grade === 'confirmatory').length,
      exploratoryUnits: effectUnits.filter((u) => u.grade === 'exploratory').length,
      cells: cells.length,
      eligibleCells: eligibleCells.length,
      reliablePositive: reliablePositive.length,
      reliableNegative: reliableNegative.length,
      heterogeneous: heterogeneousCells.length,
      untested: untestedCells.length,
      unreplicated: unreplicated.length,
      resolutionUnits: resolutionN,
      resolutionSources: resolutionCells.length,
    },
    effects: {
      units: effectUnits,
      cells,
      eligibleCells,
      outcomes,
      focusOutcomeId,
    },
    resolutions: {
      units: resolutionUnits,
      cells: resolutionCells,
      pool: resolutionPool,
      scored: resolutionN >= conventions.minResolutions,
      n: resolutionN,
      k: resolutionK,
      brier: round4(overallBrier),
      referenceBrier: round4(overallRefBrier),
      skill: round4(overallSkill),
      gapPp: round2(overallGapPp),
      calibrationZ: overallZ === null ? null : round3(overallZ),
      calibrationP: overallP === null ? null : round4(overallP),
      overconfident: overallZ !== null && overallZ < 0 && overallP < 0.1,
      underconfident: overallZ !== null && overallZ > 0 && overallP < 0.1,
      sources: resolutionCells.length,
      // A withheld statistic carries its own reason, so a blank cell in the
      // export is never read as a zero.
      refusalReason: resolutionN >= conventions.minResolutions
        ? null
        : `${resolutionN} resolved prediction(s); calibration and skill are withheld until ${conventions.minResolutions}.`,
    },
    recommendation,
    unreplicated,
  };
}

/* ------------------------------------------------------------------ */
/* 9. Signals                                                          */
/* ------------------------------------------------------------------ */

function pct(value) {
  return value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${round2(value)}%`;
}

export function evidenceSignals(state = {}, now = new Date(), settings = {}) {
  const report = evidenceReport(state, now, settings);
  const out = [];
  const push = (signal) => out.push(signal);

  for (const cell of report.effects.eligibleCells) {
    if (cell.verdict === 'harms-here') {
      push({
        id: 'EBM-01',
        ruleId: 'EBM-01',
        domain: 'Evidence',
        severity: 4,
        confidence: report.conventions.minHeterogeneity <= cell.n ? 'high' : 'medium',
        title: `${cell.interventionLabel} is reliably associated with a worse ${cell.outcomeLabel.toLowerCase()} here (${pct(cell.pool.pooled)})`,
        detail: `Pooled across ${cell.nConfirmatory} pre-registered study(ies), the interval runs ${pct(cell.pool.reportedLo)} to ${pct(cell.pool.reportedHi)} and stays on the harmful side of zero. This is the strongest finding this workspace can produce, and it is a reason to stop, not to try harder.`,
        evidence: [
          `${cell.nConfirmatory} pre-registered study(ies), ${cell.n} total; ${cell.nExploratory} retrospective (counted, never pooled).`,
          `τ² = ${cell.pool.heterogeneity.tau2}, I² = ${cell.pool.heterogeneity.i2}% (${cell.pool.heterogeneity.label}).`,
        ],
        action: { label: 'Open the evidence terminal', route: '#/evidence?panel=works' },
      });
    }
    if (cell.verdict === 'works-here' && cell.roots >= 1) {
      push({
        id: 'EBM-02',
        ruleId: 'EBM-02',
        domain: 'Evidence',
        severity: cell.roots <= 1 ? 2 : 1,
        confidence: 'medium',
        title: cell.replications === 0
          ? `${cell.interventionLabel} has one unreplicated positive result on ${cell.outcomeLabel.toLowerCase()} (${pct(cell.pool.pooled)})`
          : `${cell.interventionLabel} is the best-evidenced lever on ${cell.outcomeLabel.toLowerCase()} (${pct(cell.pool.pooled)})`,
        detail: cell.replications === 0
          ? 'One pre-registered study that survived its own placebo tests is a hypothesis, not a standard. The value of replicating it is the value of finding out whether the first result was luck.'
          : `Pooled across ${cell.nConfirmatory} pre-registered study(ies) with ${cell.replications} replication(s), the interval stays on the useful side of zero.`,
        evidence: [`${cell.nConfirmatory} pre-registered study(ies); ${cell.roots} independent result(s), ${cell.replications} replication(s).`],
        action: { label: 'Open the recommendation', route: '#/evidence?panel=recommend' },
      });
    }
    if (cell.verdict === 'heterogeneous') {
      push({
        id: 'EBM-03',
        ruleId: 'EBM-03',
        domain: 'Evidence',
        severity: 3,
        confidence: 'medium',
        title: `${cell.interventionLabel} on ${cell.outcomeLabel.toLowerCase()} varies by more than chance (I² ${cell.pool.heterogeneity.i2}%)`,
        detail: 'The studies disagree by more than sampling noise allows, so the pooled average is a statement about the arithmetic rather than about your team. The useful question is what differs between the places it worked and the places it did not.',
        evidence: [`Q = ${cell.pool.heterogeneity.q} on ${cell.pool.heterogeneity.df} df, p = ${cell.pool.heterogeneity.pQ}; τ = ${cell.pool.heterogeneity.tau} percentage points.`],
        action: { label: 'Inspect heterogeneity', route: `#/evidence?panel=works&cell=${encodeURIComponent(cell.key)}` },
      });
    }
  }

  const explorationRows = (report.recommendation?.rows || []).filter((row) => row.explorationDominant);
  if (explorationRows.length) {
    const top = explorationRows[0];
    push({
      id: 'EBM-05',
      ruleId: 'EBM-05',
      domain: 'Evidence',
      severity: 3,
      confidence: 'medium',
      title: `“${top.label}” is worth more as an experiment (${round2(top.evsi)}) than as an expected effect (${round2(top.exploit)})`,
      detail: `Over the next ${report.conventions.horizonDecisions} times you face this kind of problem, one pre-registered trial is expected to be worth ${round2(top.evsi)} percentage points of effect in information alone, against an information ceiling of ${round2(top.evpi)}. That is the case for trying it once, deliberately, with a hypothesis written down first.`,
      evidence: [`EVSI ${round2(top.evsi)} vs EVPI ${round2(top.evpi)}; exploration weight ${report.conventions.exploreWeight}.`],
      action: { label: 'Open the recommendation', route: '#/evidence?panel=recommend' },
    });
  }

  const thinCells = report.effects.cells.filter((cell) => !cell.pool && cell.n > 0);
  if (thinCells.length) {
    push({
      id: 'EBM-04',
      ruleId: 'EBM-04',
      domain: 'Evidence',
      severity: 2,
      confidence: 'high',
      title: `${thinCells.length} intervention/outcome pair(s) have been tried but not tested enough to pool`,
      detail: `Each has at least one recorded study and fewer than ${report.conventions.minPoolStudies} pre-registered ones. Meta-analysis of one or two noisy studies produces a number with a confidence interval shaped like a guess, so the terminal reports counts instead.`,
      evidence: thinCells.slice(0, 3).map((cell) => `${cell.interventionLabel} → ${cell.outcomeLabel}: ${cell.nConfirmatory} pre-registered of ${cell.n} total.`),
      action: { label: 'Open the evidence terminal', route: '#/evidence?panel=works' },
    });
  }

  if (report.resolutions.scored && report.resolutions.overconfident) {
    push({
      id: 'EBM-06',
      ruleId: 'EBM-06',
      domain: 'Evidence',
      severity: 4,
      confidence: 'medium',
      title: `Your pre-registered confidence is running ${Math.abs(round2(report.resolutions.gapPp))}pp ahead of what actually happens`,
      detail: 'Across every resolved probability this workspace recorded, the stated confidences exceed the realised rate by more than chance allows. Every EVPI figure in the Information Value Terminal is an upper bound over beliefs like these.',
      evidence: [
        `${report.resolutions.n} resolved predictions, ${report.resolutions.k} came true (${round2((report.resolutions.k / report.resolutions.n) * 100)}%).`,
        `Calibration-in-the-large z = ${report.resolutions.calibrationZ}, p = ${report.resolutions.calibrationP}.`,
      ],
      action: { label: 'Open the judgement panel', route: '#/evidence?panel=judgement' },
    });
  }

  if (report.resolutions.scored && report.resolutions.skill !== null && report.resolutions.skill < 0) {
    push({
      id: 'EBM-07',
      ruleId: 'EBM-07',
      domain: 'Evidence',
      severity: 4,
      confidence: 'medium',
      title: `Your probability forecasts score worse than the base rate (skill ${round2(report.resolutions.skill * 100)}%)`,
      detail: 'Brier skill is measured against a forecaster who always says the realised base rate. A negative score means the numbers you write down carry less information than the single average they are trying to improve on.',
      evidence: [`Brier ${report.resolutions.brier} against a reference of ${report.resolutions.referenceBrier} over ${report.resolutions.n} resolved predictions.`],
      action: { label: 'Open the judgement panel', route: '#/evidence?panel=judgement' },
    });
  }

  if (report.counts.unreplicated > 0 && report.counts.effectUnits >= 2) {
    push({
      id: 'EBM-08',
      ruleId: 'EBM-08',
      domain: 'Evidence',
      severity: 3,
      confidence: 'medium',
      title: `${report.counts.unreplicated} positive result(s) have never been replicated`,
      detail: 'A single confirmatory study that survives its own placebo tests is the beginning of a finding, not the end of one. Until it is repeated, treating it as a standard is how a practice becomes folklore.',
      evidence: report.unreplicated.slice(0, 3).map((cell) => `${cell.interventionLabel} → ${cell.outcomeLabel}: ${cell.roots} independent result, ${cell.replications} replication.`),
      action: { label: 'Open the evidence terminal', route: '#/evidence?panel=works' },
    });
  }

  return out;
}

/** Badge count: findings at severity 3 or above that deserve a look. */
export function evidenceAttentionCount(state = {}, now = new Date()) {
  const signals = evidenceSignals(state, now, state.settings || {});
  return signals.filter((signal) => Number(signal.severity) >= 3).length;
}

/* ------------------------------------------------------------------ */
/* 10. Board brief                                                     */
/* ------------------------------------------------------------------ */

export function evidenceBrief(state = {}, now = new Date(), settings = {}) {
  const report = evidenceReport(state, now, settings);
  const lines = [];
  lines.push('EVIDENCE BRIEF — what has actually worked here');
  lines.push(`Generated ${report.today} · ${report.engineVersion} · local, no names, no titles`);
  lines.push('');

  if (!report.counts.effectUnits && !report.counts.resolutionUnits) {
    lines.push('This workspace holds no pre-registered, scored evidence yet.');
    lines.push('A finding requires a hypothesis written before the window closed, a scored');
    lines.push('evaluation, and in this terminal at least three such studies on the same');
    lines.push('intervention and the same outcome before anything is pooled.');
    lines.push('');
    lines.push('NOT CLAIMED: no effect, no ranking and no recommendation is asserted.');
    return lines.join('\n');
  }

  lines.push(`Scored studies: ${report.counts.effectUnits} (${report.counts.confirmatoryUnits} pre-registered, ${report.counts.exploratoryUnits} retrospective — counted, never pooled).`);
  lines.push(`Poolable intervention/outcome cells: ${report.counts.eligibleCells} of ${report.counts.cells}.`);
  lines.push(`Resolved probability predictions: ${report.counts.resolutionUnits} across ${report.counts.resolutionSources} source(s).`);
  lines.push('');

  if (report.effects.eligibleCells.length) {
    lines.push('POOLED FINDINGS (random effects, wider of DerSimonian–Laird and Hartung–Knapp)');
    for (const cell of report.effects.eligibleCells) {
      lines.push(`  ${cell.interventionLabel} → ${cell.outcomeLabel}: ${pct(cell.pool.pooled)} `
        + `[${pct(cell.pool.reportedLo)}, ${pct(cell.pool.reportedHi)}], n=${cell.nConfirmatory}, `
        + `I²=${cell.pool.heterogeneity.i2}% — ${cell.verdictMeta.label}`);
    }
    lines.push('');
  }

  if (report.recommendation) {
    lines.push(`RECOMMENDATION for ${report.recommendation.outcomeLabel} over the next ${report.recommendation.horizonDecisions} decisions`);
    for (const row of report.recommendation.rows.slice(0, 5)) {
      const effect = row.mean === null ? 'untested' : `${pct(row.mean)}`;
      const learn = Number.isFinite(row.evsi) ? `learning ${round2(row.evsi)}` : 'learning —';
      lines.push(`  ${row.position}. ${row.label}: ${effect}; ${learn}; rank ${round2(row.rank)} — ${row.verdictMeta.label}`);
    }
    lines.push('');
  }

  if (report.resolutions.scored) {
    lines.push('JUDGEMENT (resolved pre-registered probabilities)');
    lines.push(`  ${report.resolutions.n} predictions, ${report.resolutions.k} came true.`);
    lines.push(`  Brier ${report.resolutions.brier} against a base-rate reference of ${report.resolutions.referenceBrier} (skill ${report.resolutions.skill === null ? '—' : round2(report.resolutions.skill * 100)}%).`);
    lines.push(`  Stated confidence minus realised rate: ${report.resolutions.gapPp === null ? '—' : `${round2(report.resolutions.gapPp)}pp`}.`);
    lines.push('');
  }

  lines.push('LIMITS');
  lines.push('  • An effect is a pooled association, not a causal claim.');
  lines.push('  • Retrospective hypotheses are counted and never pooled.');
  lines.push('  • Designs are never mixed: interrupted time series and probabilities are separate panels.');
  lines.push('  • Below the study floor a cell is a count, not a finding.');
  lines.push('  • High heterogeneity means the average is not a policy.');
  lines.push('  • No person was scored to produce any figure in this brief.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 11. Frozen review construction                                      */
/* ------------------------------------------------------------------ */

/**
 * The persisted half of a review. Everything here is aggregate: the review is
 * a claim about what the evidence said on a date, not a copy of the studies
 * that produced it, so a later change to a study cannot rewrite history — it
 * can only disagree with it, which is the point of grading.
 */
export function buildEvidenceReview(report, { id, label, reviewOn, nowIso, focusOutcomeId = null }) {
  const focus = focusOutcomeId || report.effects.focusOutcomeId;
  const recommendation = focus && focus !== report.effects.focusOutcomeId
    ? recommendForOutcome(report.effects.cells, { outcomeId: focus, conventions: report.conventions, allOutcomes: report.effects.cells })
    : report.recommendation;
  return {
    id,
    label: String(label || '').slice(0, 200) || `Evidence review, ${report.week}`,
    outcomeId: focus || null,
    outcomeLabel: recommendation?.outcomeLabel || null,
    frozenAt: nowIso,
    reviewOn,
    engineVersion: report.engineVersion,
    conventions: {
      minPoolStudies: report.conventions.minPoolStudies,
      minHeterogeneity: report.conventions.minHeterogeneity,
      alpha: report.conventions.alpha,
      horizonDecisions: report.conventions.horizonDecisions,
      exploreWeight: report.conventions.exploreWeight,
    },
    counts: { ...report.counts },
    cells: report.effects.eligibleCells.map((cell) => ({
      key: cell.key,
      interventionType: cell.interventionType,
      outcomeId: cell.outcomeId,
      n: cell.n,
      nConfirmatory: cell.nConfirmatory,
      pooled: cell.pool.pooled,
      lo: cell.pool.reportedLo,
      hi: cell.pool.reportedHi,
      i2: cell.pool.heterogeneity.i2,
      tau2: cell.pool.heterogeneity.tau2,
      verdict: cell.verdict,
    })),
    ranking: (recommendation?.rows || []).slice(0, 8).map((row) => ({
      interventionType: row.interventionType,
      n: row.n,
      mean: row.mean,
      lcb: row.lcb,
      evsi: row.evsi,
      rank: row.rank,
      position: row.position,
    })),
    resolution: {
      n: report.resolutions.n,
      brier: report.resolutions.brier,
      referenceBrier: report.resolutions.referenceBrier,
      skill: report.resolutions.skill,
      gapPp: report.resolutions.gapPp,
      scored: report.resolutions.scored,
    },
    graded: null,
  };
}

/**
 * Grade a frozen review by interval coverage against the terminal as it reads
 * today. This is the falsifiable claim the review made: "the pooled effect for
 * this cell is inside this interval". If today's evidence lands inside the
 * interval the review covered; if not, it did not. Coverage is not accuracy —
 * a very wide interval covers almost everything — so the absolute error is
 * reported beside it.
 */
export function gradeEvidenceReview(review, report) {
  if (!review || !review.cells || !review.cells.length) {
    return { ok: false, reason: 'This review froze no pooled cell, so there is no interval to grade.' };
  }
  const todayByKey = new Map(report.effects.eligibleCells.map((cell) => [cell.key, cell]));
  const pairs = [];
  for (const frozen of review.cells) {
    const now = todayByKey.get(frozen.key);
    if (!now || !now.pool) continue;
    pairs.push({
      key: frozen.key,
      frozenPooled: frozen.pooled,
      frozenLo: frozen.lo,
      frozenHi: frozen.hi,
      realisedPooled: now.pool.pooled,
      covered: now.pool.pooled >= frozen.lo && now.pool.pooled <= frozen.hi,
      absoluteError: round3(Math.abs(now.pool.pooled - frozen.pooled)),
      nThen: frozen.nConfirmatory,
      nNow: now.nConfirmatory,
    });
  }
  if (!pairs.length) {
    return { ok: false, reason: 'None of the cells this review froze are still poolable, so the review cannot be graded — only retired.' };
  }
  const covered = pairs.filter((pair) => pair.covered).length;
  const meanError = pairs.reduce((acc, pair) => acc + pair.absoluteError, 0) / pairs.length;
  const medianWidth = median(review.cells.map((cell) => (Number.isFinite(cell.hi) && Number.isFinite(cell.lo) ? cell.hi - cell.lo : null)));
  return {
    ok: true,
    gradedAt: new Date().toISOString(),
    cellsGraded: pairs.length,
    cellsCovered: covered,
    coverageRate: round3(covered / pairs.length),
    meanAbsoluteError: round3(meanError),
    medianFrozenWidth: round3(medianWidth),
    pairs,
    note: 'Coverage is not accuracy: an interval wide enough covers almost anything. The mean absolute error is reported beside it, and a review that covered everything by predicting nothing useful is visible as a wide interval with a large error.',
  };
}

export default evidenceReport;
