/**
 * app/core/domain/credibility.js — the Borrowed Evidence Engine (Session 100,
 * Schema v71, ADR-0062).
 *
 * WHAT WAS MISSING
 * ----------------
 * Ninety-nine sessions taught every terminal in this workspace to refuse a
 * judgement on a small sample: "too few verdicts", "below the floor",
 * "insufficient". Each refusal is correct on its own. Together they are a
 * failure: a new manager's workspace is *made* of small samples, so the honest
 * answer to almost every question in the first quarter was "ask again later".
 *
 * A pile of small samples that measure the same kind of thing is exactly what a
 * hierarchical model is for. Each unit borrows strength from the pool by an
 * amount the data determines; the leader is told how much of each number is
 * their own; and — because borrowing is a bet that the units really are alike —
 * every borrowed claim the engine acts on is frozen and graded later against
 * the unit's own record, so the workspace learns whether borrowing helped here.
 *
 * NAMED THEORY, IMPLEMENTED EXPLICITLY
 * ------------------------------------
 *  - **Beta-binomial hierarchical model.** Unit i has n_i decisive outcomes and
 *    x_i successes; p_i ~ Beta(α, β); x_i | p_i ~ Binomial(n_i, p_i). Written in
 *    (μ, M) form, μ = α/(α+β) is the pooled rate and M = α+β is the prior's
 *    strength in observations.
 *  - **Bühlmann (1967) credibility, exact here (Jewell 1974).** For a conjugate
 *    Beta prior the posterior mean is Z·(x/n) + (1−Z)·μ with Z = n/(n+M): the
 *    actuarial credibility weight. Z is printed for every unit as "how much of
 *    this number is yours".
 *  - **Full hierarchical Bayes on a deterministic grid (Gelman et al., BDA3
 *    §5.3).** Plug-in empirical Bayes treats the fitted prior as known and so
 *    understates uncertainty (Morris 1983; Kass & Steffey 1989). The engine
 *    instead integrates over (logit μ, log M) under the BDA3 hyperprior
 *    p(α, β) ∝ (α+β)^(−5/2) — on the grid, μ(1−μ)·M^(−1/2) — on a coarse pass
 *    that locates the mass and a refined pass over it. No Math.random: the same
 *    records always produce the same numbers.
 *  - **Efron & Morris (1975) shrinkage display.** Every unit is drawn from its
 *    own-data rate to its borrowed rate, so the leader sees which numbers moved
 *    and how far.
 *  - **Pearson χ² homogeneity and Higgins & Thompson (2002) I².** The screen for
 *    whether the units differ by more than sampling noise, flagged as
 *    approximate whenever a cell's expected count is under five (Cochran).
 *  - **Leave-one-out influence.** Each unit is removed from the hyperprior in
 *    turn; if any other unit's estimate moves past the declared tolerance, the
 *    pool is said to be carried by one unit.
 *  - **Proper scoring (Brier 1950) of two forecasters.** A frozen frame stores
 *    the borrowed forecast and the own-data forecast (the Jeffreys posterior
 *    mean, so the comparison tests borrowing rather than smoothing) and grades
 *    both against the same subsequent outcomes. Skill = 1 − ΣBrier_borrowed /
 *    ΣBrier_own, withheld below a declared number of graded frames.
 *  - **Reference-class forecasting (Kahneman & Lovallo 1993).** Every open
 *    assumption's declared prior is checked against the borrowed hold rate of
 *    its class: the outside view, computed rather than recommended.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - **Exchangeability is a judgement, not a statistic.** Groups are fixed in
 *    the registry, never pooled across, and a leader's refusal to pool a group
 *    is obeyed whatever the arithmetic says.
 *  - **Refusals are regimes, not blanks.** Too few units, too few observations
 *    and an all-0%/100% pattern (where no Beta distribution can be fitted and
 *    the posterior would be improper) are named on the screen with the count
 *    still missing.
 *  - **No person is scored.** Units are signal families, assumption criticality
 *    classes and delegation authority classes. There is no per-person unit, and
 *    the rules open their tasks for the leader.
 *  - **Borrowing is graded.** If the borrowed forecasts lose to own data over
 *    enough graded frames, the engine says so and opens the decision to stop.
 *
 * Pure module: no DOM, storage, network, Math.random or wall clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { collectVerdictObservations } from './integrity.js';
import { DELEGATION_AUTHORITY } from './delegations.js';
import {
  BORROWING_REGIMES,
  REGIME_Z_CUTS,
  CREDIBILITY_CLAMPS,
  CREDIBILITY_DEFAULTS,
  CREDIBILITY_DOMAIN,
  CREDIBILITY_ENGINE_VERSION,
  CREDIBILITY_GROUPS,
  CREDIBILITY_MAX_PCT,
  CREDIBILITY_MIN_PCT,
  CREDIBILITY_REGIME_LABELS,
  CREDIBILITY_SIGNAL_IDS,
  CREDIBILITY_Z_TARGETS,
  credibilityGroup,
} from './credibilityRegistry.js';
import { refusedGroups } from './credibilitySchema.js';

export { CREDIBILITY_ENGINE_VERSION };

const round = (value, dp = 2) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const f = 10 ** dp;
  return Math.round(Number(value) * f) / f;
};
const pct = (p, dp = 1) => (p === null || p === undefined ? null : round(p * 100, dp));
const clampPct = (value) => Math.min(CREDIBILITY_MAX_PCT, Math.max(CREDIBILITY_MIN_PCT, value));

/* ------------------------------------------------------------ conventions */

export function credibilityConventions(settings = {}) {
  const s = settings || {};
  const d = CREDIBILITY_DEFAULTS;
  const read = (key) => {
    const [min, max] = CREDIBILITY_CLAMPS[key];
    const v = Number(s[key]);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d[key];
  };
  const whole = (key) => Math.round(read(key));
  const detectorFloor = Number(s.integrityPrecisionFloorPct);
  return {
    autoPropagate: s.credibilityAutoPropagate !== false,
    decisivePct: whole('credibilityDecisivePct'),
    decisive: whole('credibilityDecisivePct') / 100,
    minUnitN: whole('credibilityMinUnitN'),
    heterogeneityAlphaPct: read('credibilityHeterogeneityAlphaPct'),
    i2WarnPct: whole('credibilityI2WarnPct'),
    influenceTolerancePct: whole('credibilityInfluenceTolerancePct'),
    minUnits: whole('credibilityMinUnits'),
    minObservations: whole('credibilityMinObservations'),
    horizonN: whole('credibilityHorizonN'),
    reviewDays: whole('credibilityReviewDays'),
    skillFloor: whole('credibilitySkillFloor'),
    surpriseBrier: round(read('credibilitySurpriseBrier'), 3),
    premiseFloorPct: whole('credibilityPremiseFloorPct'),
    delegationFloorPct: whole('credibilityDelegationFloorPct'),
    checkpointDays: whole('credibilityCheckpointDays'),
    // The detector group judges against the Signal Integrity Board's own
    // declared floor, so the two modules can never disagree about the bar.
    detectorFloorPct: Number.isFinite(detectorFloor)
      ? Math.min(95, Math.max(20, Math.round(detectorFloor))) : 60,
  };
}

export function floorPctFor(groupId, conventions) {
  if (groupId === 'detectors') return conventions.detectorFloorPct;
  if (groupId === 'premises') return conventions.premiseFloorPct;
  if (groupId === 'delegation') return conventions.delegationFloorPct;
  return null;
}

/* ------------------------------------------------------------- numerics */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const HALF_LN_2PI = 0.5 * Math.log(2 * Math.PI);

/** ln Γ(x) by the Lanczos approximation (g = 7), reflected below ½. */
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (z + i);
  return HALF_LN_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export function lnBeta(a, b) {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

const FPMIN = 1e-300;

/** Continued fraction for the incomplete beta (modified Lentz). */
function betaContinuedFraction(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 3000; m += 1) {
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
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf, |error| < 1.5e-7). */
function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Above this concentration a Beta is read through a one-term Edgeworth
 * expansion of the normal. The continued fraction needs O(√max(a, b))
 * iterations, so for the grid's strongest priors (a + b up to a million) it is
 * both slow and, under any fixed iteration cap, inexact; the expansion's error
 * is O(1/(a+b)) — below 1e-3 here — and the suite pins it against the
 * continued fraction at the switch-over.
 */
export const BETA_EDGEWORTH_SWITCH = 2000;

/** Regularised incomplete beta I_x(a, b): the Beta(a, b) CDF at x. */
export function betaCdf(x, a, b) {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(x)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a + b > BETA_EDGEWORTH_SWITCH && a > 5 && b > 5) {
    const S = a + b;
    const mean = a / S;
    const sd = Math.sqrt((a * b) / (S * S * (S + 1)));
    const z = (x - mean) / sd;
    const skew = (2 * (b - a) * Math.sqrt(S + 1)) / ((S + 2) * Math.sqrt(a * b));
    const density = Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
    return Math.min(1, Math.max(0, normalCdf(z) - density * (skew / 6) * (z * z - 1)));
  }
  return betaCdfExact(x, a, b);
}

/** The continued-fraction evaluation, exported for the suite's switch-over check. */
export function betaCdfExact(x, a, b) {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(x)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Beta(a, b) quantile by bisection on the CDF (monotone, so always converges). */
export function betaQuantile(p, a, b) {
  if (!(p > 0)) return 0;
  if (!(p < 1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Regularised upper incomplete gamma Q(a, x). */
export function gammaQ(a, x) {
  if (!(a > 0) || !Number.isFinite(x)) return NaN;
  if (x <= 0) return 1;
  const lead = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-14) break;
    }
    return Math.max(0, Math.min(1, 1 - sum * Math.exp(lead)));
  }
  let bb = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / bb;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    bb += 2;
    d = an * d + bb;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = bb + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return Math.max(0, Math.min(1, Math.exp(lead) * h));
}

/** P(χ²_df ≥ x). */
export function chiSquareSurvival(x, df) {
  if (!(df > 0) || !Number.isFinite(x)) return null;
  if (x <= 0) return 1;
  return gammaQ(df / 2, x / 2);
}

/** Wilson (1927) score interval at 95%, as fractions. */
export function wilson(successes, n, z = 1.959964) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/* --------------------------------------------------------- the grid model */

/**
 * Grid bounds. μ runs from 0.25% to 99.75% on the logit scale; M (the prior's
 * strength in observations) from 0.25 to a million on the log scale. Above a
 * million the model is complete pooling to any precision a leader could read,
 * and below 0.25 every unit's own data is already the whole estimate.
 */
export const CREDIBILITY_GRID = Object.freeze({
  logitMin: -6,
  logitMax: 6,
  logMMin: Math.log(0.25),
  logMMax: Math.log(1e6),
  coarse: 33,
  fine: 41,
  // A grid point carrying less than e^−13.8 ≈ 1e-6 of the peak density is
  // outside the region the refined pass needs to cover.
  massFloor: -13.8,
});

function axis(min, max, count) {
  const step = (max - min) / (count - 1);
  return { min, max, step, values: Array.from({ length: count }, (_, i) => min + i * step) };
}

function evaluateGrid(units, logitAxis, logMAxis) {
  const C = logitAxis.values.length;
  const R = logMAxis.values.length;
  const G = C * R;
  const mu = new Float64Array(G);
  const M = new Float64Array(G);
  const a = new Float64Array(G);
  const b = new Float64Array(G);
  const lnBab = new Float64Array(G);
  const logPrior = new Float64Array(G);
  const logLik = units.map(() => new Float64Array(G));
  let g = 0;
  for (let r = 0; r < R; r += 1) {
    const lm = logMAxis.values[r];
    const strength = Math.exp(lm);
    for (let c = 0; c < C; c += 1) {
      const m = 1 / (1 + Math.exp(-logitAxis.values[c]));
      mu[g] = m;
      M[g] = strength;
      a[g] = m * strength;
      b[g] = (1 - m) * strength;
      lnBab[g] = lnBeta(a[g], b[g]);
      // BDA3 hyperprior p(α, β) ∝ (α+β)^(−5/2), expressed on (logit μ, log M):
      // μ(1−μ)·M^(−1/2), including both Jacobians.
      logPrior[g] = Math.log(m) + Math.log(1 - m) - 0.5 * lm;
      for (let i = 0; i < units.length; i += 1) {
        const { x, n } = units[i];
        logLik[i][g] = lnBeta(x + a[g], n - x + b[g]) - lnBab[g];
      }
      g += 1;
    }
  }
  return { C, R, G, mu, M, a, b, lnBab, logPrior, logLik, logitAxis, logMAxis };
}

function sumLogs(grid, skip = -1) {
  const out = new Float64Array(grid.G);
  for (let g = 0; g < grid.G; g += 1) {
    let v = grid.logPrior[g];
    for (let i = 0; i < grid.logLik.length; i += 1) if (i !== skip) v += grid.logLik[i][g];
    out[g] = v;
  }
  return out;
}

function normalise(logPost) {
  let max = -Infinity;
  for (let g = 0; g < logPost.length; g += 1) if (logPost[g] > max) max = logPost[g];
  const w = new Float64Array(logPost.length);
  let sum = 0;
  for (let g = 0; g < logPost.length; g += 1) {
    w[g] = Math.exp(logPost[g] - max);
    sum += w[g];
  }
  for (let g = 0; g < logPost.length; g += 1) w[g] /= sum;
  return w;
}

/** The axis box holding the mass of the full posterior and every leave-one-out posterior. */
function massBox(grid, posts) {
  let cMin = Infinity;
  let cMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const lp of posts) {
    let max = -Infinity;
    for (let g = 0; g < lp.length; g += 1) if (lp[g] > max) max = lp[g];
    for (let g = 0; g < lp.length; g += 1) {
      if (lp[g] < max + CREDIBILITY_GRID.massFloor) continue;
      const c = g % grid.C;
      const r = Math.floor(g / grid.C);
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
  }
  cMin = Math.max(0, cMin - 1);
  cMax = Math.min(grid.C - 1, cMax + 1);
  rMin = Math.max(0, rMin - 1);
  rMax = Math.min(grid.R - 1, rMax + 1);
  return {
    logitMin: grid.logitAxis.values[cMin],
    logitMax: grid.logitAxis.values[cMax],
    logMMin: grid.logMAxis.values[rMin],
    logMMax: grid.logMAxis.values[rMax],
  };
}

function lru(cap) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.set(key, value);
      if (map.size > cap) map.delete(map.keys().next().value);
      return value;
    },
  };
}

const FIT_CACHE = lru(32);

/**
 * Fit the hierarchy to `units` ([{ x, n }]). Pure and memoised on the counts,
 * because the same records are read by the view, the nav badge, the insights
 * roll-up and the rules inside one render.
 */
export function fitHierarchy(units) {
  const clean = (units || []).map((u) => ({
    x: Math.max(0, Math.round(Number(u.x) || 0)),
    n: Math.max(0, Math.round(Number(u.n) || 0)),
  })).map((u) => ({ x: Math.min(u.x, u.n), n: u.n }));
  const key = clean.map((u) => `${u.x}/${u.n}`).join(',');
  const cached = FIT_CACHE.get(key);
  if (cached) return cached;

  const coarse = evaluateGrid(clean,
    axis(CREDIBILITY_GRID.logitMin, CREDIBILITY_GRID.logitMax, CREDIBILITY_GRID.coarse),
    axis(CREDIBILITY_GRID.logMMin, CREDIBILITY_GRID.logMMax, CREDIBILITY_GRID.coarse));
  const posts = [sumLogs(coarse)];
  if (clean.length >= 2) for (let j = 0; j < clean.length; j += 1) posts.push(sumLogs(coarse, j));
  const box = massBox(coarse, posts);
  const grid = evaluateGrid(clean,
    axis(box.logitMin, box.logitMax, CREDIBILITY_GRID.fine),
    axis(box.logMMin, box.logMMax, CREDIBILITY_GRID.fine));
  const logPost = sumLogs(grid);
  const w = normalise(logPost);

  // The points carrying all but 1e-7 of the mass. Exact mixture probabilities
  // are summed over these; the remainder is below any printed digit.
  const order = Array.from({ length: grid.G }, (_, g) => g).sort((p, q) => w[q] - w[p]);
  const active = [];
  let covered = 0;
  for (const g of order) {
    active.push(g);
    covered += w[g];
    if (covered >= 1 - 1e-7) break;
  }

  let meanMu = 0;
  for (let g = 0; g < grid.G; g += 1) meanMu += w[g] * grid.mu[g];

  const fit = { units: clean, grid, logPost, w, active, box, meanMu };
  return FIT_CACHE.set(key, fit);
}

/**
 * Beta-binomial regression with one declared, standardised covariate.
 *
 * Unit i has p_i ~ Beta(M·logistic(a+b·x_i), M·(1-logistic(a+b·x_i))) and
 * x_i successes from n_i trials. The posterior is integrated on a deterministic
 * (a,b,log M) grid. The proper N(0, 1.5²) slope prior regularises the direction;
 * the intercept and concentration retain the same Jeffreys/BDA3 conventions as
 * fitHierarchy. This is a candidate explanatory model, not an automatic policy.
 */
const COVARIATE_GRID = Object.freeze({
  interceptMin: -6, interceptMax: 6,
  slopeMin: -5, slopeMax: 5,
  logMMin: CREDIBILITY_GRID.logMMin, logMMax: CREDIBILITY_GRID.logMMax,
  coarse: 13, fine: 19,
  massFloor: -13.8,
});
const logistic = (v) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, v))));
const COVARIATE_FIT_CACHE = lru(16);

function evaluateCovariateGrid(units, aAxis, bAxis, mAxis) {
  const G = aAxis.values.length * bAxis.values.length * mAxis.values.length;
  const intercept = new Float64Array(G);
  const slope = new Float64Array(G);
  const strength = new Float64Array(G);
  const logLikelihood = new Float64Array(G);
  let g = 0;
  for (let m = 0; m < mAxis.values.length; m += 1) {
    const logM = mAxis.values[m];
    const M = Math.exp(logM);
    for (let b = 0; b < bAxis.values.length; b += 1) {
      const beta1 = bAxis.values[b];
      for (let a = 0; a < aAxis.values.length; a += 1) {
        const beta0 = aAxis.values[a];
        intercept[g] = beta0;
        slope[g] = beta1;
        strength[g] = M;
        // Proper slope prior; intercept Jeffreys prior and BDA3 concentration prior.
        let lp = Math.log(logistic(beta0)) + Math.log1p(-logistic(beta0))
          - 0.5 * logM - (beta1 * beta1) / (2 * 1.5 * 1.5);
        for (let i = 0; i < units.length; i += 1) {
          const mu = logistic(beta0 + beta1 * units[i].covariate);
          const A = mu * M;
          const B = (1 - mu) * M;
          lp += lnBeta(units[i].x + A, units[i].n - units[i].x + B) - lnBeta(A, B);
        }
        logLikelihood[g] = lp;
        g += 1;
      }
    }
  }
  return { G, intercept, slope, strength, logLikelihood, aAxis, bAxis, mAxis };
}

function weightedQuantile(values, weights, q) {
  const rows = values.map((v, i) => [v, weights[i]]).sort((a, b) => a[0] - b[0]);
  let cumulative = 0;
  for (const [v, w] of rows) {
    cumulative += w;
    if (cumulative >= q) return v;
  }
  return rows.at(-1)?.[0] ?? null;
}

/**
 * Fit a one-covariate Beta-binomial regression. `covariate` must be a declared
 * numeric value in [-1,1]; no value is inferred from an outcome. Returns null
 * when there are fewer than three usable units or no covariate variation.
 */
export function fitCovariateHierarchy(rawUnits) {
  const units = (rawUnits || []).map((u) => ({
    id: String(u.id || ''),
    x: Math.max(0, Math.round(Number(u.x) || 0)),
    n: Math.max(0, Math.round(Number(u.n) || 0)),
    covariate: Number(u.covariate),
  })).map((u) => ({ ...u, x: Math.min(u.x, u.n) }))
    .filter((u) => u.id && u.n > 0 && Number.isFinite(u.covariate) && Math.abs(u.covariate) <= 1);
  if (units.length < 3 || new Set(units.map((u) => u.covariate)).size < 3) return null;
  const cacheKey = units.map((u) => `${u.id}:${u.x}/${u.n}@${u.covariate}`).join('|');
  const cached = COVARIATE_FIT_CACHE.get(cacheKey);
  if (cached) return cached;

  const cfg = COVARIATE_GRID;
  const coarse = evaluateCovariateGrid(units,
    axis(cfg.interceptMin, cfg.interceptMax, cfg.coarse),
    axis(cfg.slopeMin, cfg.slopeMax, cfg.coarse),
    axis(cfg.logMMin, cfg.logMMax, cfg.coarse));
  let peak = -Infinity;
  for (const v of coarse.logLikelihood) if (v > peak) peak = v;
  let aLo = Infinity; let aHi = -Infinity;
  let bLo = Infinity; let bHi = -Infinity;
  let mLo = Infinity; let mHi = -Infinity;
  for (let g = 0; g < coarse.G; g += 1) {
    if (coarse.logLikelihood[g] < peak + cfg.massFloor) continue;
    const ai = g % coarse.aAxis.values.length;
    const bi = Math.floor(g / coarse.aAxis.values.length) % coarse.bAxis.values.length;
    const mi = Math.floor(g / (coarse.aAxis.values.length * coarse.bAxis.values.length));
    aLo = Math.min(aLo, ai); aHi = Math.max(aHi, ai);
    bLo = Math.min(bLo, bi); bHi = Math.max(bHi, bi);
    mLo = Math.min(mLo, mi); mHi = Math.max(mHi, mi);
  }
  const box = (axisSpec, lo, hi) => ({
    min: axisSpec.values[Math.max(0, lo - 1)],
    max: axisSpec.values[Math.min(axisSpec.values.length - 1, hi + 1)],
  });
  const aBox = box(coarse.aAxis, aLo, aHi);
  const bBox = box(coarse.bAxis, bLo, bHi);
  const mBox = box(coarse.mAxis, mLo, mHi);
  const grid = evaluateCovariateGrid(units,
    axis(aBox.min, aBox.max, cfg.fine),
    axis(bBox.min, bBox.max, cfg.fine),
    axis(mBox.min, mBox.max, cfg.fine));
  let maxLog = -Infinity;
  for (const v of grid.logLikelihood) if (v > maxLog) maxLog = v;
  const weights = new Float64Array(grid.G);
  let total = 0;
  for (let g = 0; g < grid.G; g += 1) { weights[g] = Math.exp(grid.logLikelihood[g] - maxLog); total += weights[g]; }
  for (let g = 0; g < grid.G; g += 1) weights[g] /= total;

  const slopeMean = grid.slope.reduce((sum, v, i) => sum + v * weights[i], 0);
  const prediction = (covariate) => {
    let mean = 0; let second = 0;
    for (let g = 0; g < grid.G; g += 1) {
      const mu = logistic(grid.intercept[g] + grid.slope[g] * covariate);
      const M = grid.strength[g];
      const A = mu * M; const B = (1 - mu) * M; const S = A + B;
      mean += weights[g] * A / S;
      second += weights[g] * A * (A + 1) / (S * (S + 1));
    }
    const variance = Math.max(1e-12, second - mean * mean);
    const interval = momentInterval(mean, variance);
    return { mean, lo: interval.lo, hi: interval.hi };
  };
  const slopeLo = weightedQuantile(Array.from(grid.slope), Array.from(weights), 0.05);
  const slopeHi = weightedQuantile(Array.from(grid.slope), Array.from(weights), 0.95);
  const probabilityPositive = weights.reduce((sum, w, i) => sum + (grid.slope[i] > 0 ? w : 0), 0);
  return COVARIATE_FIT_CACHE.set(cacheKey, {
    units: units.map((u) => ({ ...u, ...prediction(u.covariate) })),
    slopeMean, slopeLo, slopeHi, probabilityPositive,
    prediction,
    model: 'beta-binomial-logit-v1',
    prior: 'Normal(0, 1.5²) slope; Jeffreys intercept; BDA3 concentration',
    caveat: 'Exploratory fit; the covariate is ordinal, class-level evidence is sparse, and temporal dependence is not modelled. This model does not drive automation.',
  });
}

/** Quantile of a marginal over one regular axis, interpolated inside the cell. */
function axisQuantile(values, weights, step, q) {
  let cumulative = 0;
  for (let i = 0; i < values.length; i += 1) {
    const next = cumulative + weights[i];
    if (next >= q) {
      const inside = weights[i] > 0 ? (q - cumulative) / weights[i] : 0.5;
      return values[i] - step / 2 + inside * step;
    }
    cumulative = next;
  }
  return values[values.length - 1];
}

/** Posterior of the pooled rate μ and the prior strength M. */
export function hyperSummary(fit) {
  const { grid, w } = fit;
  const colW = new Float64Array(grid.C);
  const rowW = new Float64Array(grid.R);
  for (let g = 0; g < grid.G; g += 1) {
    colW[g % grid.C] += w[g];
    rowW[Math.floor(g / grid.C)] += w[g];
  }
  const logistic = (t) => 1 / (1 + Math.exp(-t));
  const muQ = (q) => logistic(axisQuantile(grid.logitAxis.values, colW, grid.logitAxis.step, q));
  const mQ = (q) => Math.exp(axisQuantile(grid.logMAxis.values, rowW, grid.logMAxis.step, q));
  const m10 = mQ(0.1);
  const m90 = mQ(0.9);
  // Mass sitting against the upper edge of the grid means the data cannot rule
  // out complete pooling; against the lower edge, no pooling at all.
  const topRowMass = rowW[grid.R - 1];
  return {
    meanPct: pct(fit.meanMu, 1),
    loPct: pct(muQ(0.05), 1),
    hiPct: pct(muQ(0.95), 1),
    strengthMedian: round(mQ(0.5), 1),
    strengthLo: round(m10, 1),
    strengthHi: round(m90, 1),
    // Two orders of magnitude between the 10th and 90th percentile of M means
    // the data barely identify how much the units share: the borrowing is then
    // mostly the hyperprior's opinion, and the page says so.
    identified: Math.log10(m90 / m10) <= 2,
    atCompletePooling: fit.box.logMMax >= CREDIBILITY_GRID.logMMax - 1e-9 && topRowMass > 0.02,
  };
}

/** One unit's posterior: mean, moment-matched 90% interval, E[Z] and exact P(p < floor). */
export function unitPosterior(fit, i, floor = null) {
  const { grid, w, active } = fit;
  const { x, n } = fit.units[i];
  let mass = 0;
  let m1 = 0;
  let m2 = 0;
  let z = 0;
  let below = 0;
  for (const g of active) {
    const wg = w[g];
    const A = x + grid.a[g];
    const B = n - x + grid.b[g];
    const S = A + B;
    mass += wg;
    m1 += (wg * A) / S;
    m2 += (wg * A * (A + 1)) / (S * (S + 1));
    z += (wg * n) / (n + grid.M[g]);
    if (floor !== null) below += wg * betaCdf(floor, A, B);
  }
  const mean = m1 / mass;
  const variance = Math.max(m2 / mass - mean * mean, 1e-12);
  return {
    mean,
    sd: Math.sqrt(variance),
    z: z / mass,
    pBelow: floor === null ? null : Math.min(1, Math.max(0, below / mass)),
    ...momentInterval(mean, variance),
  };
}

/**
 * The 90% interval of a Beta moment-matched to the posterior mixture. A
 * labelled approximation: the suite pins it to the exact mixture quantiles.
 */
function momentInterval(mean, variance) {
  const s = (mean * (1 - mean)) / variance - 1;
  if (!(s > 0)) return { lo: Math.max(0, mean - 1.645 * Math.sqrt(variance)), hi: Math.min(1, mean + 1.645 * Math.sqrt(variance)) };
  const A = mean * s;
  const B = (1 - mean) * s;
  return { lo: betaQuantile(0.05, A, B), hi: betaQuantile(0.95, A, B) };
}

/** Exact mixture quantile, for the suite's check of the moment-matched interval. */
export function exactUnitQuantile(fit, i, q) {
  const { grid, w, active } = fit;
  const { x, n } = fit.units[i];
  let mass = 0;
  for (const g of active) mass += w[g];
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 50; step += 1) {
    const mid = (lo + hi) / 2;
    let cdf = 0;
    for (const g of active) cdf += w[g] * betaCdf(mid, x + grid.a[g], n - x + grid.b[g]);
    if (cdf / mass < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The predictive distribution of a NEW unit with no data: what an unjudged unit inherits. */
export function newUnitPredictive(fit, floor = null) {
  const { grid, w, active } = fit;
  let mass = 0;
  let m1 = 0;
  let m2 = 0;
  let below = 0;
  for (const g of active) {
    const wg = w[g];
    const A = grid.a[g];
    const B = grid.b[g];
    const S = A + B;
    mass += wg;
    m1 += (wg * A) / S;
    m2 += (wg * A * (A + 1)) / (S * (S + 1));
    if (floor !== null) below += wg * betaCdf(floor, A, B);
  }
  const mean = m1 / mass;
  const variance = Math.max(m2 / mass - mean * mean, 1e-12);
  return {
    mean,
    z: 0,
    pBelow: floor === null ? null : Math.min(1, Math.max(0, below / mass)),
    ...momentInterval(mean, variance),
  };
}

/** Exact P(p_i < threshold) for an arbitrary threshold (the outside-view test). */
export function unitProbBelow(fit, i, threshold) {
  if (i < 0) return newUnitPredictive(fit, threshold).pBelow;
  return unitPosterior(fit, i, threshold).pBelow;
}

/**
 * What the unit's borrowed reading would be after `addSuccess` more successes
 * and `addFail` more failures. Exact: the hyperposterior is updated by the
 * ratio of unit i's new and old marginal likelihoods at every grid point, so no
 * refit and no approximation beyond the grid itself.
 */
export function whatIf(fit, i, addSuccess = 0, addFail = 0, floor = null) {
  const { grid, w, active } = fit;
  const { x, n } = fit.units[i];
  const x2 = x + Math.max(0, Math.round(addSuccess));
  const n2 = n + Math.max(0, Math.round(addSuccess)) + Math.max(0, Math.round(addFail));
  const logRatio = new Float64Array(active.length);
  let max = -Infinity;
  for (let k = 0; k < active.length; k += 1) {
    const g = active[k];
    const next = lnBeta(x2 + grid.a[g], n2 - x2 + grid.b[g]) - grid.lnBab[g];
    logRatio[k] = Math.log(w[g]) + next - grid.logLik[i][g];
    if (logRatio[k] > max) max = logRatio[k];
  }
  let mass = 0;
  let m1 = 0;
  let below = 0;
  for (let k = 0; k < active.length; k += 1) {
    const g = active[k];
    const wg = Math.exp(logRatio[k] - max);
    const A = x2 + grid.a[g];
    const B = n2 - x2 + grid.b[g];
    mass += wg;
    m1 += (wg * A) / (A + B);
    if (floor !== null) below += wg * betaCdf(floor, A, B);
  }
  return { mean: m1 / mass, pBelow: floor === null ? null : below / mass, x: x2, n: n2 };
}

const VERDICT_OF = (pBelow, decisive) => {
  if (pBelow === null || pBelow === undefined) return 'unresolved';
  if (pBelow >= decisive) return 'below';
  if (1 - pBelow >= decisive) return 'above';
  return 'unresolved';
};

/**
 * Break-even counts: how many more failures would put the unit decisively
 * below its floor, and how many more successes would put it decisively above.
 * Searched up to `cap`; beyond it the answer is "more than cap".
 */
export function breakEven(fit, i, floor, decisive, cap = 12) {
  const search = (direction) => {
    const verdictAt = (k) => VERDICT_OF(
      direction === 'down' ? whatIf(fit, i, 0, k, floor).pBelow : whatIf(fit, i, k, 0, floor).pBelow,
      decisive,
    );
    const target = direction === 'down' ? 'below' : 'above';
    if (verdictAt(0) === target) return 0;
    if (verdictAt(cap) !== target) return null;
    let lo = 0;
    let hi = cap;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (verdictAt(mid) === target) hi = mid; else lo = mid;
    }
    return hi;
  };
  return { failuresToBelow: search('down'), successesToAbove: search('up'), cap };
}

/**
 * Influence of each unit on the others, by leave-one-out on the cached grid.
 * A shift only counts as "carrying the pool" when it exceeds BOTH the declared
 * tolerance and the moved unit's own posterior SD: with a dozen outcomes any
 * absolute threshold fires, and a move smaller than the unit's own uncertainty
 * is not a finding.
 */
export function influence(fit) {
  const { grid, units } = fit;
  if (units.length < 4) return null;
  const meansWith = units.map((u) => {
    let m = 0;
    for (let g = 0; g < grid.G; g += 1) m += (fit.w[g] * (u.x + grid.a[g])) / (u.n + grid.M[g]);
    return m;
  });
  const sds = units.map((_, i) => unitPosterior(fit, i, null).sd);
  return units.map((_, j) => {
    const w = normalise(sumLogs(grid, j));
    let pooled = 0;
    for (let g = 0; g < grid.G; g += 1) pooled += w[g] * grid.mu[g];
    let maxShift = 0;
    let movedIndex = -1;
    let maxSdRatio = 0;
    for (let i = 0; i < units.length; i += 1) {
      if (i === j) continue;
      let m = 0;
      for (let g = 0; g < grid.G; g += 1) m += (w[g] * (units[i].x + grid.a[g])) / (units[i].n + grid.M[g]);
      const shift = Math.abs(m - meansWith[i]);
      if (shift > maxShift) { maxShift = shift; movedIndex = i; }
      if (sds[i] > 0) maxSdRatio = Math.max(maxSdRatio, shift / sds[i]);
    }
    return {
      maxShiftPp: round(maxShift * 100, 1),
      pooledShiftPp: round(Math.abs(pooled - fit.meanMu) * 100, 1),
      movedIndex,
      // The largest move of any other unit, in units of that unit's own
      // posterior SD.
      sdRatio: round(maxSdRatio, 2),
    };
  });
}

/** Pearson χ² homogeneity across units, with I² and Cochran's sparse-cell flag. */
export function heterogeneity(units) {
  const live = units.filter((u) => u.n > 0);
  const N = live.reduce((s, u) => s + u.n, 0);
  const X = live.reduce((s, u) => s + u.x, 0);
  const df = live.length - 1;
  if (!N || df < 1 || X === 0 || X === N) {
    return { x2: null, df: Math.max(0, df), pValue: null, i2Pct: null, sparseCells: live.length, approximate: true };
  }
  const p = X / N;
  let x2 = 0;
  let sparse = 0;
  for (const u of live) {
    const expected = u.n * p;
    x2 += ((u.x - expected) ** 2) / (u.n * p * (1 - p));
    if (expected < 5 || u.n * (1 - p) < 5) sparse += 1;
  }
  const pValue = chiSquareSurvival(x2, df);
  return {
    x2: round(x2, 3),
    df,
    pValue: round(pValue, 4),
    i2Pct: x2 > df ? round(((x2 - df) / x2) * 100, 1) : 0,
    sparseCells: sparse,
    approximate: sparse > 0,
  };
}

/* ------------------------------------------------------------ the adapters */

const DECISIVE_DETECTOR = Object.freeze({ confirmed: true, 'false-alarm': false });

// A declared ordinal scale from the workspace's authority contract, not learned
// from completion outcomes: recommend (-1) → agree (-1/3) → act + inform (+1/3) → own (+1).
const AUTHORITY_AUTONOMY = Object.freeze({ recommend: -1, agree: -1 / 3, 'act-inform': 1 / 3, own: 1 });

/**
 * Signal families. The same observation set the Signal Integrity Board scores
 * (`collectVerdictObservations`), restricted to the two decisive verdicts — the
 * Board's actionable precision exactly. Watch alerts carry a navigable id, so a
 * frame can point at the alerts it borrowed from.
 */
function detectorUnits(state) {
  const byDomain = new Map();
  for (const row of collectVerdictObservations(state)) {
    if (!row || !row.surfaced || !(row.verdict in DECISIVE_DETECTOR) || !row.domain) continue;
    const unit = byDomain.get(row.domain) || { id: row.domain, label: row.domain, obs: [] };
    unit.obs.push({ day: row.day || null, success: DECISIVE_DETECTOR[row.verdict], ref: null });
    byDomain.set(row.domain, unit);
  }
  const alertRefs = (state?.watchAlerts || [])
    .filter((a) => a && a.id && (a.status === 'confirmed' || a.status === 'false-alarm'))
    .map((a) => ({ type: 'alert', id: a.id, day: a.detectedOn || '' }))
    .sort((p, q) => (p.day < q.day ? 1 : -1));
  const ew = byDomain.get('Early warning');
  if (ew) ew.refs = alertRefs.slice(0, 4).map(({ type, id }) => ({ type, id }));
  return [...byDomain.values()];
}

/** Assumption criticality classes, from human-assessed premise outcomes. */
function premiseUnits(state) {
  const premises = new Map((state?.premises || []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const LABELS = { 'load-bearing': 'Load-bearing', major: 'Major', monitor: 'Monitor' };
  const units = new Map(Object.keys(LABELS).map((key) => [key, { id: key, label: LABELS[key], obs: [], refs: [] }]));
  const outcomes = (state?.premiseOutcomes || [])
    .filter((o) => o && (o.verdict === 'held' || o.verdict === 'failed') && premises.has(o.premiseId))
    .sort((p, q) => (p.settledOn < q.settledOn ? -1 : p.settledOn > q.settledOn ? 1 : 0));
  for (const outcome of outcomes) {
    const premise = premises.get(outcome.premiseId);
    const unit = units.get(LABELS[premise.criticality] ? premise.criticality : 'load-bearing');
    unit.obs.push({ day: outcome.settledOn, success: outcome.verdict === 'held', ref: { type: 'premise', id: premise.id } });
  }
  for (const unit of units.values()) {
    unit.refs = unit.obs.map((o) => o.ref).filter(Boolean).reverse()
      .filter((ref, index, all) => all.findIndex((r) => r.id === ref.id) === index).slice(0, 4);
  }
  return [...units.values()];
}

/**
 * Delegation authority classes. The outcome "delivered by the due date" is
 * settled the moment the due date passes, so overdue open work is a failure on
 * its due date — counting only closed work would keep the fast completions and
 * drop the slow ones (survivorship). Work not yet due is censored.
 */
function delegationUnits(state, today) {
  const units = new Map([
    ...Object.entries(DELEGATION_AUTHORITY).map(([key, meta]) => [key, { id: key, label: meta.shortLabel, covariate: AUTHORITY_AUTONOMY[key], obs: [] }]),
    ['unspecified', { id: 'unspecified', label: 'Unspecified', covariate: null, obs: [] }],
  ]);
  for (const d of state?.delegations || []) {
    if (!d || !d.dueOn) continue;
    const unit = units.get(DELEGATION_AUTHORITY[d.authority] ? d.authority : 'unspecified');
    if (d.status === 'done' && d.completedOn) {
      unit.obs.push({ day: d.completedOn, success: d.completedOn <= d.dueOn, ref: null });
    } else if (d.status === 'returned') {
      unit.obs.push({ day: d.returnedOn || d.dueOn, success: false, ref: null });
    } else if (d.status === 'active' && d.dueOn < today) {
      unit.obs.push({ day: d.dueOn, success: false, ref: null });
    }
  }
  return [...units.values()];
}

/** The raw evidence units of one group: [{ id, label, obs: [{ day, success, ref }], refs }]. */
export function evidenceUnits(groupId, state, today) {
  if (groupId === 'detectors') return detectorUnits(state);
  if (groupId === 'premises') return premiseUnits(state);
  if (groupId === 'delegation') return delegationUnits(state, today);
  return [];
}

/* -------------------------------------------------------------- the report */

function paceOf(obs, today) {
  const since = addDays(today, -91);
  const recent = obs.filter((o) => o.day && o.day > since && o.day <= today).length;
  return round(recent / 13, 2);
}

function graduationOf(n, strength, pace, today) {
  return CREDIBILITY_Z_TARGETS.map((zPct) => {
    const z = zPct / 100;
    const needed = Number.isFinite(strength) ? Math.ceil((strength * z) / (1 - z)) : null;
    if (needed === null) return { zPct, needed: null, remaining: null, weeks: null, date: null };
    const remaining = Math.max(0, needed - n);
    if (remaining === 0) return { zPct, needed, remaining: 0, weeks: 0, date: today };
    const weeks = pace > 0 ? remaining / pace : null;
    // A forecast further out than ten years is not a date anyone can use.
    if (weeks === null || weeks > 520) return { zPct, needed, remaining, weeks: null, date: null };
    return { zPct, needed, remaining, weeks: round(weeks, 1), date: addDays(today, Math.ceil(weeks * 7)) };
  });
}

function ownVerdictOf(x, n, floor, minUnitN) {
  if (n < minUnitN) return n ? 'insufficient' : 'none';
  const w = wilson(x, n);
  if (w.hi < floor) return 'below';
  if (w.lo >= floor) return 'above';
  return 'unresolved';
}

function unitRowsMeanZ(fit, k) {
  let sum = 0;
  for (let i = 0; i < k; i += 1) sum += unitPosterior(fit, i, null).z;
  return k ? sum / k : null;
}

function openPremiseRows(state) {
  const settled = new Set((state?.premiseOutcomes || [])
    .filter((o) => o && (o.verdict === 'held' || o.verdict === 'failed')).map((o) => o.premiseId));
  return (state?.premises || []).filter((p) => p && p.id && !settled.has(p.id)
    && p.humanDisposition !== 'retired' && p.status !== 'retired');
}

function groupReading(group, state, today, conventions, refused) {
  const floorPct = floorPctFor(group.id, conventions);
  const floor = floorPct / 100;
  const raw = evidenceUnits(group.id, state, today);
  const units = raw.map((u) => ({
    ...u,
    n: u.obs.length,
    x: u.obs.filter((o) => o.success).length,
  }));
  const live = units.filter((u) => u.n > 0);
  const N = live.reduce((s, u) => s + u.n, 0);
  const allEdge = live.length > 0 && live.every((u) => u.x === 0 || u.x === u.n);
  let regime;
  if (live.length < conventions.minUnits) regime = 'no-units';
  else if (N < conventions.minObservations) regime = 'too-thin';
  else if (allEdge) regime = 'degenerate';
  else regime = null;

  const het = heterogeneity(live);
  // The screen is flagged only when BOTH the test rejects homogeneity at the
  // declared alpha AND the spread is substantial (I² past the convention): a
  // significant but trivial spread is not a reason to question the pool.
  het.flagged = het.pValue !== null && het.pValue * 100 < conventions.heterogeneityAlphaPct
    && het.i2Pct !== null && het.i2Pct >= conventions.i2WarnPct;
  // Refused groups are still fitted, so the leader can see what borrowing
  // WOULD say — but nothing borrowed is printed as an estimate or acted on.
  const fittable = !regime;
  const fit = fittable ? fitHierarchy(live.map((u) => ({ x: u.x, n: u.n }))) : null;
  if (fittable) {
    let zSum = 0;
    for (let i = 0; i < live.length; i += 1) zSum += unitPosterior(fit, i, null).z;
    const meanZ = zSum / live.length;
    regime = meanZ < REGIME_Z_CUTS.poolLed ? 'pool-led' : meanZ > REGIME_Z_CUTS.ownLed ? 'own-led' : 'balanced';
  }
  const borrowing = BORROWING_REGIMES.includes(regime) && !refused;
  const hyper = fit && borrowing ? hyperSummary(fit) : null;
  const strength = hyper ? hyper.strengthMedian : null;
  const infl = fit && borrowing ? influence(fit) : null;
  const unitRows = units.map((u) => {
    const liveIndex = live.indexOf(u);
    const w = wilson(u.x, u.n);
    const jeffreys = u.n ? (u.x + 0.5) / (u.n + 1) : null;
    const own = ownVerdictOf(u.x, u.n, floor, conventions.minUnitN);
    const post = fit && borrowing ? (liveIndex >= 0 ? unitPosterior(fit, liveIndex, floor) : newUnitPredictive(fit, floor)) : null;
    const borrowedVerdict = post ? VERDICT_OF(post.pBelow, conventions.decisive) : null;
    const rescued = Boolean(post && (own === 'insufficient' || own === 'unresolved' || own === 'none')
      && (borrowedVerdict === 'below' || borrowedVerdict === 'above'));
    const pace = paceOf(u.obs, today);
    const lastObservedOn = u.obs.map((o) => o.day).filter(Boolean).sort().at(-1) || null;
    const inf = infl && liveIndex >= 0 ? infl[liveIndex] : null;
    return {
      id: u.id,
      label: u.label,
      n: u.n,
      x: u.x,
      rawPct: u.n ? pct(u.x / u.n, 1) : null,
      jeffreysPct: jeffreys === null ? null : pct(jeffreys, 1),
      wilsonLoPct: w.lo === null ? null : pct(w.lo, 1),
      wilsonHiPct: w.hi === null ? null : pct(w.hi, 1),
      ownVerdict: own,
      borrowedPct: post ? pct(post.mean, 1) : null,
      loPct: post ? pct(post.lo, 1) : null,
      hiPct: post ? pct(post.hi, 1) : null,
      zPct: post ? pct(post.z, 1) : null,
      pBelowPct: post && post.pBelow !== null ? pct(post.pBelow, 1) : null,
      borrowedVerdict,
      rescued,
      // The hierarchy shrinks the unit's RAW rate x/n toward the pool, so the
      // move is measured from x/n — measuring from the Jeffreys estimate could
      // show a unit drifting away from the pool it is in fact being pulled to.
      shrinkPp: post && u.n ? round((post.mean - u.x / u.n) * 100, 1) : null,
      pacePerWeek: pace,
      lastObservedOn,
      graduation: hyper ? graduationOf(u.n, strength, pace, today) : [],
      influencePp: inf ? inf.maxShiftPp : null,
      influenceSd: inf ? inf.sdRatio : null,
      influenceMoves: inf && inf.movedIndex >= 0 ? live[inf.movedIndex].id : null,
      evidenceRefs: (u.refs || []).slice(0, 4),
      liveIndex,
    };
  });

  const carriers = infl
    ? unitRows.filter((row) => row.influencePp !== null && row.influencePp >= conventions.influenceTolerancePct
      && row.influenceSd !== null && row.influenceSd >= 1)
    : [];

  // The outside view: every open assumption's declared prior against the
  // borrowed hold rate of its class.
  let outsideView = [];
  if (group.id === 'premises') {
    outsideView = openPremiseRows(state).map((p) => {
      const unit = unitRows.find((row) => row.id === p.criticality) || unitRows[0];
      const prior = Math.min(95, Math.max(5, Number(p.priorPct) || 70));
      const pBelowPrior = fit && borrowing ? unitProbBelow(fit, unit ? unit.liveIndex : -1, prior / 100) : null;
      return {
        premiseId: p.id,
        classId: unit ? unit.id : null,
        priorPct: prior,
        classBorrowedPct: unit ? unit.borrowedPct : null,
        classHiPct: unit ? unit.hiPct : null,
        pBelowPriorPct: pBelowPrior === null ? null : pct(pBelowPrior, 1),
        flagged: pBelowPrior !== null && pBelowPrior >= conventions.decisive,
      };
    });
  }

  // Every active delegation not yet due gets the borrowed probability that it
  // lands on time: the class's posterior predictive for one more outcome.
  let forecasts = [];
  if (group.id === 'delegation') {
    forecasts = (state?.delegations || [])
      .filter((d) => d && d.status === 'active' && d.dueOn && d.dueOn >= today)
      .map((d) => {
        const classId = DELEGATION_AUTHORITY[d.authority] ? d.authority : 'unspecified';
        const unit = unitRows.find((row) => row.id === classId);
        const days = daysBetween(today, d.dueOn);
        return {
          delegationId: d.id,
          classId,
          dueOn: d.dueOn,
          daysToDue: days,
          pOnTimePct: unit ? unit.borrowedPct : null,
          zPct: unit ? unit.zPct : null,
          withinCheckpoint: days !== null && days <= conventions.checkpointDays,
          classVerdict: unit ? unit.borrowedVerdict : null,
        };
      })
      .sort((p, q) => (p.dueOn < q.dueOn ? -1 : p.dueOn > q.dueOn ? 1 : 0));
  }

  const neverJudged = fit && borrowing ? newUnitPredictive(fit, floor) : null;
  const short = conventions.minUnits - live.length;
  const thin = conventions.minObservations - N;
  const missing = regime === 'no-units'
    ? `${short} more ${short === 1 ? group.unitLabel : group.unitPlural} with at least one outcome`
    : regime === 'too-thin'
      ? `${thin} more decisive outcome${thin === 1 ? '' : 's'} across the group`
      : regime === 'degenerate'
        ? 'one outcome that breaks the all-or-nothing pattern'
        : null;

  return {
    id: group.id,
    label: group.label,
    groupLabel: group.groupLabel,
    unitLabel: group.unitLabel,
    unitPlural: group.unitPlural,
    quantity: group.quantity,
    shortQuantity: group.shortQuantity,
    source: group.source,
    successDefinition: group.successDefinition,
    floorPct,
    regime,
    regimeLabel: CREDIBILITY_REGIME_LABELS[regime],
    refused: Boolean(refused),
    borrowing,
    missing,
    counts: { units: live.length, observations: N, successes: live.reduce((s, u) => s + u.x, 0) },
    pooledRawPct: N ? pct(live.reduce((s, u) => s + u.x, 0) / N, 1) : null,
    pooled: hyper ? { meanPct: hyper.meanPct, loPct: hyper.loPct, hiPct: hyper.hiPct } : null,
    prior: hyper ? {
      strengthMedian: hyper.strengthMedian,
      strengthLo: hyper.strengthLo,
      strengthHi: hyper.strengthHi,
      identified: hyper.identified,
    } : null,
    heterogeneity: het,
    neverJudged: neverJudged ? {
      meanPct: pct(neverJudged.mean, 1),
      loPct: pct(neverJudged.lo, 1),
      hiPct: pct(neverJudged.hi, 1),
      pBelowPct: neverJudged.pBelow === null ? null : pct(neverJudged.pBelow, 1),
    } : null,
    units: unitRows,
    rescued: unitRows.filter((row) => row.rescued),
    carriers,
    outsideView,
    forecasts,
    fitKey: fit && borrowing ? live.map((u) => `${u.x}/${u.n}`).join(',') : null,
    meanZPct: fit ? pct(unitRowsMeanZ(fit, live.length), 1) : null,
  };
}

/** The frozen-frame ledger: what is open, what is due, and the graded skill per group. */
export function frameLedger(state, today, conventions) {
  const frames = Array.isArray(state?.credibilityFrames) ? state.credibilityFrames : [];
  const open = frames.filter((f) => f && !f.graded && !f.lapsedOn);
  const due = open.filter((f) => f.reviewOn <= today);
  const graded = frames.filter((f) => f && f.graded);
  const byGroup = CREDIBILITY_GROUPS.map((group) => {
    const rows = graded.filter((f) => f.groupId === group.id);
    const sumB = rows.reduce((s, f) => s + f.graded.brierBorrowed, 0);
    const sumR = rows.reduce((s, f) => s + f.graded.brierRaw, 0);
    const wins = rows.filter((f) => f.graded.brierBorrowed < f.graded.brierRaw).length;
    const ready = rows.length >= conventions.skillFloor;
    return {
      groupId: group.id,
      graded: rows.length,
      wins,
      meanBrierBorrowed: rows.length ? round(sumB / rows.length, 4) : null,
      meanBrierRaw: rows.length ? round(sumR / rows.length, 4) : null,
      // Skill against own data: positive means borrowing beat the unit's own
      // record on the outcomes that followed. Withheld below the floor.
      skill: ready && sumR > 0 ? round(1 - sumB / sumR, 3) : null,
      skillReady: ready,
      needed: Math.max(0, conventions.skillFloor - rows.length),
    };
  });
  return {
    frames,
    open,
    due,
    graded,
    lapsed: frames.filter((f) => f && f.lapsedOn),
    byGroup,
  };
}

export function credibilityReport(state, now = new Date(), settings = null) {
  const s = settings || state?.settings || {};
  const conventions = credibilityConventions(s);
  const today = dayKey(now);
  const refused = refusedGroups(state);
  const declarations = Array.isArray(state?.credibilityDeclarations) ? state.credibilityDeclarations : [];
  const groups = CREDIBILITY_GROUPS.map((group) => {
    const reading = groupReading(group, state, today, conventions, refused.has(group.id));
    reading.declaration = declarations.find((d) => d.groupId === group.id) || null;
    return reading;
  });
  const ledger = frameLedger(state, today, conventions);
  return {
    version: CREDIBILITY_ENGINE_VERSION,
    today,
    conventions,
    groups,
    ledger,
    totals: {
      units: groups.reduce((sum, g) => sum + g.counts.units, 0),
      observations: groups.reduce((sum, g) => sum + g.counts.observations, 0),
      // Units actually priced: those in groups that borrow. Units in thin or
      // refused groups are counted separately, never as priced.
      pricedUnits: groups.filter((g) => g.borrowing).reduce((sum, g) => sum + g.counts.units, 0),
      pricedObservations: groups.filter((g) => g.borrowing).reduce((sum, g) => sum + g.counts.observations, 0),
      borrowingGroups: groups.filter((g) => g.borrowing).length,
      rescued: groups.reduce((sum, g) => sum + g.rescued.length, 0),
      flaggedPremises: groups.reduce((sum, g) => sum + g.outsideView.filter((r) => r.flagged).length, 0),
    },
  };
}

/** One group's live fit, for the what-if panel. Null when the group does not borrow. */
export function groupFit(report, groupId) {
  const group = report.groups.find((g) => g.id === groupId);
  if (!group || !group.borrowing || !group.fitKey) return null;
  const units = group.fitKey.split(',').map((pair) => {
    const [x, n] = pair.split('/').map(Number);
    return { x, n };
  });
  return fitHierarchy(units);
}

/**
 * Lazy candidate analysis for the Authority model panel. The regression is not
 * part of credibilityReport or the automation path; it runs only when a leader
 * opens the preview, and only while the governed authority pool is permitted.
 */
export function credibilityCovariatePreview(state, report) {
  const group = report?.groups?.find((row) => row.id === 'delegation');
  if (!group?.borrowing) return null;
  const units = evidenceUnits('delegation', state, report.today).map((unit) => ({
    id: unit.id,
    x: unit.obs.filter((o) => o.success).length,
    n: unit.obs.length,
    covariate: unit.covariate,
  }));
  const fit = fitCovariateHierarchy(units);
  if (!fit) return null;
  return {
    model: fit.model,
    slopeMean: round(fit.slopeMean, 3),
    slopeLo: round(fit.slopeLo, 3),
    slopeHi: round(fit.slopeHi, 3),
    probabilityPositive: round(fit.probabilityPositive, 3),
    prior: fit.prior,
    caveat: fit.caveat,
    units: fit.units.map((unit) => ({
      id: unit.id,
      label: group.units.find((row) => row.id === unit.id)?.label || unit.id,
      n: unit.n,
      x: unit.x,
      covariate: unit.covariate,
      meanPct: pct(unit.mean, 1),
      loPct: pct(unit.lo, 1),
      hiPct: pct(unit.hi, 1),
    })),
  };
}

/* ---------------------------------------------------------------- frames */

/**
 * Build a frozen borrowing forecast for one unit. The record freezes BOTH
 * forecasters — the borrowed estimate and the own-data (Jeffreys) estimate — so
 * the grade is a fair contest on the same outcomes.
 */
export function buildCredibilityFrame(report, { groupId, unitId, horizonN = null, reviewOn = null, nowIso, id, label = '' }) {
  const group = report.groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, error: 'Choose one of the registered evidence groups.' };
  if (!group.borrowing) {
    return {
      ok: false,
      error: group.refused
        ? 'You have declared that this group is not one kind of thing, so nothing in it is borrowed — and nothing borrowed can be frozen.'
        : `This group does not borrow yet (${group.regimeLabel.toLowerCase()}). It needs ${group.missing || 'more evidence'}.`,
    };
  }
  const unit = group.units.find((u) => u.id === unitId);
  if (!unit) return { ok: false, error: 'That unit has no record in this group.' };
  if (unit.n < 1 || unit.jeffreysPct === null) {
    return { ok: false, error: 'A frame needs at least one own outcome, or the borrowed and own-data forecasts would be the same forecast.' };
  }
  const today = report.today;
  const due = reviewOn || addDays(today, report.conventions.reviewDays);
  if (!due || due <= today) return { ok: false, error: 'The review day must be in the future so the frozen claim tests a real outcome.' };
  const horizon = horizonN === null || horizonN === undefined ? report.conventions.horizonN : Math.round(Number(horizonN));
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 40) {
    return { ok: false, error: 'The horizon is a whole number of outcomes from 1 to 40.' };
  }
  return {
    ok: true,
    record: {
      id,
      groupId,
      unitId,
      label: String(label || `${group.label}: ${unit.label}`).slice(0, 120),
      frozenAt: nowIso,
      reviewOn: due,
      borrowedPct: round(clampPct(unit.borrowedPct), 2),
      rawPct: round(clampPct(unit.jeffreysPct), 2),
      nAtFreeze: unit.n,
      zAtFreeze: unit.zPct,
      credibleLoPct: unit.loPct,
      credibleHiPct: unit.hiPct,
      horizonN: horizon,
      regime: group.regime,
      pooledMeanPct: group.pooled ? round(clampPct(group.pooled.meanPct), 2) : null,
      priorStrength: group.prior ? group.prior.strengthMedian : null,
      evidenceRefs: unit.evidenceRefs.slice(0, 4),
      graded: null,
      lapsedOn: null,
      notes: [],
    },
  };
}

/**
 * Grade a frame once from the unit's outcomes dated inside its window, the
 * first `horizonN` of them. Null when nothing happened — never a guess.
 */
export function gradeCredibilityFrame(frame, state, now) {
  if (!frame || frame.graded) return null;
  const today = dayKey(now);
  const unit = evidenceUnits(frame.groupId, state, today).find((u) => u.id === frame.unitId);
  if (!unit) return null;
  const frozenDay = String(frame.frozenAt).slice(0, 10);
  const window = unit.obs
    .filter((o) => o.day && o.day > frozenDay && o.day <= frame.reviewOn)
    .sort((p, q) => (p.day < q.day ? -1 : p.day > q.day ? 1 : 0))
    .slice(0, frame.horizonN);
  if (!window.length) return null;
  const b = frame.borrowedPct / 100;
  const r = frame.rawPct / 100;
  const ys = window.map((o) => (o.success ? 1 : 0));
  const brier = (p) => ys.reduce((s, y) => s + (p - y) ** 2, 0) / ys.length;
  return {
    gradedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    observed: ys.length,
    successes: ys.reduce((s, y) => s + y, 0),
    brierBorrowed: round(brier(b), 6),
    brierRaw: round(brier(r), 6),
    skill: null,
  };
}

/* --------------------------------------------------------------- signals */

const route = (panel, extra = '') => `#/credibility?panel=${panel}${extra}`;

export function credibilitySignals(state, now = new Date(), settings = null) {
  const report = credibilityReport(state, now, settings);
  const { conventions } = report;
  const out = [];
  const declaredRecently = (group) => group.declaration
    && daysBetween(group.declaration.declaredAt, now) !== null
    && daysBetween(group.declaration.declaredAt, now) <= 90;

  for (const group of report.groups) {
    if (!group.borrowing) continue;
    const below = group.rescued.filter((u) => u.borrowedVerdict === 'below'
      && u.id !== 'Signal integrity' && u.id !== CREDIBILITY_DOMAIN);
    if (below.length && group.id !== 'premises') {
      out.push({
        ruleId: CREDIBILITY_SIGNAL_IDS.BORROWED,
        domain: CREDIBILITY_DOMAIN,
        title: group.id === 'detectors'
          ? `${below.length} signal famil${below.length === 1 ? 'y is' : 'ies are'} below the precision floor on borrowed evidence — before the Board can say so on its own`
          : `${below.length} delegation authority class${below.length === 1 ? ' is' : 'es are'} finishing late on borrowed evidence`,
        detail: `${below.map((u) => `${u.label}: ${u.borrowedPct}% borrowed (90% ${u.loPct}–${u.hiPct}%), ${u.x}/${u.n} own, ${u.zPct}% of the number is its own`).join('; ')}. `
          + `Each sits below the declared ${group.floorPct}% floor with at least ${conventions.decisivePct}% posterior probability, while its own record alone is ${below.map((u) => u.ownVerdict === 'insufficient' ? 'too thin to judge' : 'unresolved').filter((v, i, a) => a.indexOf(v) === i).join(' or ')}. `
          + 'A borrowed verdict is a bet that these units are alike; every one the engine acts on is frozen and graded against what follows.',
        severity: 3,
        confidence: 'medium',
        evidence: [
          `Group regime: ${group.regimeLabel}`,
          `Pooled ${group.shortQuantity}: ${group.pooled.meanPct}% (90% ${group.pooled.loPct}–${group.pooled.hiPct}%)`,
          `Prior strength: ~${group.prior.strengthMedian} observations (80% ${group.prior.strengthLo}–${group.prior.strengthHi})`,
        ],
        action: { label: 'Open the shrinkage view', route: route('shrinkage', `&group=${group.id}`) },
      });
    }
    const flagged = group.outsideView.filter((row) => row.flagged);
    if (flagged.length) {
      out.push({
        ruleId: CREDIBILITY_SIGNAL_IDS.BORROWED,
        domain: CREDIBILITY_DOMAIN,
        title: `${flagged.length} open assumption${flagged.length === 1 ? ' is' : 's are'} declared more confidently than ${flagged.length === 1 ? 'its' : 'their'} class has ever delivered`,
        detail: `Declared priors of ${flagged.map((r) => `${r.priorPct}%`).join(', ')} against borrowed class hold rates of ${flagged.map((r) => `${r.classBorrowedPct}%`).join(', ')}. `
          + `For each, the class's true hold rate is below the declared prior with at least ${conventions.decisivePct}% posterior probability. `
          + 'This is the outside view (reference-class forecasting): the inside story may still be right, but it now has to be written down.',
        severity: 3,
        confidence: 'medium',
        evidence: flagged.slice(0, 3).map((r) => `Prior ${r.priorPct}% · class ${r.classBorrowedPct}% (90% up to ${r.classHiPct}%) · P(class below prior) ${r.pBelowPriorPct}%`),
        action: { label: 'Open the outside view', route: route('outside') },
      });
    }
    if (group.heterogeneity.flagged && !declaredRecently(group)) {
      out.push({
        ruleId: CREDIBILITY_SIGNAL_IDS.HETEROGENEOUS,
        domain: CREDIBILITY_DOMAIN,
        title: `${group.groupLabel} may not be one kind of thing (I² ${group.heterogeneity.i2Pct}%)`,
        detail: `The ${group.label.toLowerCase()} differ by more than sampling noise explains (χ² ${group.heterogeneity.x2} on ${group.heterogeneity.df} df, p ${group.heterogeneity.pValue}${group.heterogeneity.approximate ? ', approximate: sparse cells' : ''}). The model already borrows less when units differ, but whether they belong in one pool at all is your judgement — declare it once and this stops asking.`,
        severity: 2,
        confidence: group.heterogeneity.approximate ? 'low' : 'medium',
        evidence: group.units.filter((u) => u.n > 0).slice(0, 4).map((u) => `${u.label}: ${u.x}/${u.n}`),
        action: { label: 'Declare exchangeability', route: route('overview', `&group=${group.id}`) },
      });
    }
    if (group.carriers.length) {
      const top = group.carriers[0];
      out.push({
        ruleId: CREDIBILITY_SIGNAL_IDS.INFLUENTIAL,
        domain: CREDIBILITY_DOMAIN,
        title: `One ${group.unitLabel} carries the ${group.label.toLowerCase()} pool`,
        detail: `Removing “${top.label}” from the hyperprior moves another unit's borrowed estimate by ${top.influencePp} points, past the ${conventions.influenceTolerancePct}-point tolerance. Borrowed figures in this group lean on one record.`,
        severity: 2,
        confidence: 'medium',
        evidence: group.carriers.slice(0, 3).map((u) => `${u.label}: moves others by ${u.influencePp} pp`),
        action: { label: 'Open the shrinkage view', route: route('shrinkage', `&group=${group.id}`) },
      });
    }
  }

  for (const row of report.ledger.byGroup) {
    if (row.skill !== null && row.skill < 0) {
      const group = credibilityGroup(row.groupId);
      out.push({
        ruleId: CREDIBILITY_SIGNAL_IDS.LOST,
        domain: CREDIBILITY_DOMAIN,
        title: `Borrowing has lost to own data in ${group.groupLabel.toLowerCase()}`,
        detail: `Over ${row.graded} graded frames the borrowed forecasts scored a mean Brier of ${row.meanBrierBorrowed} against ${row.meanBrierRaw} for each unit's own record (skill ${row.skill}). The units in this group are not behaving like draws from one distribution here.`,
        severity: 4,
        confidence: 'high',
        evidence: [`Borrowed beat own data in ${row.wins} of ${row.graded} frames`],
        action: { label: 'Open the ledger', route: route('ledger') },
      });
    }
  }

  if (report.ledger.due.length) {
    out.push({
      ruleId: CREDIBILITY_SIGNAL_IDS.DUE,
      domain: CREDIBILITY_DOMAIN,
      title: `${report.ledger.due.length} borrowing forecast${report.ledger.due.length === 1 ? ' is' : 's are'} due for grading`,
      detail: 'Their review days have passed. A scan grades each against the outcomes recorded inside its window, or marks it lapsed when nothing happened — it never guesses.',
      severity: 2,
      confidence: 'high',
      evidence: report.ledger.due.slice(0, 3).map((f) => `${f.label} · review ${f.reviewOn}`),
      action: { label: 'Open the ledger', route: route('ledger') },
    });
  }
  return out;
}

export function credibilityAttentionCount(state, now = new Date()) {
  return credibilitySignals(state, now).filter((s) => s.severity >= 3).length;
}

/* ----------------------------------------------------------------- brief */

export function credibilityBrief(state, now = new Date(), settings = null) {
  const report = credibilityReport(state, now, settings);
  const lines = [];
  lines.push(`LeadOS — Borrowed evidence brief (${report.today})`);
  lines.push(`Engine ${report.version}. Hierarchical Beta-binomial, full Bayes on a grid, BDA3 hyperprior.`);
  lines.push('No person is a unit. Units are signal families, assumption criticality classes and delegation authority classes.');
  lines.push('');
  for (const g of report.groups) {
    lines.push(`## ${g.groupLabel} — ${g.shortQuantity}`);
    lines.push(`Regime: ${g.regimeLabel}${g.refused ? ' (borrowing refused by the leader)' : ''}. ${g.counts.units} unit(s), ${g.counts.observations} outcome(s).`);
    if (g.missing) lines.push(`Needs: ${g.missing}.`);
    if (g.pooled) {
      lines.push(`Pooled rate ${g.pooled.meanPct}% (90% ${g.pooled.loPct}–${g.pooled.hiPct}%); prior worth ~${g.prior.strengthMedian} outcomes (80% ${g.prior.strengthLo}–${g.prior.strengthHi})${g.prior.identified ? '' : ' — weakly identified'}.`);
      if (g.heterogeneity.x2 !== null) {
        lines.push(`Heterogeneity: χ² ${g.heterogeneity.x2} on ${g.heterogeneity.df} df, p ${g.heterogeneity.pValue}, I² ${g.heterogeneity.i2Pct}%${g.heterogeneity.approximate ? ' (approximate)' : ''}.`);
      }
      for (const u of g.units.filter((row) => row.n > 0)) {
        lines.push(`- ${u.label}: own ${u.x}/${u.n} → borrowed ${u.borrowedPct}% (90% ${u.loPct}–${u.hiPct}%), own weight ${u.zPct}%, verdict ${u.borrowedVerdict} vs ${g.floorPct}% floor (own data: ${u.ownVerdict}).`);
      }
      if (g.neverJudged) lines.push(`A ${g.unitLabel} with no outcomes yet inherits ${g.neverJudged.meanPct}% (90% ${g.neverJudged.loPct}–${g.neverJudged.hiPct}%).`);
    }
    lines.push('');
  }
  lines.push('## Graded borrowing');
  for (const row of report.ledger.byGroup) {
    const group = credibilityGroup(row.groupId);
    lines.push(`- ${group.groupLabel}: ${row.graded} graded frame(s)${row.skill !== null ? `, skill vs own data ${row.skill}` : `, skill withheld (${row.needed} more needed)`}.`);
  }
  lines.push('');
  lines.push('Borrowed figures are model-based estimates for decision support, not measurements. Exchangeability is a declared judgement.');
  return lines.join('\n');
}
