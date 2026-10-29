/**
 * app/core/domain/impact.js — pre-registered intervention evaluation.
 *
 * WHAT THIS IS
 * A leader runs an intervention (a coaching push, a delegation reset, a case
 * triage, a change programme). Six weeks later they believe it worked. Almost
 * every people-analytics product in existence will agree with them, because it
 * only ever plots the line going up.
 *
 * This module is the opposite instrument. It makes the leader write the
 * hypothesis down *before* the window closes, then scores the hypothesis
 * against the record with an explicit counterfactual, an explicit power
 * calculation, and an explicit refusal to call noise an effect.
 *
 * THE FOUR METHODS, NAMED
 *  1. Interrupted time series (segmented OLS, Wagner et al. 2002): level shift
 *     at the intervention plus a post-intervention slope change, with
 *     Newey–West HAC standard errors because weekly workspace series are
 *     autocorrelated and naive OLS errors are far too small.
 *  2. In-time placebo test: refit the identical specification on fake
 *     interruption dates inside the pre-period. If the estimator invents
 *     "effects" that are just as big when nothing happened, the real effect
 *     is not evidence of anything.
 *  3. Equal-weight standardised donor composite with in-space placebo
 *     (Abadie, Diamond & Hainmueller 2010 procedure; the donor weights are
 *     deliberately *not* fitted — see `syntheticControl`). This supplies the
 *     difference-in-differences counterfactual and a randomisation-inference
 *     p-value that does not rely on asymptotics.
 *  4. Minimum detectable effect from the pre-period residual variance. A study
 *     that could not have detected the effect the leader hoped for is reported
 *     as underpowered, not as a failure of the intervention.
 *
 * WHAT IT REFUSES TO DO
 *  - It never converts a failed pre-trend test into "parallel trends holds".
 *    Failing to reject is not evidence of absence, and the module says so in
 *    the report text (Roth et al. 2023; Rambachan & Roth 2023).
 *  - It never extrapolates a missing actual, imputes a null bucket, or treats
 *    an unmeasured week as a zero.
 *  - It never labels a result "causal". The strongest grade is "consistent
 *    with the hypothesis under a stated design", and a retrospective study is
 *    never counted as confirmatory.
 *
 * Pure module: no storage, no DOM, no clock.
 */

import { addDays, dayKey, daysBetween, mean, round, toDate } from '../time.js';
import {
  VITALS,
  VITAL_BY_ID,
  VITAL_MIN_POINTS,
  buildAnchoredGrid,
  buildVitalSeries,
  firstRecordDay,
  signedTowardHypothesis,
} from './vitals.js';
import { INTERVENTION_TYPES, INTERVENTION_BY_ID } from './interventionTypes.js';

export const IMPACT_ENGINE_VERSION = 'impact-1.0.0';

/* ------------------------------------------------------------------ vocabulary */

export const STUDY_STATUSES = ['running', 'scored', 'abandoned'];
export const STUDY_STATUS_LABELS = {
  running: 'Running',
  scored: 'Scored',
  abandoned: 'Abandoned',
};

/**
 * What kind of thing was intervened on. The id maps onto an existing LeadOS
 * collection so RULE-IMP-01 can open a typed graph link instead of inventing a
 * parallel taxonomy.
 */
export { INTERVENTION_TYPES, INTERVENTION_BY_ID };

export const VERDICTS = {
  unmeasurable: {
    label: 'Not measurable',
    tone: 'neutral',
    plain: 'The recorded dates cannot support an evaluation over this window.',
  },
  'pre-trend': {
    label: 'Inconclusive — trend already moving',
    tone: 'caution',
    plain: 'The metric was already trending before the intervention, so a before/after comparison cannot separate your intervention from that trend.',
  },
  underpowered: {
    label: 'Inconclusive — underpowered',
    tone: 'caution',
    plain: 'The record is too noisy to distinguish an effect of the size you expected from chance. This is not evidence the intervention failed.',
  },
  'not-supported': {
    label: 'Not supported',
    tone: 'bad',
    plain: 'The evidence is inconsistent with the pre-registered direction at a detectable effect size.',
  },
  inconclusive: {
    label: 'Inconclusive',
    tone: 'caution',
    plain: 'The estimate and the placebo tests disagree, or the evidence is too weak to prefer either answer.',
  },
  supported: {
    label: 'Consistent with the hypothesis',
    tone: 'good',
    plain: 'The post-period shift is in the pre-registered direction, larger than the noise floor, and survives the placebo tests. This supports the hypothesis; it is not proof of cause.',
  },
};

export const GRADES = {
  confirmatory: 'Pre-registered before the window closed',
  exploratory: 'Retrospective — hypothesis recorded after the intervention started',
};

/** Two-sided critical values. Tabulated, not approximated, so results are stable. */
export const Z_FOR_ALPHA = { 0.05: 1.959964, 0.1: 1.644854, 0.2: 1.281552 };
/** 80% power. */
export const Z_POWER = 0.841621;

export const IMPACT_MIN_PRE_BUCKETS = 4;
export const IMPACT_MIN_POST_BUCKETS = 2;
export const IMPACT_MIN_DONORS = 3;
export const PRE_TREND_ALPHA = 0.1;
/** A relative breakdown trend below this is treated as fragile evidence. */
export const FRAGILE_BREAKDOWN_PCT = 5;

/* ------------------------------------------------------------ tiny linear algebra */

function zeros(n, k) {
  return Array.from({ length: n }, () => new Array(k).fill(0));
}

/** In-place Gauss–Jordan inversion with partial pivoting. Returns null if singular. */
function invert(matrix) {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) { const tmp = a[pivot]; a[pivot] = a[col]; a[col] = tmp; }
    const div = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = a[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function matMul(A, B) {
  const n = A.length;
  const m = B[0].length;
  const mid = B.length;
  const out = zeros(n, m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let sum = 0;
      for (let q = 0; q < mid; q += 1) sum += A[i][q] * B[q][j];
      out[i][j] = sum;
    }
  }
  return out;
}

/**
 * Ordinary least squares plus a Newey–West (HAC) covariance matrix.
 *
 * The Bartlett kernel with bandwidth `L = ⌊4(n/100)^(2/9)⌋` is the Newey–West
 * (1994) automatic rule of thumb. It is used because weekly cadence metrics
 * are serially correlated: a positive week is more likely to be followed by
 * another, and treating the buckets as independent would shrink the standard
 * error and produce confident nonsense.
 */
export function olsWithHac(X, y) {
  const n = X.length;
  const k = X[0] ? X[0].length : 0;
  if (!n || !k || n <= k) return null;
  const xtx = zeros(k, k);
  const xty = new Array(k).fill(0);
  for (let t = 0; t < n; t += 1) {
    for (let i = 0; i < k; i += 1) {
      xty[i] += X[t][i] * y[t];
      for (let j = 0; j < k; j += 1) xtx[i][j] += X[t][i] * X[t][j];
    }
  }
  const xtxInv = invert(xtx.map((row) => [...row]));
  if (!xtxInv) return null;
  const beta = xtxInv.map((row) => row.reduce((acc, v, j) => acc + v * xty[j], 0));
  const residuals = y.map((value, t) => value - X[t].reduce((acc, v, j) => acc + v * beta[j], 0));
  const sse = residuals.reduce((acc, e) => acc + e * e, 0);
  const df = n - k;
  const sigma2 = df > 0 ? sse / df : 0;

  const lag = Math.max(0, Math.min(n - 1, Math.floor(4 * Math.pow(n / 100, 2 / 9))));
  const meat = zeros(k, k);
  for (let l = 0; l <= lag; l += 1) {
    const weight = l === 0 ? 1 : 1 - l / (lag + 1);
    for (let t = l; t < n; t += 1) {
      const a = X[t].map((v) => v * residuals[t]);
      const b = X[t - l].map((v) => v * residuals[t - l]);
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          meat[i][j] += weight * (a[i] * b[j] + (l === 0 ? 0 : b[i] * a[j]));
        }
      }
    }
  }
  const cov = matMul(matMul(xtxInv, meat), xtxInv);
  return {
    beta, residuals, n, k, df, sigma2, sse, lag,
    cov,
    se: cov.map((row, i) => Math.sqrt(Math.max(0, row[i]))),
  };
}

/* ------------------------------------------------------------- normal distribution */

/** Numerical Recipes `erfc` — |relative error| < 1.2e-7. */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans = t * Math.exp(
    -z * z - 1.26551223
    + t * (1.00002368
      + t * (0.37409196
        + t * (0.09678418
          + t * (-0.18628806
            + t * (0.27886807
              + t * (-1.13520398
                + t * (1.48851587
                  + t * (-0.82215223 + t * 0.17087277)))))))),
  );
  return x >= 0 ? ans : 2 - ans;
}

/** Two-sided p-value for a z statistic. */
export function twoSidedP(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.min(1, Math.max(0, erfc(Math.abs(z) / Math.SQRT2)));
}

function zFor(alpha) {
  const key = Object.keys(Z_FOR_ALPHA).map(Number).reduce(
    (best, candidate) => (Math.abs(candidate - alpha) < Math.abs(best - alpha) ? candidate : best),
    0.1,
  );
  return { z: Z_FOR_ALPHA[key], used: key };
}

/* -------------------------------------------------- interrupted time series */

/**
 * Segmented regression on a contiguous numeric series.
 *
 *   y_t = b0 + b1·u_t + b2·post_t + b3·u_t·post_t + e_t,   u_t = t − T
 *
 * `u` is centred on the interruption so `b2` is the level shift *at* T and is
 * well-conditioned even with a short pre-period. `b3` is the change in slope
 * after T — the difference between a one-off jolt and a new trajectory, which
 * is exactly the distinction a leader needs and a before/after average cannot
 * express.
 */
export function interruptedTimeSeries(values, treatmentIndex, { alpha = 0.1 } = {}) {
  const raw = Array.isArray(values) ? values : [];
  const n = raw.length;
  const T = Math.round(Number(treatmentIndex));
  if (!n || !Number.isFinite(T)) return { ok: false, reason: 'No series to fit.' };

  /**
   * Unevenly spaced observations are not missing data.
   *
   * A bucket in which nobody held a 1:1 has no mood score; that does not mean
   * the mood was zero, and it does not disqualify the study either. The
   * regression is fitted on the periods that were observed, using each period's
   * true position on the time axis, which is exactly how an unbalanced panel is
   * handled in econometrics. What is refused is *substitution* — inventing a
   * point — not estimation on incomplete coverage.
   */
  const rows = [];
  for (let t = 0; t < n; t += 1) {
    const value = raw[t];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    rows.push({ t, value, u: t - T, post: t >= T ? 1 : 0 });
  }
  const nPre = rows.filter((r) => r.post === 0).length;
  const nPost = rows.filter((r) => r.post === 1).length;
  const gaps = n - rows.length;
  if (nPre < IMPACT_MIN_PRE_BUCKETS - 1 || nPost < IMPACT_MIN_POST_BUCKETS) {
    return {
      ok: false,
      n, nPre, nPost, gaps,
      reason: `A segmented regression needs at least ${IMPACT_MIN_PRE_BUCKETS - 1} observed pre and ${IMPACT_MIN_POST_BUCKETS} observed post periods; this window has ${nPre} and ${nPost}.`,
    };
  }
  const X = rows.map((r) => [1, r.u, r.post, r.u * r.post]);
  const y = rows.map((r) => r.value);
  const fit = olsWithHac(X, y);
  if (!fit) return { ok: false, n, nPre, nPost, gaps, reason: 'The design matrix is singular — the series has no variation to fit.' };

  const [b0, b1, b2, b3] = fit.beta;
  const [, , se2, se3] = fit.se;
  const tLevel = se2 > 0 ? b2 / se2 : 0;
  const tSlope = se3 > 0 ? b3 / se3 : 0;
  const { z } = zFor(alpha);
  // Minimum detectable effect at the requested alpha and 80% power.
  const mde = (z + Z_POWER) * se2;
  const preMean = mean(rows.filter((r) => r.post === 0).map((r) => r.value));
  const postMean = mean(rows.filter((r) => r.post === 1).map((r) => r.value));
  return {
    ok: true,
    n, nObserved: rows.length, gaps, nPre, nPost,
    treatmentIndex: T,
    intercept: round(b0, 4),
    preSlope: round(b1, 4),
    levelShift: round(b2, 4),
    slopeChange: round(b3, 4),
    seLevel: round(se2, 4),
    seSlope: round(se3, 4),
    tLevel: round(tLevel, 3),
    tSlope: round(tSlope, 3),
    pLevel: round(twoSidedP(tLevel), 4),
    pSlope: round(twoSidedP(tSlope), 4),
    mde: round(mde, 4),
    preMean: preMean === null ? null : round(preMean, 4),
    postMean: postMean === null ? null : round(postMean, 4),
    sigma2: round(fit.sigma2, 6),
    sigma: round(Math.sqrt(Math.max(0, fit.sigma2)), 4),
    hacLag: fit.lag,
    alpha,
    zUsed: z,
  };
}

/**
 * Is the pre-period already trending?
 *
 * Returns the fitted pre-period slope with HAC errors *and* an explicit
 * warning that a non-significant result is not a licence to assume parallel
 * trends. The wording is deliberate and appears in the UI verbatim.
 */
export function preTrendTest(values, treatmentIndex, { alpha = PRE_TREND_ALPHA } = {}) {
  const T = Math.round(Number(treatmentIndex));
  const pre = (values || []).slice(0, T);
  const observed = pre.map((value, t) => ({ t, value })).filter((row) => typeof row.value === 'number' && Number.isFinite(row.value));
  if (observed.length < 4) {
    return { ok: false, reason: 'Fewer than four observed pre-period buckets.', verdict: 'unknown' };
  }
  const X = observed.map((row) => [1, row.t]);
  const fit = olsWithHac(X, observed.map((row) => row.value));
  if (!fit) return { ok: false, reason: 'The pre-period has no variation.', verdict: 'unknown' };
  const slope = fit.beta[1];
  const se = fit.se[1];
  const tStat = se > 0 ? slope / se : 0;
  const p = twoSidedP(tStat);
  const preMean = mean(observed.map((row) => row.value));
  const perBucketPct = preMean !== null && preMean !== 0 ? (slope / Math.abs(preMean)) * 100 : null;
  return {
    ok: true,
    slope: round(slope, 4),
    se: round(se, 4),
    t: round(tStat, 3),
    p: round(p, 4),
    preMean: preMean === null ? null : round(preMean, 4),
    perBucketPct: perBucketPct === null ? null : round(perBucketPct, 2),
    verdict: p < alpha ? 'trending' : 'no-significant-trend',
    alpha,
    caveat: 'A non-significant pre-trend test does not establish parallel trends. It is a weak diagnostic, and this report treats the assumption as an assumption.',
  };
}

/**
 * In-time placebo: refit the same 4-parameter model at fake interruption dates
 * inside the pre-period, using pre-period data only.
 *
 * The comparison is made on the *t statistic*, not the raw level shift, because
 * the placebo windows have different residual variance from the full model.
 * Comparing raw magnitudes across different variances is the classic way this
 * test gets quietly wrong.
 */
export function inTimePlacebo(values, treatmentIndex, { actualT } = {}) {
  const T = Math.round(Number(treatmentIndex));
  const pre = (values || []).slice(0, T);
  const target = Number.isFinite(Number(actualT)) ? Math.abs(Number(actualT)) : null;
  if (pre.length < 7 || target === null) {
    return { ok: false, reason: 'Not enough pre-period buckets for an in-time placebo distribution.', count: 0 };
  }
  const placeboT = [];
  const usable = pre.map((value, t) => ({ t, value })).filter((row) => typeof row.value === 'number' && Number.isFinite(row.value));
  for (let fake = 4; fake <= pre.length - 2; fake += 1) {
    const X = usable.map((row) => {
      const u = row.t - fake;
      const post = row.t >= fake ? 1 : 0;
      return [1, u, post, u * post];
    });
    const fit = olsWithHac(X, usable.map((row) => row.value));
    if (!fit) continue;
    const se = fit.se[2];
    if (!(se > 0)) continue;
    placeboT.push(Math.abs(fit.beta[2] / se));
  }
  if (placeboT.length < 2) {
    return { ok: false, reason: 'The pre-period is too short to build a placebo distribution.', count: placeboT.length };
  }
  const atLeast = placeboT.filter((v) => v >= target).length;
  return {
    ok: true,
    count: placeboT.length,
    p: round((atLeast + 1) / (placeboT.length + 1), 4),
    maxPlaceboT: round(Math.max(...placeboT), 3),
    medianPlaceboT: round(median(placeboT), 3),
    note: `Fake interruption dates inside the pre-period produced ${placeboT.length} placebo t statistics (median ${round(median(placeboT), 2)}).`,
  };
}

/* ------------------------------------------- synthetic control / DiD */

function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function sd(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((acc, v) => acc + (v - m) ** 2, 0) / (nums.length - 1));
}

/**
 * Equal-weight standardised donor composite.
 *
 * IMPORTANT HONESTY NOTE. Abadie's synthetic control fits donor weights on the
 * pre-period so the synthetic unit tracks the treated unit before treatment.
 * That optimisation is *absent here on purpose*: with 8–20 weekly buckets and
 * three to ten donors, a fitted weight vector would chase pre-period noise and
 * manufacture exactly the over-fit "control group" this module exists to
 * distrust. Equal weights are transparent, hard to over-fit, and stated as
 * such wherever the number appears.
 *
 * Each series is standardised on the pre-period, averaged, then rescaled back
 * to the treated unit's pre-period mean and standard deviation so the gap is
 * expressed in the treated unit's own units.
 */
export function syntheticControl({ treated, donors, treatmentIndex }) {
  const T = Math.round(Number(treatmentIndex));
  const n = treated.length;
  if (!n || !(T > 0) || T >= n) return { ok: false, reason: 'No pre/post split to build a counterfactual.' };
  const usable = [];
  for (const donor of donors || []) {
    if (!donor || !Array.isArray(donor.values) || donor.values.length !== n) continue;
    if (donor.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue;
    const preSd = sd(donor.values.slice(0, T));
    if (!(preSd > 0)) continue;
    usable.push({ ...donor, preMean: mean(donor.values.slice(0, T)), preSd });
  }
  if (!usable.length) return { ok: false, reason: 'No donor metric varies in the pre-period.' };

  const treatedPreMean = mean(treated.slice(0, T));
  const treatedPreSd = sd(treated.slice(0, T));

  const composite = [];
  for (let t = 0; t < n; t += 1) {
    composite.push(mean(usable.map((d) => (d.values[t] - d.preMean) / d.preSd)));
  }
  const cf = composite.map((z) => (treatedPreSd > 0 ? treatedPreMean + treatedPreSd * z : treatedPreMean));
  const postGaps = [];
  for (let t = T; t < n; t += 1) postGaps.push(treated[t] - cf[t]);
  const effect = mean(postGaps);
  const sampleSd = treatedPreSd > 0 ? treatedPreSd : 0;
  return {
    ok: true,
    donorIds: usable.map((d) => d.id),
    donorCount: usable.length,
    counterfactual: cf.map((v) => round(v, 4)),
    gaps: treated.map((v, t) => round(v - cf[t], 4)),
    effect: effect === null ? null : round(effect, 4),
    standardisedEffect: sampleSd > 0 && effect !== null ? round(effect / sampleSd, 4) : null,
    treatedPreSd: round(sampleSd, 4),
    note: `Equal-weight standardised composite of ${usable.length} donor metric(s); weights are not fitted, so this is a transparent difference-in-differences control, not an optimised synthetic control.`,
  };
}

/**
 * In-space placebo inference (Abadie et al. 2010).
 *
 * Each donor is treated in turn as if the intervention had hit *it*, using the
 * remaining donors as its own pool. The distribution of those placebo effects
 * under a known null of no effect gives a randomisation-style p-value for the
 * treated unit. With K donors the finest attainable p is 1/(K+1); that floor is
 * reported rather than hidden.
 */
export function inSpacePlacebo({ treated, donors, treatmentIndex }) {
  const T = Math.round(Number(treatmentIndex));
  const actual = syntheticControl({ treated, donors, treatmentIndex: T });
  if (!actual.ok || !actual.donorCount) {
    return { ok: false, reason: actual.reason || 'No usable donors.', donorCount: 0 };
  }
  const usable = [];
  for (const donor of donors || []) {
    if (!donor || !Array.isArray(donor.values) || donor.values.length !== treated.length) continue;
    if (donor.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue;
    if (!(sd(donor.values.slice(0, T)) > 0)) continue;
    usable.push(donor);
  }
  if (usable.length < IMPACT_MIN_DONORS) {
    return {
      ok: false,
      donorCount: usable.length,
      reason: `In-space placebo inference needs at least ${IMPACT_MIN_DONORS} donors; ${usable.length} available.`,
      actual,
    };
  }
  const placebos = [];
  for (const donor of usable) {
    const pool = usable.filter((d) => d.id !== donor.id);
    if (!pool.length) continue;
    const fit = syntheticControl({ treated: donor.values, donors: pool, treatmentIndex: T });
    if (!fit.ok || fit.standardisedEffect === null) continue;
    placebos.push({ id: donor.id, label: donor.label, standardisedEffect: fit.standardisedEffect });
  }
  if (placebos.length < IMPACT_MIN_DONORS - 1) {
    return { ok: false, donorCount: usable.length, reason: 'Too few placebo fits succeeded to rank the treated effect.', actual };
  }
  const actualAbs = Math.abs(actual.standardisedEffect ?? 0);
  const atLeast = placebos.filter((p) => Math.abs(p.standardisedEffect) >= actualAbs).length;
  const p = (atLeast + 1) / (placebos.length + 1);
  return {
    ok: true,
    donorCount: usable.length,
    placeboCount: placebos.length,
    p: round(p, 4),
    resolution: round(1 / (placebos.length + 1), 4),
    actual,
    placebos: placebos.map((x) => ({ ...x, standardisedEffect: round(x.standardisedEffect, 4) })),
    didEstimate: round((actual.effect ?? 0) - mean(placebos.map((x) => x.standardisedEffect)) * (actual.treatedPreSd || 1), 4),
    note: `Abadie-style in-space placebo: ${placebos.length} donor units treated in turn. Finest attainable p with this donor pool is ${round(1 / (placebos.length + 1), 3)}.`,
  };
}

/**
 * Breakdown analysis (a simplified Rambachan–Roth style sensitivity check).
 *
 * Question: how large a *linear* violation of parallel trends would have to be
 * true for the estimated level shift to be entirely explained away? Reported
 * per week and as a share of the pre-period mean, so a leader can judge whether
 * that much drift is plausible for their own metric.
 */
export function breakdownTrend(levelShift, treatmentIndex, n, preMean) {
  const T = Math.round(Number(treatmentIndex));
  const postCount = n - T;
  if (!(postCount > 0) || levelShift === null || !Number.isFinite(levelShift)) {
    return { ok: false, reason: 'No post-period to evaluate.' };
  }
  // Mean exposure of the post period, measured in buckets from the intervention.
  let sumU = 0;
  for (let t = T; t < n; t += 1) sumU += (t - T) + 0.5;
  const meanU = sumU / postCount;
  if (!(meanU > 0)) return { ok: false, reason: 'Zero post-period exposure.' };
  const breakPerBucket = Math.abs(levelShift) / meanU;
  const pctOfPreMean = preMean !== null && preMean !== undefined && Math.abs(preMean) > 0
    ? (breakPerBucket / Math.abs(preMean)) * 100
    : null;
  return {
    ok: true,
    meanExposureBuckets: round(meanU, 3),
    breakPerBucket: round(breakPerBucket, 4),
    breakPerWeek: round(breakPerBucket, 4),
    pctOfPreMean: pctOfPreMean === null ? null : round(pctOfPreMean, 2),
    fragile: pctOfPreMean !== null ? Math.abs(pctOfPreMean) < FRAGILE_BREAKDOWN_PCT : false,
    note: 'A differential trend of this size per week, sustained across the post-period, would reproduce the entire estimate — which is why a single before/after number is not evidence on its own.',
  };
}

/* ------------------------------------------------------------ study window */

/** Pre-registration is *derived* from dates, never self-declared. */
export function gradeOf(study) {
  const declared = dayKey(study?.declaredOn);
  const start = dayKey(study?.windowStart);
  if (!declared || !start) return 'exploratory';
  return declared <= start ? 'confirmatory' : 'exploratory';
}

export function studyStatusOf(study, now = new Date()) {
  if (!study) return null;
  if (study.status === 'abandoned') return 'abandoned';
  if (study.status === 'scored') return 'scored';
  const horizon = studyHorizonEnd(study);
  if (horizon && dayKey(now) >= horizon) return 'window-closed';
  return 'running';
}

export function studyHorizonEnd(study) {
  const start = dayKey(study?.windowStart);
  if (!start) return null;
  const weeks = Math.max(1, Math.round(Number(study.windowWeeks) || 4));
  return addDays(start, weeks * 7 - 1);
}

/**
 * Analysis buckets for a study: complete periods only, never before the
 * workspace had any dated record and never into the future.
 */
export function studyGrid(study, state, now = new Date()) {
  const start = dayKey(study?.windowStart);
  if (!start) return { ok: false, reason: 'This study has no intervention date.' };
  const grid = buildAnchoredGrid(start, {
    preBuckets: Math.max(IMPACT_MIN_PRE_BUCKETS, Math.round(Number(study.baselineWeeks) || 8)),
    postBuckets: Math.max(IMPACT_MIN_POST_BUCKETS, Math.round(Number(study.windowWeeks) || 4)),
    bucketDays: 7,
  });
  if (!grid) return { ok: false, reason: 'Could not build an analysis grid.' };
  const today = dayKey(now);
  const earliest = firstRecordDay(state);
  const keep = [];
  for (let i = 0; i < grid.ends.length; i += 1) {
    const end = grid.ends[i];
    if (end >= today) continue;            // period not complete
    if (earliest && end < earliest) continue; // before any record existed
    keep.push({ index: i, end, from: grid.fromFor(end) });
  }
  if (!keep.length) return { ok: false, reason: 'No complete periods fall inside the study window yet.' };
  const treatmentEnd = grid.ends[grid.treatmentIndex];
  const firstPost = keep.find((b) => b.end >= treatmentEnd);
  if (!firstPost) return { ok: false, reason: 'The post-intervention window has not closed yet.' };
  const position = keep.findIndex((b) => b.index === firstPost.index);
  const preKept = keep.filter((b) => b.end < treatmentEnd).length;
  return {
    ok: true,
    buckets: keep,
    ends: keep.map((b) => b.end),
    fromFor: (end) => {
      const row = keep.find((b) => b.end === end);
      return row ? row.from : addDays(end, -6);
    },
    treatmentIndex: position,
    preCount: preKept,
    postCount: keep.length - preKept,
    treatmentDate: start,
    lastComplete: keep[keep.length - 1].end,
  };
}

/* --------------------------------------------------------- design planner */

/** `[(X'X)^-1]_22` for the 4-parameter segmented design with a given split. */
function levelShiftVarianceFactor(preWeeks, postWeeks) {
  const nPre = Math.max(2, Math.round(preWeeks));
  const nPost = Math.max(1, Math.round(postWeeks));
  const X = [];
  for (let t = 0; t < nPre + nPost; t += 1) {
    const u = t - nPre;
    const post = t >= nPre ? 1 : 0;
    X.push([1, u, post, u * post]);
  }
  const k = 4;
  const xtx = zeros(k, k);
  for (const row of X) {
    for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) xtx[i][j] += row[i] * row[j];
  }
  const inv = invert(xtx.map((r) => [...r]));
  if (!inv) return null;
  return inv[2][2];
}

/**
 * What could this design even detect, before any data exists?
 *
 * This is the pre-intervention power calculation that the DiD practitioner
 * reviews find almost nobody actually does: the noise comes from the metric's
 * own recorded history (moving-range estimator over weekly buckets), the
 * design matrix comes from the chosen number of pre and post periods, and the
 * result is a minimum detectable effect in the metric's own units. If the
 * effect the leader hopes for is below that floor, the honest answer is
 * "lengthen the window", and this tells them by how much.
 */
export function designPower(state, vitalId, {
  preWeeks = 8, postWeeks = 4, alpha = 0.1, targetEffect = null, asOf = new Date(),
} = {}) {
  const vital = VITAL_BY_ID[vitalId];
  if (!vital) return { ok: false, reason: 'Unknown metric.' };
  const pre = Math.max(4, Math.min(26, Math.round(preWeeks) || 8));
  const post = Math.max(2, Math.min(26, Math.round(postWeeks) || 4));
  const series = buildVitalSeries(state, vitalId, { asOf, buckets: Math.max(16, pre + post + 6) });
  const values = series.points.map((p) => p.value).filter((v) => v !== null);
  if (values.length < 6) {
    return { ok: false, reason: 'This metric does not have enough recorded history to estimate its own week-to-week noise yet.' };
  }
  let sumAbs = 0;
  for (let i = 1; i < values.length; i += 1) sumAbs += Math.abs(values[i] - values[i - 1]);
  const sigma = (sumAbs / (values.length - 1)) / 1.128;
  if (!(sigma > 0)) {
    return { ok: false, reason: 'This metric has not varied in the recorded history, so its noise — and therefore any power calculation — is undefined.' };
  }
  const { z } = zFor(alpha);
  const factor = levelShiftVarianceFactor(pre, post);
  if (factor === null) return { ok: false, reason: 'The design matrix is singular for this many periods.' };
  const mde = (z + Z_POWER) * sigma * Math.sqrt(factor);

  let requiredPostWeeks = null;
  const target = Number.isFinite(Number(targetEffect)) && Number(targetEffect) > 0 ? Math.abs(Number(targetEffect)) : null;
  if (target !== null) {
    for (let weeks = 2; weeks <= 26; weeks += 1) {
      const f = levelShiftVarianceFactor(pre, weeks);
      if (f === null) continue;
      if ((z + Z_POWER) * sigma * Math.sqrt(f) <= target) { requiredPostWeeks = weeks; break; }
    }
  }
  const seriesMean = mean(values);
  return {
    ok: true,
    vitalId,
    vitalLabel: vital.label,
    unit: vital.unit,
    preWeeks: pre,
    postWeeks: post,
    alpha,
    sigma: round(sigma, 4),
    mde: round(mde, 4),
    mdePctOfMean: seriesMean ? round((mde / Math.abs(seriesMean)) * 100, 1) : null,
    historyWeeks: values.length,
    targetEffect: target,
    requiredPostWeeks,
    detectable: target === null ? null : mde <= target,
    note: `σ̂ ${round(sigma, 3)} ${vital.unit} from ${values.length} recorded weeks (moving-range estimator). With ${pre} pre and ${post} post periods the smallest detectable level shift at α=${alpha} and 80% power is ${round(mde, 3)} ${vital.unit}.`,
  };
}

/* ------------------------------------------------------------ the evaluator */

/**
 * Evaluate one study. Pure: the same study + the same state always produce the
 * same numbers, which is what makes the frozen snapshot meaningful.
 */
export function evaluateStudy(study, state, { now = new Date() } = {}) {
  const vital = VITAL_BY_ID[study?.vitalId];
  const base = {
    studyId: study?.id || null,
    engineVersion: IMPACT_ENGINE_VERSION,
    ok: false,
    verdict: 'unmeasurable',
    grade: gradeOf(study),
    reason: null,
  };
  if (!study) return { ...base, reason: 'No study.' };
  if (!vital) return { ...base, reason: 'This study points at a metric that no longer exists.' };

  const grid = studyGrid(study, state, now);
  if (!grid.ok) return { ...base, reason: grid.reason };
  if (grid.preCount < IMPACT_MIN_PRE_BUCKETS) {
    return { ...base, grid: summariseGrid(grid), reason: `Only ${grid.preCount} complete pre-intervention period(s); at least ${IMPACT_MIN_PRE_BUCKETS} are needed for a counterfactual.` };
  }
  if (grid.postCount < IMPACT_MIN_POST_BUCKETS) {
    return { ...base, grid: summariseGrid(grid), reason: `Only ${grid.postCount} complete post-intervention period(s); at least ${IMPACT_MIN_POST_BUCKETS} are needed.` };
  }

  const series = buildVitalSeries(state, study.vitalId, {
    ends: grid.ends,
    fromFor: grid.fromFor,
    anchored: true,
  });
  const values = series.points.map((p) => p.value);
  const observed = values.filter((v) => v !== null).length;
  const gaps = values.length - observed;
  if (observed < IMPACT_MIN_PRE_BUCKETS + IMPACT_MIN_POST_BUCKETS) {
    return {
      ...base,
      grid: summariseGrid(grid),
      series: series.points,
      coverage: { observed, total: values.length, gaps },
      reason: `Only ${observed} of ${values.length} periods in this window have a measurement (the rest had no observation, or were suppressed by the pulse anonymity floor). That is too few to fit a counterfactual, and substituting zeros would invent data — which is worse than admitting the window cannot answer the question.`,
    };
  }
  const variance = sd(values);
  if (!(variance > 0)) {
    return { ...base, grid: summariseGrid(grid), series: series.points, reason: 'The metric did not vary at all over the window, so no estimator is defined.' };
  }

  const alpha = Number(study.alpha) > 0 && Number(study.alpha) < 1 ? Number(study.alpha) : 0.1;
  const its = interruptedTimeSeries(values, grid.treatmentIndex, { alpha });
  if (!its.ok) return { ...base, grid: summariseGrid(grid), series: series.points, reason: its.reason };

  const preTrend = preTrendTest(values, grid.treatmentIndex);
  const inTime = inTimePlacebo(values, grid.treatmentIndex, { actualT: its.tLevel });
  const breakdown = breakdownTrend(its.levelShift, grid.treatmentIndex, values.length, its.preMean);

  // Donor pool: every other vital that is fully measured on this exact grid.
  const donors = [];
  for (const candidate of VITALS) {
    if (candidate.id === study.vitalId) continue;
    const donorSeries = buildVitalSeries(state, candidate.id, {
      ends: grid.ends,
      fromFor: grid.fromFor,
      anchored: true,
    });
    const donorValues = donorSeries.points.map((p) => p.value);
    if (donorValues.some((v) => v === null)) continue;
    donors.push({ id: candidate.id, label: candidate.label, values: donorValues });
  }
  const inSpace = inSpacePlacebo({ treated: values, donors, treatmentIndex: grid.treatmentIndex });

  const towardHypothesis = signedTowardHypothesis(vital, its.levelShift);
  const expectedEffect = Number.isFinite(Number(study.expectedEffect)) && Number(study.expectedEffect) > 0
    ? Math.abs(Number(study.expectedEffect))
    : null;
  const meetsMde = Math.abs(its.levelShift) >= its.mde;

  const gates = [];
  if (preTrend.ok && preTrend.p < PRE_TREND_ALPHA) {
    gates.push({ gate: 'pre-trend', passed: false, detail: `Pre-period slope ${preTrend.slope} per week (p=${preTrend.p}).` });
  } else {
    gates.push({
      gate: 'pre-trend',
      passed: true,
      soft: true,
      detail: preTrend.ok
        ? `Pre-period slope ${preTrend.slope} per week (p=${preTrend.p}) — not significant, which does not prove parallel trends.`
        : 'Pre-period too short to test.',
    });
  }
  gates.push({ gate: 'power', passed: meetsMde, detail: `|${its.levelShift}| ${meetsMde ? '≥' : '<'} minimum detectable effect ${its.mde}.` });
  /**
   * Which placebo test can actually speak at this alpha?
   *
   * Both placebo tests are rank-based, so their finest attainable p-value is
   * 1/(K+1) for K placebo assignments. With three donors that floor is 0.25,
   * which is ABOVE the 0.10 threshold the study is judged at. Such a test can
   * never reject — and a test that cannot reject is not evidence of anything.
   * Using it as a pass/fail gate would silently convert every small study into
   * "inconclusive", which is its own kind of dishonesty.
   *
   * So the placebo tests are treated as FALSIFICATION checks that only bind
   * when they have the resolution to bind. The parametric HAC test remains the
   * primary inference, and the report states plainly which checks could speak.
   */
  const inSpaceUsable = inSpace.ok && inSpace.resolution !== undefined && inSpace.resolution < alpha;
  const inTimeUsable = inTime.ok && (1 / (inTime.count + 1)) < alpha;
  const placeboSource = inSpaceUsable ? 'in-space' : (inTimeUsable ? 'in-time' : null);
  const placeboP = placeboSource === 'in-space' ? inSpace.p : (placeboSource === 'in-time' ? inTime.p : null);
  const placeboResolution = placeboSource === 'in-space'
    ? inSpace.resolution
    : (placeboSource === 'in-time' ? round(1 / (inTime.count + 1), 4) : (inSpace.ok ? inSpace.resolution : (inTime.ok ? round(1 / (inTime.count + 1), 4) : null)));

  if (placeboSource) {
    gates.push({ gate: `placebo (${placeboSource})`, passed: placeboP < alpha, detail: `p=${placeboP} against α=${alpha}; finest attainable p from this design is ${placeboResolution}.` });
  } else {
    gates.push({
      gate: 'placebo',
      passed: true,
      soft: true,
      detail: `No placebo test has the resolution to reach α=${alpha} (finest attainable ${placeboResolution ?? '—'}), so none is used as a pass/fail gate. The result rests on the parametric interval, and that limitation is reported.`,
    });
  }

  const primarySignificant = its.pLevel < alpha;
  let verdict = 'inconclusive';
  if (!gates[0].passed) verdict = 'pre-trend';
  else if (!meetsMde) verdict = 'underpowered';
  else if (towardHypothesis !== null && towardHypothesis < 0) verdict = 'not-supported';
  else if (!primarySignificant) verdict = 'inconclusive';
  else if (placeboSource && !(placeboP < alpha)) verdict = 'inconclusive';
  else verdict = 'supported';

  const realized = expectedEffect !== null ? towardHypothesis : null;
  const ratio = expectedEffect !== null && realized !== null && expectedEffect > 0
    ? realized / expectedEffect
    : null;

  return {
    studyId: study.id,
    engineVersion: IMPACT_ENGINE_VERSION,
    ok: true,
    grade: gradeOf(study),
    vitalId: vital.id,
    vitalLabel: vital.label,
    unit: vital.unit,
    direction: vital.direction,
    window: {
      treatmentDate: grid.treatmentDate,
      horizonEnd: studyHorizonEnd(study),
      lastComplete: grid.lastComplete,
      preBuckets: grid.preCount,
      postBuckets: grid.postCount,
    },
    grid: summariseGrid(grid),
    series: series.points,
    coverage: { observed, total: values.length, gaps },
    estimate: its.levelShift,
    estimatePct: its.preMean ? round((its.levelShift / Math.abs(its.preMean)) * 100, 2) : null,
    towardHypothesis: realized,
    its,
    preTrend,
    inTime,
    inSpace,
    breakdown,
    donors: donors.map((d) => ({ id: d.id, label: d.label })),
    expectedEffect,
    effectRatio: ratio === null ? null : round(ratio, 2),
    meetsMde,
    alpha,
    placeboP,
    placeboSource,
    placeboResolution,
    placeboInformative: Boolean(placeboSource),
    pValue: its.pLevel,
    primarySignificant,
    gates,
    verdict,
    verdictMeta: VERDICTS[verdict],
    reason: null,
  };
}

function summariseGrid(grid) {
  return {
    treatmentDate: grid.treatmentDate,
    treatmentIndex: grid.treatmentIndex,
    preCount: grid.preCount,
    postCount: grid.postCount,
    lastComplete: grid.lastComplete,
    buckets: grid.buckets.map((b) => ({ from: b.from, end: b.end })),
  };
}

/* ------------------------------------------------------- the impact report */

export const IMPACT_CALIBRATION_MIN = 3;

/**
 * Score the leader's own intervention predictions.
 *
 * A pre-registered direction is a *prediction*. With a stated confidence it is
 * a probability forecast, so the same Brier machinery used for decision
 * forecasts applies: brier = mean((confidence − outcome)²) with outcome ∈ {0,1}.
 * Without a confidence the module scores direction accuracy alone and says so.
 */
export function impactCalibration(rows) {
  const scored = (rows || []).filter((r) => r && r.evaluation && r.evaluation.ok && r.study.status !== 'abandoned');
  const decisive = scored.filter((r) => ['supported', 'not-supported'].includes(r.evaluation.verdict));
  const withDirection = scored.filter((r) => r.evaluation.towardHypothesis !== null);
  const correct = withDirection.filter((r) => r.evaluation.towardHypothesis > 0);
  const withConfidence = decisive.filter((r) => Number.isFinite(Number(r.study.expectedConfidence)));
  const brier = withConfidence.length
    ? round(mean(withConfidence.map((r) => {
      const p = Math.min(0.99, Math.max(0.01, Number(r.study.expectedConfidence) / 100));
      const outcome = r.evaluation.verdict === 'supported' ? 1 : 0;
      return (p - outcome) ** 2;
    })), 4)
    : null;
  const ratios = scored
    .filter((r) => r.evaluation.effectRatio !== null && r.evaluation.effectRatio > 0)
    .map((r) => r.evaluation.effectRatio);
  return {
    studies: scored.length,
    decisive: decisive.length,
    directionScored: withDirection.length,
    directionCorrect: correct.length,
    directionAccuracy: withDirection.length ? round(correct.length / withDirection.length, 3) : null,
    brier,
    brierScored: withConfidence.length,
    medianEffectRatio: ratios.length ? round(median(ratios), 2) : null,
    overEstimationFactor: ratios.length ? round(1 / median(ratios), 2) : null,
    underpowered: scored.filter((r) => r.evaluation.verdict === 'underpowered').length,
    preTrend: scored.filter((r) => r.evaluation.verdict === 'pre-trend').length,
    insufficient: scored.length < IMPACT_CALIBRATION_MIN,
    note: scored.length < IMPACT_CALIBRATION_MIN
      ? `Fewer than ${IMPACT_CALIBRATION_MIN} evaluable studies — these are counts, not a calibration curve.`
      : 'Direction accuracy is scored on evidence-bearing studies only; underpowered and trend-broken studies are excluded rather than counted as misses.',
  };
}

/** Everything the terminal, the signals and the board brief need. */
export function buildImpactReport(state, now = new Date()) {
  const studies = Array.isArray(state?.impactStudies) ? state.impactStudies : [];
  const rows = studies.map((study) => {
    let evaluation = null;
    // A scored study reports its FROZEN evaluation. Re-computing it would make
    // a committed result drift every time a record elsewhere in the workspace
    // changed, which is the exact opposite of what locking is for. The live
    // evaluator is only used for studies that have not been committed to.
    if (study.status === 'scored' && study.evaluation && typeof study.evaluation === 'object') {
      evaluation = { ...study.evaluation, verdict: study.verdict || study.evaluation.verdict };
    } else try {
      evaluation = evaluateStudy(study, state, { now });
    } catch (error) {
      evaluation = {
        studyId: study.id, ok: false, verdict: 'unmeasurable', grade: gradeOf(study),
        reason: `The evaluator could not read this study: ${error && error.message ? error.message : 'unknown error'}`,
      };
    }
    return {
      study,
      evaluation,
      status: studyStatusOf(study, now),
      vital: VITAL_BY_ID[study.vitalId] || null,
      intervention: INTERVENTION_BY_ID[study.interventionType] || null,
    };
  });

  const active = rows.filter((r) => r.status !== 'abandoned');
  const confirmatory = active.filter((r) => r.evaluation.grade === 'confirmatory');
  const supported = confirmatory.filter((r) => r.evaluation.verdict === 'supported');
  const notSupported = confirmatory.filter((r) => r.evaluation.verdict === 'not-supported');
  const underpowered = confirmatory.filter((r) => ['underpowered', 'pre-trend'].includes(r.evaluation.verdict));
  const awaiting = rows.filter((r) => r.status === 'window-closed');
  const running = rows.filter((r) => r.status === 'running');

  return {
    engineVersion: IMPACT_ENGINE_VERSION,
    generatedFor: dayKey(now),
    rows,
    totals: {
      studies: rows.length,
      active: active.length,
      running: running.length,
      awaitingEvaluation: awaiting.length,
      confirmatory: confirmatory.length,
      retrospective: active.length - confirmatory.length,
      supported: supported.length,
      notSupported: notSupported.length,
      inconclusiveOrUnderpowered: underpowered.length,
      unmeasurable: confirmatory.filter((r) => r.evaluation.verdict === 'unmeasurable').length,
    },
    calibration: impactCalibration(rows),
    /** Studies whose window has closed and which the leader has not yet locked. */
    awaiting: awaiting,
    running,
    supported,
    notSupported,
    underpowered,
    /** The single most actionable row, for the Today card. */
    headline: supported[0] || notSupported[0] || underpowered[0] || awaiting[0] || running[0] || null,
  };
}

/* ---------------------------------------------------------------- signals */

const SIGNAL_ACTIONS = {
  lab: { label: 'Open the Impact Ledger', route: '#/impact' },
};

/**
 * IMP-01..06 signals. Each fires only on evidence the record actually contains;
 * an empty workspace produces nothing.
 */
export function impactSignals(state = {}, now = new Date()) {
  const report = buildImpactReport(state, now);
  const signals = [];

  // IMP-01 — a closed window the leader has not scored.
  for (const row of report.awaiting.slice(0, 3)) {
    signals.push({
      ruleId: 'IMP-01',
      domain: 'Impact',
      title: `“${row.study.title}” reached its evaluation window`,
      detail: `The ${row.vital ? row.vital.label.toLowerCase() : 'metric'} window closed on ${row.evaluation.window?.horizonEnd || studyHorizonEnd(row.study)}. Score it now — the whole value of a pre-registered hypothesis is that it is scored whether or not it flattered you. Locking freezes the result; the hypothesis cannot be edited afterwards.`,
      severity: 3,
      confidence: row.evaluation.ok ? 'high' : 'medium',
      evidence: [
        row.evaluation.ok
          ? `Level shift ${row.evaluation.estimate} ${row.vital?.unit || ''} (MDE ${row.evaluation.its?.mde})`
          : (row.evaluation.reason || 'Not yet evaluable'),
        row.evaluation.grade === 'confirmatory' ? 'Pre-registered before the window closed' : 'Retrospective — recorded after the intervention started',
      ],
      action: { label: 'Score this study', route: `#/impact?tab=studies&study=${row.study.id}` },
    });
  }

  // IMP-02 — a decisive result nobody has acted on.
  for (const row of [...report.supported, ...report.notSupported].slice(0, 3)) {
    const ok = row.evaluation.verdict === 'supported';
    signals.push({
      ruleId: 'IMP-02',
      domain: 'Impact',
      title: ok
        ? `Evidence supports “${row.study.title}”`
        : `Evidence does not support “${row.study.title}”`,
      detail: ok
        ? `The post-period shift is in the direction you pre-registered, clears the minimum detectable effect, and survives the placebo tests. That is a reason to protect or extend the intervention — and to record the result before the memory of this quarter rewrites itself.`
        : `The record points the other way at a detectable effect size. The useful move is not to keep spending on it: open a scale/stop decision, or redesign the intervention and pre-register the new hypothesis. This is evidence about an intervention, never about the people in it.`,
      severity: ok ? 2 : 4,
      confidence: row.evaluation.placeboSource ? 'high' : 'medium',
      evidence: [
        `Estimate ${row.evaluation.estimate} ${row.vital?.unit || ''} vs MDE ${row.evaluation.its?.mde}`,
        `Placebo p ${row.evaluation.placeboP ?? '—'} (${row.evaluation.placeboSource || 'no placebo'})`,
        `Grade: ${GRADES[row.evaluation.grade]}`,
      ],
      action: { ...SIGNAL_ACTIONS.lab, route: `#/impact?tab=studies&study=${row.study.id}` },
    });
  }

  // IMP-03 — the effect was too small to detect: a design problem, not a failure.
  for (const row of report.underpowered.slice(0, 2)) {
    signals.push({
      ruleId: 'IMP-03',
      domain: 'Impact',
      title: `${row.study.title}: the record cannot answer this question yet`,
      detail: `The estimated shift (${row.evaluation.estimate}) is inside the noise floor for this series (MDE ${row.evaluation.its?.mde}). Treat a null result here as "we did not measure long enough", not "it did not work". Either extend the window, pick a metric with less week-to-week noise, or accept the answer is out of reach.`,
      severity: 2,
      confidence: 'high',
      evidence: [
        `${row.evaluation.grid?.preCount || 0} pre / ${row.evaluation.grid?.postCount || 0} post periods`,
        `Residual σ ${row.evaluation.its?.sigma ?? '—'} ${row.vital?.unit || ''}`,
      ],
      action: { ...SIGNAL_ACTIONS.lab, route: `#/impact?tab=design&study=${row.study.id}` },
    });
  }

  // IMP-04 — a retrospective study is being remembered as proof.
  const retrospectiveDecisive = report.rows.filter(
    (r) => r.evaluation?.grade === 'exploratory' && r.evaluation.ok && r.evaluation.verdict === 'supported',
  );
  if (retrospectiveDecisive.length) {
    signals.push({
      ruleId: 'IMP-04',
      domain: 'Impact',
      title: `${retrospectiveDecisive.length} retrospective stud${retrospectiveDecisive.length === 1 ? 'y' : 'ies'} agree${retrospectiveDecisive.length === 1 ? 's' : ''} with the hypothesis`,
      detail: 'These hypotheses were written down after the intervention had already started, so the direction was chosen with the benefit of hindsight. They are useful for hypothesis *generation*; they cannot confirm anything. Pre-register the next one before you start it and it will count.',
      severity: 2,
      confidence: 'high',
      evidence: retrospectiveDecisive.slice(0, 3).map((r) => `“${r.study.title}” (declared ${r.study.declaredOn}, intervention ${r.study.windowStart})`),
      action: SIGNAL_ACTIONS.lab,
    });
  }

  // IMP-05 — the leader's effects are systematically overestimated.
  const cal = report.calibration;
  if (cal.medianEffectRatio !== null && cal.medianEffectRatio > 0 && cal.medianEffectRatio < 0.5 && cal.directionScored >= 3) {
    signals.push({
      ruleId: 'IMP-05',
      domain: 'Impact',
      title: 'You overestimate how much your interventions move the needle',
      detail: `Across ${cal.directionScored} evaluable studies the realised effect has been a median ${Math.round(cal.medianEffectRatio * 100)}% of what you declared — an overestimate of about ${cal.overEstimationFactor}×. That is a planning-fallacy pattern in your own judgement, not a flaw in your leadership. Halve the effect size you expect by default and re-check in two studies.`,
      severity: 3,
      confidence: 'medium',
      evidence: [
        `Median realised/declared effect: ${cal.medianEffectRatio}`,
        `Direction right in ${cal.directionCorrect} of ${cal.directionScored}`,
        cal.brier !== null ? `Brier score ${cal.brier} on ${cal.brierScored} confident calls` : 'No stated confidences to score yet',
      ],
      action: { ...SIGNAL_ACTIONS.lab, route: '#/impact?tab=calibration' },
    });
  }

  // IMP-06 — a structural break with no intervention recorded against it.
  for (const row of report.running.slice(0, 2)) {
    if (!row.evaluation?.ok) continue;
    const trend = row.evaluation.preTrend;
    if (trend?.ok && trend.verdict === 'trending' && Math.abs(trend.perBucketPct || 0) >= 5) {
      signals.push({
        ruleId: 'IMP-06',
        domain: 'Impact',
        title: `${row.vital?.label || 'A metric'} was already moving before your intervention`,
        detail: `Over the ${row.evaluation.grid?.preCount || 0} periods before the intervention date, ${row.vital?.label?.toLowerCase() || 'the metric'} was drifting ${trend.perBucketPct}% per week (p=${trend.p}). A before/after comparison would have credited your intervention with that drift. Either move the treatment date to where the metric was flat, or accept that this window cannot identify an effect.`,
        severity: 3,
        confidence: 'high',
        evidence: [
          `Pre-period slope ${trend.slope} ${row.vital?.unit || ''} per week`,
          `p=${trend.p} against α=${trend.alpha}`,
          trend.caveat,
        ],
        action: { ...SIGNAL_ACTIONS.lab, route: `#/impact?tab=design&study=${row.study.id}` },
      });
    }
  }

  return signals;
}

/* --------------------------------------------------------------- the brief */

/**
 * A deterministic, board-ready brief. No generation, no template randomness —
 * the same record produces the same document, which is what makes it citable.
 */
export function buildImpactBrief(state, now = new Date()) {
  const report = buildImpactReport(state, now);
  const cal = report.calibration;
  const lines = [];
  lines.push(`# Intervention impact brief — ${dayKey(now)}`);
  lines.push('');
  lines.push(`**Engine** ${IMPACT_ENGINE_VERSION}. Methods: segmented interrupted time series with Newey–West HAC errors, in-time and in-space placebo inference, minimum detectable effect from pre-period residual variance, and a linear breakdown bound on the parallel-trends assumption.`);
  lines.push('');
  lines.push('## Where the evidence stands');
  lines.push('');
  lines.push(`- ${report.totals.confirmatory} pre-registered stud${report.totals.confirmatory === 1 ? 'y' : 'ies'}; ${report.totals.retrospective} retrospective (not counted as confirmatory).`);
  lines.push(`- ${report.totals.supported} supported by the record, ${report.totals.notSupported} contradicted, ${report.totals.inconclusiveOrUnderpowered} inconclusive or underpowered.`);
  if (report.totals.awaitingEvaluation) lines.push(`- ${report.totals.awaitingEvaluation} window(s) closed and awaiting scoring.`);
  lines.push('');
  if (report.rows.length) {
    lines.push('## Study ledger');
    lines.push('');
    lines.push('| Study | Metric | Grade | Estimate | MDE | Placebo p | Verdict |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const row of report.rows) {
      const ev = row.evaluation;
      lines.push(`| ${escapeCell(row.study.title)} | ${escapeCell(row.vital?.label || row.study.vitalId)} | ${ev.grade} | ${ev.ok ? `${ev.estimate} ${row.vital?.unit || ''}` : '—'} | ${ev.its?.mde ?? '—'} | ${ev.placeboP ?? '—'} | ${VERDICTS[ev.verdict]?.label || ev.verdict} |`);
    }
    lines.push('');
  }
  lines.push('## Calibration of the leader\'s own predictions');
  lines.push('');
  if (cal.insufficient) {
    lines.push(cal.note);
  } else {
    if (cal.directionAccuracy !== null) lines.push(`- Direction correct in ${cal.directionCorrect} of ${cal.directionScored} evaluable studies (${Math.round(cal.directionAccuracy * 100)}%).`);
    if (cal.brier !== null) lines.push(`- Brier score on stated confidences: ${cal.brier} across ${cal.brierScored} calls (0 = perfect, 0.25 = always guessing 50%).`);
    if (cal.medianEffectRatio !== null) lines.push(`- Median realised effect was ${Math.round(cal.medianEffectRatio * 100)}% of the declared effect.`);
  }
  lines.push('');
  lines.push('## What this brief does not claim');
  lines.push('');
  lines.push('No study here establishes causation. Each is an observational before/after design with a stated counterfactual, a noise floor and placebo checks. A "supported" verdict means the pattern is consistent with the pre-registered hypothesis under those assumptions — nothing stronger. Where the record could not support an answer, the brief says so instead of estimating one.');
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Convenience for views: the catalog rows the metric picker should offer. */
export function vitalChoices(state, now = new Date()) {
  return VITALS.map((vital) => {
    const series = buildVitalSeries(state, vital.id, { asOf: now, buckets: 20 });
    return {
      id: vital.id,
      label: vital.label,
      unit: vital.unit,
      direction: vital.direction,
      framework: vital.framework,
      description: vital.description,
      measured: series.measured,
      usable: series.measured >= VITAL_MIN_POINTS,
      reason: series.reason,
    };
  });
}

export { daysBetween, addDays };
