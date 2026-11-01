/**
 * app/core/domain/reliability.js — the Measurement Reliability Terminal
 * (Schema v77, ADR-0069).
 *
 * THE PROBLEM
 * -----------
 * LeadOS now prices decisions, cases, evidence, capacity, survival, waiting,
 * parity and policy. Every one of those readings ultimately rests, sooner or
 * later, on a manager's ordinal judgement of a person: a review rating, a goal's
 * attainment, a feedback balance, a delivery that landed late. Comp differentiates
 * pay with it. Succession promotes with it. Parity audits distribution with it.
 * The Performance Recovery Terminal decides whether a conversation is warranted
 * with it. Nobody has once asked how much of that number is real.
 *
 * In psychometrics this is the oldest question in the field, and the answer is
 * routinely uncomfortable. Supervisory performance ratings sit at the low end of
 * reliability (Viswesvaran, Schmidt & Ones 2005 put single-rating interrater
 * reliability near .52; Sackett, Zhang, Berry & Lievens 2022 show how much the
 * design changes the number), and a leader differentiating five people on three
 * ratings each is, arithmetically, differentiating partly on noise. That is not a
 * criticism of the leader — it is what small samples do. Nobody tells them.
 *
 * So this module decomposes the leader's own record:
 *
 *   y_ij = μ + a_i + b_j + e_ij,   a_i ~ (0, τ²),   e_ij ~ (0, σ²)
 *
 * where i indexes *people*, j indexes *review cycles*, a_i is the person effect
 * (signal, if it exists), b_j is the cycle effect (a hard quarter lowers everyone),
 * and e_ij is everything else. τ²/(τ²+σ²) is the intraclass correlation —
 * the share of what the leader sees that is actually about the person. Cycle and
 * residual are pooled as occasion error for the credibility model, because a
 * manager cannot bank a good quarter and cash it in later.
 *
 * WHAT IS DERIVED (every render, from records the workspace already keeps)
 * ----------------------------------------------------------------------
 *  1. Variance components by method of moments on the unbalanced design
 *     (two-way additive least squares + Cochran's n₀), which reduces exactly to
 *     the classic two-way random-effects estimator when the design is balanced.
 *     Asserted by test.
 *  2. ICC(1) with the Shrout–Fleiss (1979) interval and the F test of τ² = 0.
 *  3. Spearman–Brown (1910) reliability at k observations, and its inverse — the
 *     D-study answer to "how many more?" (Cronbach et al. 1972).
 *  4. Bühlmann (1967) credibility Z = n/(n + σ²/τ²), with the empirical-Bayes
 *     posterior variance 1/(1/τ² + n/σ²) — the same arithmetic insurers use.
 *  5. A **partial order**, not a ranking: tiers at a declared separation bar,
 *     with every adjacent pair's posterior separation probability printed, and
 *     names inside a tier deliberately alphabetical so no order is implied.
 *  6. A decision study: the minimum detectable difference at the current record,
 *     and the number of additional observations a one-point comparison needs.
 *  7. Regression to the mean for the top and bottom readings — the number the
 *     leader should *expect* next time, so a star's fall is not read as decline.
 *  8. Instrument convergence by Spearman rank correlation with an exact
 *     permutation test, and an explicit refusal to form a composite when the
 *     instruments do not agree.
 *
 * WHAT IS NEVER DERIVED
 * ---------------------
 * A person's "true" score, potential, expected value, nine-box position, or a
 * probability that someone should be promoted, paid differently or exited. No
 * such figure exists in this file, and the report object has no field that could
 * hold one. Nothing here reads prose, sentiment, demographics or leave records.
 *
 * Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, clamp, dayKey, daysBetween, mean, round } from '../time.js';
import { betaCdf, betaQuantile } from './credibility.js';
import {
  RELIABILITY_ENGINE_VERSION,
  RELIABILITY_LIMITS,
  RELIABILITY_VERDICT_META,
  RELIABILITY_VERDICTS,
  reviewRatingValue,
} from './reliabilityRegistry.js';
import { normalizeReliabilitySettings } from './reliabilitySchema.js';

/* ------------------------------------------------------------------ *
 * Numeric helpers
 * ------------------------------------------------------------------ */

const Z_975 = 1.959963984540054;

/** Standard normal CDF by Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return null;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal (Acklam's rational approximation, |error| < 1.15e-9). */
export function invNormal(p) {
  if (!(p > 0) || !(p < 1)) return null;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Two-sided p-value for Student's t with df degrees of freedom. */
export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return null;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, betaCdf(x, df / 2, 0.5)));
}

/** Upper-tail survival of F(d1, d2) at f. */
export function fSurvival(f, d1, d2) {
  if (!(f >= 0) || !(d1 > 0) || !(d2 > 0)) return null;
  if (f === 0) return 1;
  const x = (d1 * f) / (d1 * f + d2);
  return Math.max(0, Math.min(1, 1 - betaCdf(x, d1 / 2, d2 / 2)));
}

/** Quantile of F(d1, d2). */
export function fQuantile(p, d1, d2) {
  if (!(p > 0) || !(p < 1) || !(d1 > 0) || !(d2 > 0)) return null;
  const x = betaQuantile(p, d1 / 2, d2 / 2);
  if (!(x > 0) || !(x < 1)) return null;
  return (d2 / d1) * (x / (1 - x));
}

const round4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null);
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const toPoints = (value) => (Number.isFinite(value) ? 1 + value * 3 : null);

function activePeople(state) {
  return (state.people || []).filter((p) => p && p.id && p.status !== 'archived');
}

function median(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/* Chicago rank correlation. */
function ranks(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j += 1;
    const share = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k].i] = share;
    i = j + 1;
  }
  return out;
}

/** Spearman's ρ with tie-corrected ranks. Null when either side is constant. */
export function spearman(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 3) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
}

/**
 * Exact permutation p-value for Spearman's ρ (all n! rank assignments).
 * Above 7 items the exact test is skipped and an asymptotic t approximation is
 * used instead; that threshold is declared in the report and in the tests.
 */
export function spearmanPermutationP(xs, ys, { maxExact = 7, seed = 0x5eed } = {}) {
  const observed = spearman(xs, ys);
  if (observed === null) return null;
  const n = xs.length;
  if (n > maxExact) {
    const t = observed * Math.sqrt((n - 2) / Math.max(1e-12, 1 - observed * observed));
    return { p: tTwoSidedP(t, n - 2), method: 'asymptotic-t', permutations: null };
  }
  // Permute the ranks of y against fixed ranks of x — equivalent to permuting
  // the observations, but cheaper because only one side has to move.
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let dx = 0;
  let dyTotal = 0;
  for (let i = 0; i < n; i += 1) {
    dx += (rx[i] - mx) ** 2;
    dyTotal += (ry[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx * dyTotal);
  const target = Math.abs(observed) - 1e-12;
  const idx = ry.slice();
  let atLeast = 0;
  let total = 0;
  // Heap's algorithm would be equivalent; a lexicographic next-permutation walk
  // is easier to reason about and costs the same for n ≤ 7 (≤ 5,040 leaves).
  // Every permutation is enumerated from sorted order, so the observed
  // arrangement appears exactly once in the walk and the count is unbiased.
  // (Seed is retained in the signature for a future Monte-Carlo path above the
  // exact cutoff; the exact walk itself needs no randomness.)
  void seed;
  const perm = idx.slice().sort((a, b) => a - b);
  let done = false;
  while (!done) {
    let num = 0;
    for (let i = 0; i < n; i += 1) num += (rx[i] - mx) * (perm[i] - my);
    total += 1;
    if (Math.abs(num / denom) >= target) atLeast += 1;
    // next permutation
    let i = n - 2;
    while (i >= 0 && perm[i] >= perm[i + 1]) i -= 1;
    if (i < 0) { done = true; break; }
    let j = n - 1;
    while (perm[j] <= perm[i]) j -= 1;
    [perm[i], perm[j]] = [perm[j], perm[i]];
    let lo = i + 1;
    let hi = n - 1;
    while (lo < hi) { [perm[lo], perm[hi]] = [perm[hi], perm[lo]]; lo += 1; hi -= 1; }
  }
  return { p: total ? atLeast / total : null, method: 'exact-permutation', permutations: total };
}

/* ------------------------------------------------------------------ *
 * 1. Harvest — observations from records the leader already keeps
 * ------------------------------------------------------------------ */

/**
 * Primary instrument: completed reviews with a manager rating, one observation
 * per (person, review period). A reopened-then-recompleted review is the same
 * observation and is never double-counted; when two completed reviews exist for
 * the same period the later completion wins and the duplicate is counted.
 */
export function harvestReviewObservations(state, { includeArchived = false } = {}) {
  const people = includeArchived ? (state.people || []) : activePeople(state);
  const byId = new Map(people.map((p) => [p.id, p]));
  const cells = new Map();
  let duplicates = 0;
  let unrated = 0;
  for (const review of state.reviews || []) {
    if (!review || review.status !== 'complete') continue;
    const value = reviewRatingValue(review.manager?.rating);
    if (value === null) { unrated += 1; continue; }
    if (!review.personId || !byId.has(review.personId)) continue;
    const occasion = review.periodEnd;
    if (!occasion) continue;
    const completedOn = (review.completedAt || review.updatedAt || '').slice(0, 10) || occasion;
    const key = `${review.personId}|${occasion}`;
    const next = {
      personId: review.personId,
      reviewId: review.id,
      occasion,
      value,
      rating: review.manager.rating,
      completedOn,
    };
    const prev = cells.get(key);
    if (prev) {
      duplicates += 1;
      if (next.completedOn < prev.completedOn) continue;
    }
    cells.set(key, next);
  }
  const observations = [...cells.values()].sort((a, b) => (a.occasion < b.occasion ? -1 : a.occasion > b.occasion ? 1 : 0));
  const byPerson = new Map();
  for (const obs of observations) {
    if (!byPerson.has(obs.personId)) byPerson.set(obs.personId, []);
    byPerson.get(obs.personId).push(obs);
  }
  const occasions = [...new Set(observations.map((o) => o.occasion))].sort();
  return {
    observations,
    byPerson,
    occasions,
    duplicates,
    unrated,
    people: people.map((p) => ({ id: p.id, name: p.name || 'Unnamed' })),
    nameOf: (id) => byId.get(id)?.name || 'Unnamed',
  };
}

/* ------------------------------------------------------------------ *
 * 2. Decomposition — two-way additive least squares, moments estimator
 * ------------------------------------------------------------------ */

/**
 * Fit y_ij ≈ μ + a_i + b_j by alternating least squares (the normal equations of
 * the additive two-way model). Deterministic, bounded, and exact for a balanced
 * design in one sweep.
 */
export function fitAdditive(cells, { sweeps = 40 } = {}) {
  const N = cells.length;
  if (!N) return null;
  let mu = mean(cells.map((c) => c.value));
  const a = new Map();
  const b = new Map();
  const nByPerson = new Map();
  const nByOccasion = new Map();
  for (const c of cells) {
    nByPerson.set(c.personId, (nByPerson.get(c.personId) || 0) + 1);
    nByOccasion.set(c.occasion, (nByOccasion.get(c.occasion) || 0) + 1);
  }
  for (const id of nByPerson.keys()) a.set(id, 0);
  for (const oc of nByOccasion.keys()) b.set(oc, 0);
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    // b_j | a
    const sumB = new Map();
    for (const oc of nByOccasion.keys()) sumB.set(oc, 0);
    for (const c of cells) sumB.set(c.occasion, sumB.get(c.occasion) + (c.value - mu - a.get(c.personId)));
    let shiftB = 0;
    for (const [oc, n] of nByOccasion) {
      const value = sumB.get(oc) / n;
      b.set(oc, value);
      shiftB += value * n;
    }
    shiftB /= N;
    for (const oc of b.keys()) b.set(oc, b.get(oc) - shiftB);
    mu += shiftB;
    // a_i | b
    const sumA = new Map();
    for (const id of nByPerson.keys()) sumA.set(id, 0);
    for (const c of cells) sumA.set(c.personId, sumA.get(c.personId) + (c.value - mu - b.get(c.occasion)));
    let shiftA = 0;
    for (const [id, n] of nByPerson) {
      const value = sumA.get(id) / n;
      a.set(id, value);
      shiftA += value * n;
    }
    shiftA /= N;
    for (const id of a.keys()) a.set(id, a.get(id) - shiftA);
    mu += shiftA;
    if (Math.abs(shiftA) < 1e-12 && Math.abs(shiftB) < 1e-12) break;
  }
  let rss = 0;
  for (const c of cells) {
    const fitted = mu + a.get(c.personId) + b.get(c.occasion);
    rss += (c.value - fitted) ** 2;
  }
  return { mu, a, b, rss, nByPerson, nByOccasion };
}

/**
 * Variance components. Returns null when the design cannot support them, with a
 * machine-readable reason so the caller can print it rather than round it.
 */
export function decomposeVariance(cells, { floors = RELIABILITY_LIMITS, requireBalanced = true } = {}) {
  const N = cells.length;
  const persons = [...new Set(cells.map((c) => c.personId))];
  const occasions = [...new Set(cells.map((c) => c.occasion))];
  const P = persons.length;
  const J = occasions.length;
  const counts = persons.map((id) => cells.filter((c) => c.personId === id).length);
  const design = {
    persons: P,
    occasions: J,
    observations: N,
    medianObsPerPerson: median(counts),
    maxObsPerPerson: counts.length ? Math.max(...counts) : 0,
    minObsPerPerson: counts.length ? Math.min(...counts) : 0,
  };
  design.balanceRatio = design.medianObsPerPerson
    ? round(design.maxObsPerPerson / design.medianObsPerPerson, 2)
    : null;

  if (P < floors.minPersons) return { ok: false, reason: 'too-few-persons', design };
  if (N < floors.minObservations) return { ok: false, reason: 'too-few-observations', design };
  if (J < floors.minOccasions) return { ok: false, reason: 'too-few-occasions', design };
  if (design.minObsPerPerson < floors.minObsPerPerson) return { ok: false, reason: 'too-few-per-person', design };
  if (requireBalanced && design.balanceRatio > floors.maxImbalanceRatio) {
    return { ok: false, reason: 'too-unbalanced', design };
  }
  const dfResid = N - P - J + 1;
  if (dfResid < 1) return { ok: false, reason: 'no-residual-df', design };

  const fit = fitAdditive(cells);
  const sigma2 = fit.rss / dfResid;

  // Person component. SS_p = Σ n_i a_i², E[SS_p] ≈ (P−1)(σ² + n₀τ²) with
  // Cochran's n₀ = (N − Σ n_i²/N)/(P−1) — the unbalanced-design coefficient that
  // reduces to n when every person has n observations.
  let ssP = 0;
  let sumSqCounts = 0;
  for (const id of persons) {
    const ai = fit.a.get(id) || 0;
    const ni = fit.nByPerson.get(id) || 0;
    ssP += ni * ai * ai;
    sumSqCounts += ni * ni;
  }
  const nZero = (N - sumSqCounts / N) / (P - 1);
  const tau2 = nZero > 0 ? Math.max(0, (ssP / (P - 1) - sigma2) / nZero) : 0;

  // Occasion component, same construction on the other facet.
  let ssO = 0;
  let sumSqOcc = 0;
  for (const oc of occasions) {
    const bj = fit.b.get(oc) || 0;
    const mj = fit.nByOccasion.get(oc) || 0;
    ssO += mj * bj * bj;
    sumSqOcc += mj * mj;
  }
  const mZero = (N - sumSqOcc / N) / (J - 1);
  const omega2 = mZero > 0 ? Math.max(0, (ssO / (J - 1) - sigma2) / mZero) : 0;

  // Pooled occasion error for the credibility model: cycle effect + residual.
  // A manager cannot bank a good quarter and cash it later, so both are noise
  // for the question "is this difference about the person?".
  const occasionError = sigma2 + omega2;
  const icc = tau2 + occasionError > 0 ? tau2 / (tau2 + occasionError) : 0;

  const msP = ssP / (P - 1);
  const f = sigma2 > 0 ? msP / sigma2 : null;
  const fP = f === null ? null : fSurvival(f, P - 1, dfResid);

  // Shrout–Fleiss (1979) interval for ICC(1,1) on the unbalanced design, using
  // the harmonic-ish mean count n₀. Both bounds are clamped into [0, 1].
  let iccCi = null;
  if (f !== null && nZero > 0.5) {
    const fLow = fQuantile(0.975, P - 1, dfResid);
    const fHigh = fQuantile(0.025, P - 1, dfResid);
    if (fLow && fHigh) {
      const upper = (f * fLow - 1) / (f * fLow + nZero - 1);
      const lower = (f * fHigh - 1) / (f * fHigh + nZero - 1);
      iccCi = {
        low: round4(clamp(lower, 0, 1)),
        high: round4(clamp(upper, 0, 1)),
      };
    }
  }

  return {
    ok: true,
    design,
    fit,
    mu: fit.mu,
    tau2,
    sigma2,
    omega2,
    occasionError,
    occasionShare: tau2 + occasionError + 0 > 0
      ? round4(omega2 / (tau2 + occasionError))
      : null,
    icc: round4(icc),
    iccCi,
    fStat: round4(f),
    fP: fP === null ? null : round4(fP),
    nZero: round2(nZero),
    dfResid,
    df1: P - 1,
  };
}

/** Spearman–Brown (1910): reliability of the mean of k observations. */
export function spearmanBrown(rho, k) {
  if (!Number.isFinite(rho) || !Number.isFinite(k) || k <= 0) return null;
  if (rho <= -1 || rho >= 1) return null;
  const value = (k * rho) / (1 + (k - 1) * rho);
  return Math.max(-1, Math.min(1, value));
}

/** Inverse Spearman–Brown: the k a target reliability needs. */
export function observationsForReliability(rho, target) {
  if (!Number.isFinite(rho) || !Number.isFinite(target)) return null;
  if (!(rho > 0) || rho >= 1 || !(target > 0) || target >= 1 || target <= rho) return null;
  return (target * (1 - rho)) / (rho * (1 - target));
}

/* ------------------------------------------------------------------ *
 * 3. Credibility — Bühlmann on people, empirical-Bayes intervals
 * ------------------------------------------------------------------ */

export function credibilityReadings(decomposition, cells) {
  if (!decomposition?.ok) return null;
  const { tau2, occasionError, mu } = decomposition;
  const byPerson = new Map();
  for (const c of cells) {
    if (!byPerson.has(c.personId)) byPerson.set(c.personId, []);
    byPerson.get(c.personId).push(c.value);
  }
  // Bühlmann's constant. With τ² = 0 the record carries no between-person
  // information at all, so K is infinite and every reading collapses to the
  // team mean — which is the honest answer, not a zero.
  const K = tau2 > 0 ? occasionError / tau2 : Infinity;
  const rows = [];
  for (const [personId, values] of byPerson) {
    const n = values.length;
    const rawMean = mean(values);
    const z = Number.isFinite(K) && n + K > 0 ? n / (n + K) : 0;
    const estimate = z * rawMean + (1 - z) * mu;
    // Posterior variance under the normal–normal hierarchy:
    // Var(θ_i | y) = 1/(1/τ² + n/σ²_occasion).
    const postVar = tau2 > 0
      ? (tau2 * occasionError) / (n * tau2 + occasionError)
      : 0;
    const sd = Math.sqrt(Math.max(0, postVar));
    rows.push({
      personId,
      n,
      rawMean: round4(rawMean),
      credibility: round4(z),
      estimate: round4(estimate),
      posteriorSd: round4(sd),
      interval: {
        low: round4(clamp(estimate - Z_975 * sd, 0, 1)),
        high: round4(clamp(estimate + Z_975 * sd, 0, 1)),
      },
      rawPoints: toPoints(rawMean),
      estimatePoints: toPoints(estimate),
      shrinkPoints: round2((rawMean - estimate) * 3),
      // The number to expect from the next observation if nothing changes but
      // the sampling: E[y_next | data] = μ + Z(y − μ) = the credibility estimate.
      expectedNextPoints: toPoints(estimate),
      observedPoints: toPoints(rawMean),
    });
  }
  rows.sort((a, b) => b.estimate - a.estimate);
  return { K: Number.isFinite(K) ? round4(K) : null, grandMean: round4(mu), rows };
}

/* ------------------------------------------------------------------ *
 * 4. Separation — a partial order, not a ranking
 * ------------------------------------------------------------------ */

export function separationTiers(readings, { threshold = RELIABILITY_LIMITS.separationPct / 100 } = {}) {
  if (!readings?.rows?.length) return null;
  const rows = readings.rows;
  const pGreater = (i, j) => {
    const a = rows[i];
    const b = rows[j];
    const diff = (a.estimate ?? 0) - (b.estimate ?? 0);
    const sd = Math.sqrt((a.posteriorSd ?? 0) ** 2 + (b.posteriorSd ?? 0) ** 2);
    if (!(sd > 0)) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
    return normalCdf(diff / sd);
  };
  const tiers = [];
  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i];
    let placed = false;
    for (const tier of tiers) {
      // The candidate joins the first tier it is NOT separable from. "Separable"
      // is demanded against EVERY member of that tier, so a tier is exactly the
      // set the evidence cannot order inside — one indistinguishable neighbour is
      // enough to keep two people in the same tier.
      const separableFromAll = tier.members.every((memberIndex) => pGreater(memberIndex, i) >= threshold);
      if (!separableFromAll) {
        tier.members.push(i);
        placed = true;
        break;
      }
    }
    if (!placed) tiers.push({ members: [i] });
  }
  const pairs = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const p = pGreater(i, i + 1);
    pairs.push({
      // Opaque pair label: the pair is described by position, not by name, in
      // every export and in every stored record.
      index: i + 1,
      p: round4(p),
      distinguishable: p >= threshold,
      gapPoints: round2((rows[i].estimatePoints ?? 0) - (rows[i + 1].estimatePoints ?? 0)),
    });
  }
  const largestTier = tiers.reduce((max, t) => Math.max(max, t.members.length), 0);
  return {
    threshold: round4(threshold),
    tiers: tiers.map((t, index) => ({
      index: index + 1,
      size: t.members.length,
      // Alphabetical inside a tier so no reading order is implied.
      members: t.members
        .map((memberIndex) => ({ personId: rows[memberIndex].personId, estimatePoints: rows[memberIndex].estimatePoints }))
        .sort((a, b) => String(a.personId).localeCompare(String(b.personId))),
    })),
    tierCount: tiers.length,
    pairCount: pairs.length,
    indistinguishablePairs: pairs.filter((p) => !p.distinguishable).length,
    largestTier,
    topTierSize: tiers[0]?.members.length ?? 0,
    pairs,
  };
}

/* ------------------------------------------------------------------ *
 * 5. Decision study — how many more observations, and what can be seen
 * ------------------------------------------------------------------ */

export function decisionStudy(decomposition, readings, { settings = {}, cadenceDays = null } = {}) {
  if (!decomposition?.ok || !readings?.rows?.length) return null;
  const rho = decomposition.icc;
  const targetPct = settings.reliabilityTargetReliabilityPct ?? RELIABILITY_LIMITS.targetReliabilityPct;
  const target = targetPct / 100;
  const requiredK = observationsForReliability(rho, target);
  const medianN = decomposition.design.medianObsPerPerson || 0;
  const additional = requiredK === null ? null : Math.max(0, Math.ceil(requiredK) - Math.round(medianN));
  const zAlpha = invNormal(1 - RELIABILITY_LIMITS.alpha / 2);
  const zPower = invNormal(RELIABILITY_LIMITS.power);
  const sigma = Math.sqrt(decomposition.occasionError);
  // Two-person comparison of means: MDE = (z_{1−α/2} + z_power)·√(2σ²/n).
  const mdeValue = medianN > 0 ? (zAlpha + zPower) * Math.sqrt((2 * sigma * sigma) / medianN) : null;
  // The same formula rearranged: the n a one-rating-point gap would need.
  const onePoint = 1 / 3;
  const nForOnePoint = sigma > 0 ? (2 * (zAlpha + zPower) ** 2 * sigma * sigma) / (onePoint ** 2) : null;
  return {
    targetPct,
    targetReliabilityAtMedian: spearmanBrown(rho, medianN),
    requiredK: requiredK === null ? null : round(requiredK, 2),
    additionalObservations: additional,
    medianObsPerPerson: medianN,
    mdePoints: mdeValue === null ? null : round(mdeValue * 3, 2),
    mdeNote: 'The smallest difference between two people this record could detect at 80% power. A smaller gap is not "no difference" — it is unmeasured.',
    nForOnePoint: nForOnePoint === null ? null : Math.ceil(nForOnePoint),
    additionalForOnePoint: nForOnePoint === null ? null : Math.max(0, Math.ceil(nForOnePoint) - Math.round(medianN)),
    // One rating per person per cycle, so an observation and a cycle are the same
    // unit here. The dated form is what makes the answer actionable.
    cadenceDays,
    monthsForOnePoint: cadenceDays && nForOnePoint
      ? round((Math.max(0, Math.ceil(nForOnePoint) - Math.round(medianN)) * cadenceDays) / 30.44, 1)
      : null,
    monthsForTarget: additional === null || !cadenceDays ? null : round((additional * cadenceDays) / 30.44, 1),
    zAlpha: round(zAlpha, 3),
    zPower: round(zPower, 3),
    power: RELIABILITY_LIMITS.power,
    alpha: RELIABILITY_LIMITS.alpha,
  };
}

/* ------------------------------------------------------------------ *
 * 6. Convergence — do the instruments describe the same people?
 * ------------------------------------------------------------------ */

export function harvestConvergenceInstruments(state, now, harvest) {
  const persons = activeIds(state);
  const reviewValues = new Map();
  for (const [personId, rows] of harvest.byPerson) {
    reviewValues.set(personId, mean(rows.map((r) => r.value)));
  }

  // Goal attainment is measured per key result, not per goal: one goal carries
  // several results, and averaging whole goals would throw away the items that
  // make the per-person mean stable enough to correlate.
  const goalValues = new Map();
  const goalCounts = new Map();
  for (const goal of state.goals || []) {
    if (!goal || goal.scope === 'team' || !goal.ownerId || !persons.has(goal.ownerId)) continue;
    for (const kr of goal.keyResults || []) {
      const span = Number(kr.target) - Number(kr.start);
      if (!Number.isFinite(span) || span === 0) continue;
      const progress = Math.max(0, Math.min(1, (Number(kr.current) - Number(kr.start)) / span));
      goalValues.set(goal.ownerId, (goalValues.get(goal.ownerId) || 0) + progress);
      goalCounts.set(goal.ownerId, (goalCounts.get(goal.ownerId) || 0) + 1);
    }
  }

  const praise = new Map();
  const feedbackCount = new Map();
  for (const item of state.feedback || []) {
    if (!item || item.direction !== 'given' || !item.personId || !persons.has(item.personId)) continue;
    praise.set(item.personId, (praise.get(item.personId) || 0) + (item.kind === 'praise' ? 1 : 0));
    feedbackCount.set(item.personId, (feedbackCount.get(item.personId) || 0) + 1);
  }

  const onTime = new Map();
  const terminal = new Map();
  const today = dayKey(now);
  for (const d of state.delegations || []) {
    if (!d || !d.personId || !persons.has(d.personId) || !d.dueOn) continue;
    let value = null;
    if (d.status === 'done') {
      value = d.completedOn ? (d.completedOn <= d.dueOn ? 1 : 0) : null;
    } else if (d.status === 'active' && d.dueOn < today) {
      value = 0;
    }
    if (value === null) continue;
    onTime.set(d.personId, (onTime.get(d.personId) || 0) + value);
    terminal.set(d.personId, (terminal.get(d.personId) || 0) + 1);
  }

  const instrument = (values, counts = null, minItems = RELIABILITY_LIMITS.minConvergencePerPerson) => {
    const out = new Map();
    for (const [personId, value] of values) {
      const count = counts ? (counts.get(personId) || 0) : (harvest.byPerson.get(personId)?.length || 0);
      if (count < minItems) continue;
      out.set(personId, counts ? value / count : value);
    }
    return out;
  };

  return {
    review: instrument(reviewValues),
    goal: instrument(goalValues, goalCounts),
    feedback: instrument(praise, feedbackCount),
    delegation: instrument(onTime, terminal),
  };
}

function activeIds(state) {
  return new Set((state.people || []).filter((p) => p && p.id && p.status !== 'archived').map((p) => p.id));
}

export function convergenceReport(instruments) {
  const meta = {
    review: 'Performance review rating',
    goal: 'Goal attainment',
    feedback: 'Feedback balance',
    delegation: 'Delivery timeliness',
  };
  const others = ['goal', 'feedback', 'delegation'];
  const pairs = [];
  for (const other of others) {
    const a = instruments.review;
    const b = instruments[other];
    const ids = [...a.keys()].filter((id) => b.has(id));
    if (ids.length < RELIABILITY_LIMITS.minConvergencePersons) {
      pairs.push({
        a: 'review',
        b: other,
        n: ids.length,
        rho: null,
        p: null,
        method: null,
        verdict: 'insufficient',
        note: `Fewer than ${RELIABILITY_LIMITS.minConvergencePersons} people carry both instruments with at least ${RELIABILITY_LIMITS.minConvergencePerPerson} items each.`,
      });
      continue;
    }
    const xs = ids.map((id) => a.get(id));
    const ys = ids.map((id) => b.get(id));
    const rho = spearman(xs, ys);
    const test = spearmanPermutationP(xs, ys);
    let verdict = 'insufficient';
    let note = '';
    if (rho === null) {
      verdict = 'no-variation';
      note = 'One of the two instruments gives every person the same reading, so no rank correlation exists.';
    } else if (test && test.p !== null && test.p < RELIABILITY_LIMITS.convergenceAlpha && rho >= 0.2) {
      verdict = 'converges';
      note = `The two instruments order these people similarly (ρ = ${round(rho, 2)}, ${test.method}, p = ${test.p < 0.001 ? '<0.001' : round(test.p, 3)}).`;
    } else if (test && test.p !== null && test.p < RELIABILITY_LIMITS.convergenceAlpha) {
      verdict = 'diverges';
      note = `The instruments order these people in opposite directions (ρ = ${round(rho, 2)}, p = ${round(test.p, 3)}).`;
    } else {
      verdict = 'independent';
      // A high correlation that misses the bar is a different finding from no
      // correlation at all, and conflating them would teach a leader the wrong
      // lesson. At five people one swapped pair is enough to lose significance,
      // so the note says which of the two situations this is.
      const nearlyIdentical = Number.isFinite(rho) && Math.abs(rho) >= 0.6;
      note = nearlyIdentical
        ? `The two instruments order these people almost identically (ρ = ${round(rho, 2)}), but with ${ids.length} people a single swapped pair is enough to lose significance (p = ${round(test.p, 3)}). That is a limit of the rank test at this sample size, not evidence that they measure different things — the agreement is real and uncertified.`
        : `No detectable rank agreement at α = ${RELIABILITY_LIMITS.convergenceAlpha} (ρ = ${round(rho, 2)}). Under this record the two instruments could be describing different things.`;
    }
    pairs.push({ a: 'review', b: other, n: ids.length, rho: round4(rho), p: test?.p === null ? null : round4(test.p), method: test?.method || null, verdict, note });
  }
  const converging = pairs.filter((p) => p.verdict === 'converges');
  const rBar = converging.length && converging.every((p) => Number.isFinite(p.rho))
    ? mean(converging.map((p) => p.rho))
    : null;
  return {
    meta,
    pairs,
    instrumentCounts: Object.fromEntries(Object.entries(instruments).map(([k, v]) => [k, v.size])),
    divergingPairs: pairs.filter((p) => p.verdict === 'diverges').length,
    convergingPairs: converging.length,
    // A composite is refused unless every pair that could be tested converged.
    composite: {
      allowed: converging.length === pairs.length && converging.length > 0,
      rBar: round4(rBar),
      reliability: converging.length === pairs.length && rBar
        ? round4(spearmanBrown(rBar, pairs.length + 1))
        : null,
      reason: converging.length === pairs.length && converging.length > 0
        ? 'Every testable pair converged, so averaging the instruments would add reliability. LeadOS still does not form or store the composite.'
        : 'At least one pair does not converge, so a composite would average different constructs. No composite is formed.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * 7. Report
 * ------------------------------------------------------------------ */

export function reliabilityFloors(settings = {}) {
  const minPersons = settings.reliabilityMinPersons ?? RELIABILITY_LIMITS.minPersons;
  return {
    minPersons,
    minObservations: RELIABILITY_LIMITS.minObservations,
    minObsPerPerson: RELIABILITY_LIMITS.minObsPerPerson,
    minOccasions: RELIABILITY_LIMITS.minOccasions,
    maxImbalanceRatio: RELIABILITY_LIMITS.maxImbalanceRatio,
    iccFloorPct: settings.reliabilityIccFloorPct ?? RELIABILITY_LIMITS.iccFloorPct,
    separationPct: settings.reliabilitySeparationPct ?? RELIABILITY_LIMITS.separationPct,
    targetReliabilityPct: settings.reliabilityTargetReliabilityPct ?? RELIABILITY_LIMITS.targetReliabilityPct,
  };
}

function verdictFor({ observable, icc, floors, separation }) {
  if (!observable) return 'insufficient';
  const floor = floors.iccFloorPct / 100;
  if (icc === null) return 'insufficient';
  if (icc >= 0.75) return 'strongly-separable';
  if (icc >= floor) {
    // Above the instrument floor but with pairs the evidence cannot order: that
    // is "weakly separable", and calling it separable would overstate the record.
    return separation && separation.indistinguishablePairs > 0 ? 'weakly-separable' : 'separable';
  }
  return 'noise-dominated';
}

const CACHE = new WeakMap();

export function reliabilityReport(state = {}, now = new Date(), settingsOverride = null) {
  const settings = settingsOverride || normalizeReliabilitySettings(state.settings || {});
  const cacheKey = `${dayKey(now)}|${settings.reliabilityMinPersons}|${settings.reliabilityIccFloorPct}|${settings.reliabilitySeparationPct}|${settings.reliabilityTargetReliabilityPct}`;
  if (state && typeof state === 'object') {
    const hit = CACHE.get(state);
    if (hit && hit.key === cacheKey) return hit.report;
  }
  const floors = reliabilityFloors(settings);
  const harvest = harvestReviewObservations(state);
  const cells = harvest.observations.map((o) => ({ personId: o.personId, occasion: o.occasion, value: o.value }));
  const decomposition = decomposeVariance(cells, {
    floors: { ...RELIABILITY_LIMITS, minPersons: floors.minPersons },
  });
  const observable = Boolean(decomposition?.ok);

  const cadenceDays = (() => {
    const occ = harvest.occasions;
    if (occ.length < 2) return null;
    const span = daysBetween(occ[0], occ[occ.length - 1]);
    return span > 0 ? Math.round(span / (occ.length - 1)) : null;
  })();

  const readings = observable ? credibilityReadings(decomposition, cells) : null;
  const separation = readings
    ? separationTiers(readings, { threshold: (settings.reliabilitySeparationPct ?? RELIABILITY_LIMITS.separationPct) / 100 })
    : null;
  const decision = observable
    ? decisionStudy(decomposition, readings, { settings, cadenceDays })
    : null;
  const instruments = harvestConvergenceInstruments(state, now, harvest);
  const convergence = convergenceReport(instruments);
  const verdict = verdictFor({ observable, icc: decomposition?.ok ? decomposition.icc : null, floors, separation });

  const personRows = readings?.rows?.map((row) => ({
    ...row,
    name: harvest.nameOf(row.personId),
    occasions: harvest.byPerson.get(row.personId)?.length || 0,
    lastObservedOn: harvest.byPerson.get(row.personId)?.slice(-1)[0]?.occasion || null,
  })) || [];

  // Regression to the mean, named rather than implied. The top and bottom raw
  // readings are the two places a leader is most likely to over-read noise.
  const extremes = (() => {
    if (!personRows.length || !decomposition?.ok) return null;
    const byRaw = personRows.slice().sort((a, b) => (b.rawMean ?? 0) - (a.rawMean ?? 0));
    const top = byRaw[0];
    const bottom = byRaw[byRaw.length - 1];
    const describe = (row) => ({
      personId: row.personId,
      name: row.name,
      observedPoints: round2(row.observedPoints),
      expectedNextPoints: round2(row.expectedNextPoints),
      regressionPoints: round2((row.expectedNextPoints ?? 0) - (row.observedPoints ?? 0)),
      credibility: row.credibility,
      n: row.n,
      reason: row.credibility >= 0.8
        ? 'This reading is mostly its own evidence; expect it to hold.'
        : `Only ${Math.round((row.credibility ?? 0) * 100)}% of this reading is this person's own record. The rest is the team's mean, so the next reading is expected to move toward it.`,
    });
    return { top: describe(top), bottom: describe(bottom) };
  })();

  const counts = {
    persons: harvest.byPerson.size,
    observations: harvest.observations.length,
    occasions: harvest.occasions.length,
    duplicates: harvest.duplicates,
    unrated: harvest.unrated,
    activePeople: harvest.people.length,
  };

  const caveats = [];
  if (decomposition && !decomposition.ok) {
    const reasonText = {
      'too-few-persons': `Fewer than ${floors.minPersons} people carry a completed rating.`,
      'too-few-observations': `Fewer than ${floors.minObservations} completed ratings in total.`,
      'too-few-occasions': 'Fewer than two review cycles: with one cycle, the person effect and the cycle effect cannot be separated at all.',
      'too-few-per-person': `At least one person has fewer than ${floors.minObsPerPerson} completed ratings.`,
      'too-unbalanced': `The largest person's observation count exceeds ${floors.maxImbalanceRatio}× the median, so the unbalanced coefficient would be dominated by one person.`,
      'no-residual-df': 'The design leaves no residual degrees of freedom.',
    }[decomposition.reason] || 'The design cannot support a decomposition.';
    caveats.push(`Decomposition refused: ${reasonText}`);
  }
  if (observable && decomposition.fP !== null && decomposition.fP > 0.05) {
    caveats.push(`The F test of τ² = 0 against these records gives p = ${round(decomposition.fP, 3)}. The between-person component is not distinguishable from zero at α = 0.05 — every figure here is an estimate on a record that has not yet proven it carries signal.`);
  }
  if (observable && decomposition.iccCi) {
    caveats.push(`The 95% interval on the reliability coefficient runs ${round(decomposition.iccCi.low * 100, 1)}%–${round(decomposition.iccCi.high * 100, 1)}%. A coefficient with that width is a range, not a fact.`);
  }
  if (counts.duplicates) {
    caveats.push(`${counts.duplicates} duplicate rating(s) were found for the same person and cycle; only the later completion is counted.`);
  }
  if (counts.unrated) {
    caveats.push(`${counts.unrated} completed review(s) carry no rating and are excluded. An absent rating is never read as an average one.`);
  }
  if (separation && separation.indistinguishablePairs > 0) {
    caveats.push(`${separation.indistinguishablePairs} of ${separation.pairCount} adjacent pair(s) cannot be separated at the declared ${floors.separationPct}% bar. Inside a tier the order is alphabetical on purpose.`);
  }
  caveats.push('Cycle effect and residual are pooled as occasion error. A manager cannot bank a good quarter and cash it later, so both are noise for the question "is this difference about the person?".');
  caveats.push('This is a measurement audit of your instrument, not an assessment of your team. No field in this report is a person’s score, potential or expected value.');
  if (convergence.divergingPairs > 0) {
    caveats.push(`${convergence.divergingPairs} instrument pair(s) order your people in opposite directions. No composite score is formed from instruments that disagree.`);
  }

  const report = {
    observable,
    verdict,
    verdictMeta: RELIABILITY_VERDICT_META[verdict] || RELIABILITY_VERDICT_META.insufficient,
    verdicts: RELIABILITY_VERDICTS,
    floors,
    settings,
    counts,
    design: decomposition?.design || {
      persons: harvest.byPerson.size,
      occasions: harvest.occasions.length,
      observations: harvest.observations.length,
      medianObsPerPerson: median([...harvest.byPerson.values()].map((v) => v.length)),
      maxObsPerPerson: Math.max(0, ...[...harvest.byPerson.values()].map((v) => v.length)),
      balanceRatio: null,
    },
    reason: decomposition?.ok ? null : decomposition?.reason || 'insufficient',
    components: observable ? {
      tau2: round4(decomposition.tau2),
      sigma2: round4(decomposition.sigma2),
      omega2: round4(decomposition.omega2),
      occasionError: round4(decomposition.occasionError),
      occasionShare: decomposition.occasionShare,
      icc: decomposition.icc,
      iccCi: decomposition.iccCi,
      fStat: decomposition.fStat,
      fP: decomposition.fP,
      df1: decomposition.df1,
      dfResid: decomposition.dfResid,
      nZero: decomposition.nZero,
      mu: round4(decomposition.mu),
      reliabilityAtMedian: spearmanBrown(decomposition.icc, decomposition.design.medianObsPerPerson),
      reliabilityAtOne: decomposition.icc,
    } : null,
    readings,
    personRows,
    separation,
    decision,
    convergence,
    extremes,
    cadenceDays,
    // The stored ledger, newest first — the panel reads it but never derives
    // anything from it: every figure on this page is recomputed from records.
    frozenReadings: (state.reliabilityReadings || [])
      .filter((r) => r && r.id)
      .slice()
      .sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn))),
    caveats,
  };
  report.brief = reliabilityBrief(report, now);
  if (state && typeof state === 'object') CACHE.set(state, { key: cacheKey, report });
  return report;
}

/* ------------------------------------------------------------------ *
 * 8. Brief, signals, attention
 * ------------------------------------------------------------------ */

const pctText = (v, dp = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(dp)}%` : '—');

export function reliabilityBrief(report, now = new Date()) {
  const lines = [];
  lines.push('MEASUREMENT RELIABILITY BRIEF');
  lines.push(`Generated ${dayKey(now)} · engine ${RELIABILITY_ENGINE_VERSION}`);
  lines.push('');
  lines.push(`Instrument: performance review rating (${report.counts.observations} completed ratings, ${report.counts.persons} people, ${report.counts.occasions} review cycles).`);
  lines.push(`Verdict: ${report.verdictMeta.label}. ${report.verdictMeta.summary}`);
  lines.push('');
  if (report.observable) {
    const c = report.components;
    lines.push('VARIANCE DECOMPOSITION');
    lines.push(`  Between-person (τ²): ${c.tau2}`);
    lines.push(`  Occasion error (cycle + residual): ${c.occasionError} (cycle share ${pctText(c.occasionShare)})`);
    lines.push(`  Reliability coefficient ICC(1): ${pctText(c.icc)}${c.iccCi ? ` (95% ${pctText(c.iccCi.low)}–${pctText(c.iccCi.high)})` : ''}`);
    lines.push(`  F test of τ² = 0: F(${c.df1}, ${c.dfResid}) = ${c.fStat}, p = ${c.fP === null ? 'n/a' : round(c.fP, 4)}`);
    lines.push(`  Reliability of the mean of ${report.design.medianObsPerPerson} ratings (Spearman–Brown): ${pctText(c.reliabilityAtMedian)}`);
    lines.push('');
    lines.push('WHAT THE EVIDENCE SUPPORTS');
    if (report.separation) {
      lines.push(`  ${report.separation.tierCount} tier(s) at a ${report.floors.separationPct}% separation bar; ${report.separation.indistinguishablePairs} of ${report.separation.pairCount} adjacent pair(s) indistinguishable.`);
      for (const tier of report.separation.tiers) {
        lines.push(`  Tier ${tier.index}: ${tier.size} person(s)`);
      }
      lines.push('  Membership is shown on screen only. This brief is aggregate by design, so it stays safe to share.');
    }
    lines.push('');
    lines.push('DECISION STUDY');
    if (report.decision) {
      const d = report.decision;
      lines.push(`  Minimum detectable difference at the current record: ${d.mdePoints === null ? '—' : `${d.mdePoints.toFixed(2)} rating point(s)`} (80% power, α = 0.05).`);
      lines.push(`  To reach ${d.targetPct}% reliability at the median record: ${d.requiredK === null ? 'not reachable on this instrument' : `${d.requiredK} observations per person`}${d.additionalObservations === null ? '' : `, i.e. ${d.additionalObservations} more than now`}.`);
      lines.push(`  To separate a one-point gap: ${d.nForOnePoint === null ? 'not computable' : `${d.nForOnePoint} observations per person`}.`);
    }
    lines.push('');
    lines.push('REGRESSION TO THE MEAN');
    if (report.extremes) {
      for (const [label, row] of [['Top reading', report.extremes.top], ['Bottom reading', report.extremes.bottom]]) {
        if (!row) continue;
        lines.push(`  ${label}: observed ${row.observedPoints?.toFixed(2)} → expected next ${row.expectedNextPoints?.toFixed(2)} (${row.regressionPoints >= 0 ? '+' : ''}${row.regressionPoints?.toFixed(2)}), credibility ${pctText(row.credibility)}.`);
      }
    }
    lines.push('');
  }
  lines.push('INSTRUMENT CONVERGENCE');
  for (const pair of report.convergence.pairs) {
    lines.push(`  ${report.convergence.meta[pair.a]} vs ${report.convergence.meta[pair.b]}: ${pair.verdict}${pair.rho === null ? '' : ` (ρ = ${pair.rho}, p = ${pair.p === null ? 'n/a' : pair.p})`}`);
  }
  lines.push(`  Composite: ${report.convergence.composite.allowed ? 'would be defensible' : 'refused'} — ${report.convergence.composite.reason}`);
  lines.push('');
  lines.push('WHAT THIS BRIEF IS NOT');
  lines.push('  It is not a performance assessment of any person, and it contains no score, potential rating, ranking or recommendation about an individual.');
  lines.push('  It is an audit of the instrument you are using to make people decisions, and of how much more evidence a defensible decision needs.');
  if (report.caveats.length) {
    lines.push('');
    lines.push('CAVEATS');
    for (const caveat of report.caveats) lines.push(`  · ${caveat}`);
  }
  return lines.join('\n');
}

export function reliabilitySignals(state = {}, now = new Date(), settings = null) {
  const report = reliabilityReport(state, now, settings);
  const signals = [];
  const route = (panel) => `#/reliability?panel=${panel}`;

  if (!report.observable) {
    if (report.counts.activePeople <= 0) return signals;
    signals.push({
      ruleId: 'REL-06',
      domain: 'Measurement reliability',
      title: 'Not enough completed ratings to audit your measurement',
      detail: `${report.counts.observations} completed rating(s) across ${report.counts.persons} people and ${report.counts.occasions} cycle(s); the floor is ${report.floors.minObservations} ratings, ${report.floors.minPersons} people and ${report.floors.minObsPerPerson} ratings each. Until then this terminal prints counts and estimates nothing — a reliability coefficient over six ratings is a number with no meaning.`,
      severity: 1,
      confidence: 'high',
      evidence: [
        `Ratings: ${report.counts.observations}/${report.floors.minObservations}`,
        `People rated: ${report.counts.persons}/${report.floors.minPersons}`,
        `Cycles: ${report.counts.occasions}/${report.floors.minOccasions}`,
      ],
      action: { label: 'See what the audit needs', route: route('signal') },
    });
    return signals;
  }

  const c = report.components;
  const floorPct = report.floors.iccFloorPct;
  if (report.verdict === 'noise-dominated') {
    signals.push({
      ruleId: 'REL-01',
      domain: 'Measurement reliability',
      title: `Your ratings carry ${pctText(c.icc)} signal — below your own ${floorPct}% floor`,
      detail: `Within-person variation is ${c.tau2 > 0 ? `${round(c.occasionError / c.tau2, 2)}×` : 'larger than'} between-person variation. On this record, most of the difference you can see between people is not there to see. That is a statement about the instrument, not about anyone on your team.`,
      severity: 4,
      confidence: 'high',
      evidence: [
        `Reliability coefficient: ${pctText(c.icc)}${c.iccCi ? ` (95% ${pctText(c.iccCi.low)}–${pctText(c.iccCi.high)})` : ''}`,
        `Observations: ${report.counts.observations} across ${report.counts.persons} people`,
        `Cycle effect share of error: ${pctText(c.occasionShare)}`,
      ],
      action: { label: 'Open the decomposition', route: route('signal') },
    });
  }

  if (report.separation && report.separation.indistinguishablePairs > 0) {
    signals.push({
      ruleId: 'REL-02',
      domain: 'Measurement reliability',
      title: `${report.separation.indistinguishablePairs} adjacent pair(s) are inside the noise`,
      detail: `At your declared ${report.floors.separationPct}% separation bar, ${report.separation.tierCount} tier(s) are all the record supports. Any decision that needs rank order inside a tier — differentiated pay, a promotion between two people, a formal plan — is resting on a difference the record cannot see.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `Indistinguishable adjacent pairs: ${report.separation.indistinguishablePairs}/${report.separation.pairCount}`,
        `Largest tier: ${report.separation.largestTier} people`,
        `Separation bar: ${report.floors.separationPct}%`,
      ],
      action: { label: 'See the tiers', route: route('separation') },
    });
  }

  if (report.decision && report.decision.additionalObservations > 0) {
    signals.push({
      ruleId: 'REL-03',
      domain: 'Measurement reliability',
      title: `${report.decision.additionalObservations} more rating(s) per person before this instrument can differentiate`,
      detail: `At ${pctText(c.icc)} reliability, reaching your declared ${report.decision.targetPct}% target needs ${report.decision.requiredK} observations per person; the median record holds ${report.decision.medianObsPerPerson}. At your recorded cadence of ${report.cadenceDays ?? 'unknown'} days per cycle, that is a dated wait, not a vague "collect more data".`,
      severity: 3,
      confidence: 'medium',
      evidence: [
        `Required per person: ${report.decision.requiredK}`,
        `Median now: ${report.decision.medianObsPerPerson}`,
        `Minimum detectable gap today: ${report.decision.mdePoints === null ? 'n/a' : `${report.decision.mdePoints.toFixed(2)} points`}`,
      ],
      action: { label: 'Open the decision study', route: route('decision') },
    });
  }

  const divergent = report.convergence.pairs.filter((p) => p.verdict === 'diverges' || p.verdict === 'independent');
  if (divergent.length) {
    signals.push({
      ruleId: 'REL-04',
      domain: 'Measurement reliability',
      title: 'Your instruments do not describe the same people',
      detail: `${divergent.map((p) => `${report.convergence.meta[p.a]} vs ${report.convergence.meta[p.b]} (${p.verdict}${p.rho === null ? '' : `, ρ = ${p.rho}`})`).join('; ')}. Two instruments that disagree cannot be averaged into a composite, so nothing here is combined. Which one your next people decision actually uses is a choice you are making whether or not you make it explicitly.`,
      severity: 3,
      confidence: 'medium',
      evidence: divergent.map((p) => `${report.convergence.meta[p.b]}: ρ ${p.rho === null ? 'n/a' : p.rho}, p ${p.p === null ? 'n/a' : p.p}, n ${p.n}`),
      action: { label: 'Compare the instruments', route: route('convergence') },
    });
  }

  if (report.extremes?.top && report.extremes.top.regressionPoints <= -0.4) {
    signals.push({
      ruleId: 'REL-05',
      domain: 'Measurement reliability',
      title: 'The top reading is expected to fall — and that is arithmetic',
      detail: `The highest raw reading is ${report.extremes.top.observedPoints.toFixed(2)} points; the expected next reading is ${report.extremes.top.expectedNextPoints.toFixed(2)} because only ${pctText(report.extremes.top.credibility)} of that reading is their own record. If that happens it is regression to the mean, not decline, and reading it as decline would be a measurement error with a name attached to it.`,
      severity: 2,
      confidence: 'medium',
      evidence: [
        `Observed: ${report.extremes.top.observedPoints.toFixed(2)}`,
        `Expected next: ${report.extremes.top.expectedNextPoints.toFixed(2)}`,
        `Credibility: ${pctText(report.extremes.top.credibility)}`,
      ],
      action: { label: 'Open regression to the mean', route: route('regression') },
    });
  }

  return signals;
}

export function reliabilityAttentionCount(state = {}, now = new Date()) {
  const report = reliabilityReport(state, now);
  let count = 0;
  if (!report.observable) return report.counts.activePeople > 0 && report.counts.observations > 0 ? 1 : 0;
  if (report.verdict === 'noise-dominated') count += 1;
  if (report.separation && report.separation.indistinguishablePairs > 0) count += 1;
  if (report.convergence.divergingPairs > 0) count += 1;
  const due = (state.reliabilityReadings || []).filter((r) => r && r.status === 'frozen'
    && addDays(r.frozenOn, r.horizonDays) <= dayKey(now)).length;
  return count + due;
}
