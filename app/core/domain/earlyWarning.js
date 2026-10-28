/**
 * app/core/domain/earlyWarning.js — the Early-Warning Watch
 * (Schema v39, RULE-EW-00..04).
 *
 * THE PROBLEM THIS SOLVES
 * Session 56 shipped an honest but inert control chart: a leader could see a
 * special-cause signal on one reconstructed series and nothing else happened.
 * Every serious alerting discipline — clinical early warning, security
 * operations, industrial predictive maintenance — has learned the same three
 * lessons the hard way, and no leadership product has applied them:
 *
 *  1. **Watching one metric is not surveillance; watching twelve is a multiple-
 *     testing problem.** With m tests per period at α = 0.0027 nothing goes
 *     wrong, but Shewhart's own runs and cluster rules are not that rare, and
 *     the moment a leader watches a dozen series the family-wise chance of at
 *     least one false alarm per period climbs past 5%. The answer used in
 *     genomics and in robust anomaly detection is to control the FALSE
 *     DISCOVERY RATE (Benjamini & Hochberg, 1995) across the whole scan rather
 *     than to tighten each chart until it is useless. This module does exactly
 *     that, prints m, q, the step-up cutoff and the expected number of false
 *     discoveries, and refuses to promote anything the procedure does not
 *     reject.
 *
 *  2. **An alert is a claim, and claims must be graded.** Alert-fatigue
 *     research is unambiguous: roughly half of production security alerts are
 *     false positives, and a system that never measures its own precision
 *     teaches its users to ignore it. So every promoted alert here is a
 *     PREDICTION frozen at detection (point, natural limits, naive baseline,
 *     due date) and every human verdict is appended to a ledger. Precision is
 *     reported as a Wilson (1927) score interval and the detector's skill is
 *     reported out of sample as 1 − model error / naive error, counts-only
 *     below the house evidence floor.
 *
 *  3. **No statistical procedure should take an irreversible action.** A p
 *     value cannot open a case. A human verdict can. The automation spine
 *     therefore fires only on a *recorded human judgement* — confirmed,
 *     false alarm, explained or dismissed — and even then the response is a
 *     typed, owned, idempotent record, never a message sent on the leader's
 *     behalf.
 *
 * Named, citable machinery (product doctrine §0.2):
 *  - Shewhart (1931) / Deming (1986) / Wheeler (1993) — XmR natural limits and
 *    the four special-cause rules already implemented in `spc.js`; reused, not
 *    re-derived, so the two surfaces can never disagree about the same series.
 *  - Benjamini & Hochberg (1995) — step-up FDR control. The nominal α of each
 *    Shewhart rule is computed from its own null model (normal tails via
 *    Abramowitz & Stegun 7.1.26, max error 1.5e-7) and Bonferroni-inflated by
 *    the four rules tested per series before entering the step-up. Every
 *    constant is exported and printed.
 *  - Wilson (1927) — score interval for the alert-precision proportion, so a
 *    3-of-4 record is never reported as "75% reliable" without its interval.
 *  - Dawes (1979) / Tetlock (2005) — the naive-persistence benchmark: a detector
 *    that cannot beat "the next week looks like this week" is reported as worse
 *    than useless, which is what the literature calls it.
 *  - Little (1961) — nothing here samples or forecasts beyond one weekly bucket;
 *    no compounding projection is drawn from a 26-point series.
 *
 * Honesty boundaries, enforced in code:
 *  - Series are reconstructed by `vitals.js`. A bucket with no contributing
 *    record is `null` and is never interpolated, scored, or counted as zero.
 *  - Nothing is promoted from a chart that does not have XmR limits.
 *  - A suppressed candidate is still recorded (status `suppressed`, with the
 *    reason), so throttling is visible instead of looking like calm.
 *  - A "noisy" series is not silently switched off: its candidates are recorded
 *    as suppressed with reason `noisy-series`, and it still counts in m, the
 *    honest denominator for multiple-testing.
 *  - No alert, case, decision or note is deleted anywhere in this module. The
 *    ledger is append-only; verdicts are one-way.
 *
 * Pure module: no DOM, no storage, no network, no wall-clock globals. The rule
 * receives the same post-commit context as every other rule (ADR-0008) and is
 * registered upstream of decision tempo so a triage decision receives its
 * timing position in the same atomic transaction.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import {
  EW_ALERT_STATUSES,
  EW_BUCKETS,
  EW_DEFAULT_BUDGET,
  EW_DEFAULT_COOLDOWN_DAYS,
  EW_DEFAULT_Q,
  EW_DEFAULT_TRIAGE_DAYS,
  EW_DEFAULT_WINDOW_DAYS,
  EW_ENGINE_VERSION,
  EW_FDR_METHOD,
  EW_MAX_FORECASTS,
  EW_MIN_SCORED,
  EW_MIN_VERDICTS,
  EW_NOISE_LOOKBACK_DAYS,
  EW_NOISY_FALSE_ALARMS,
  EW_PRECISION_TOLERANCE,
  EW_RULES_PER_SERIES,
  EW_RULE_IDS,
  EW_SERIES_BY_ID,
  EW_SERIES_REGISTRY,
  EW_STATUS_LABELS,
  EW_SUPPRESSION_REASONS,
  EW_VERDICTS,
  EW_VERDICT_LABELS,
} from './watchRegistry.js';
import { computeXmR } from './spc.js';
import { buildVitalSeries } from './vitals.js';

/* -------------------------------------------------------------- constants */
// The vocabulary lives in `watchRegistry.js` so `schema.js` can validate rows
// without importing this module (and creating a cycle). Re-exported here so
// callers and tests have one import site.
export {
  EW_ALERT_STATUSES,
  EW_BUCKETS,
  EW_ENGINE_VERSION,
  EW_DEFAULT_BUDGET,
  EW_DEFAULT_COOLDOWN_DAYS,
  EW_DEFAULT_Q,
  EW_DEFAULT_TRIAGE_DAYS,
  EW_DEFAULT_WINDOW_DAYS,
  EW_FDR_METHOD,
  EW_MAX_FORECASTS,
  EW_MIN_SCORED,
  EW_MIN_VERDICTS,
  EW_NOISY_FALSE_ALARMS,
  EW_NOISE_LOOKBACK_DAYS,
  EW_PRECISION_TOLERANCE,
  EW_RULE_IDS,
  EW_RULES_PER_SERIES,
  EW_SERIES_BY_ID,
  EW_SERIES_REGISTRY,
  EW_STATUS_LABELS,
  EW_SUPPRESSION_REASONS,
  EW_VERDICTS,
  EW_VERDICT_LABELS,
} from './watchRegistry.js';

/* ------------------------------------------------------------- statistics */

/**
 * Standard normal CDF via the Abramowitz & Stegun (1964) 7.1.26 erf
 * approximation — absolute error below 1.5e-7, which is far tighter than any
 * decision this module makes with it.
 */
export function normalCdf(x) {
  if (!Number.isFinite(x)) return Number.NaN;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/** Exact binomial tail P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialTail(n, k, p) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n || p < 0 || p > 1) return Number.NaN;
  let logTerm = 0;
  let total = 0;
  for (let i = k; i <= n; i += 1) {
    // log C(n,i) + i ln p + (n-i) ln(1-p), summed in linear space via exp deltas.
    let logC = 0;
    for (let j = 1; j <= i; j += 1) logC += Math.log((n - i + j) / j);
    const logP = i === 0 ? 0 : i * Math.log(p);
    const logQ = n - i === 0 ? 0 : (n - i) * Math.log(1 - p);
    logTerm = logC + logP + logQ;
    total += Math.exp(logTerm);
  }
  return total;
}

/**
 * Nominal α of one Shewhart rule under its own null model. These are the
 * constants the FDR procedure consumes; they are exported so a reader can
 * recompute the whole scan by hand.
 */
export function nominalAlpha(rule) {
  switch (rule) {
    // A single point outside 3σ: two-sided normal tail.
    case 'beyond-limit':
      return 2 * (1 - normalCdf(3));
    // A moving range beyond D4·MR̄. The MR distribution is skewed, so this is
    // the same nominal 3σ two-sided tail, labelled as an approximation rather
    // than a derived probability (see the honesty note in the UI).
    case 'range-spike':
      return 2 * (1 - normalCdf(3));
    // 3 of the last 4 points beyond the same 2σ limit: one-sided binomial tail.
    case 'near-limit-cluster':
      return binomialTail(4, 3, 1 - normalCdf(2));
    // 8 consecutive points on one side of the centre line: two-sided 0.5^7.
    case 'sustained-shift':
      return Math.pow(0.5, 7);
    default:
      return 1;
  }
}

/**
 * Series-level p value: the strongest rule on the latest point, Bonferroni
 * inflated for the number of rules tested on that chart. Capped at 1.
 */
export function seriesPValue(signals = []) {
  if (!Array.isArray(signals) || !signals.length) return 1;
  let best = 1;
  for (const s of signals) best = Math.min(best, nominalAlpha(s && s.rule));
  return Math.min(1, EW_RULES_PER_SERIES * best);
}

/**
 * Benjamini–Hochberg step-up. Returns the sorted p values, the per-rank
 * thresholds, the largest rank k with p₍ₖ₎ ≤ (k/m)·q, and which input indices
 * are rejected. Deterministic and stable for ties (ascending, then by index).
 */
export function benjaminiHochberg(pValues = [], q = EW_DEFAULT_Q) {
  const clean = (Array.isArray(pValues) ? pValues : [])
    .map((p, index) => ({ p: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 1, index }))
    .sort((a, b) => a.p - b.p || a.index - b.index);
  const m = clean.length;
  const qq = Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : EW_DEFAULT_Q;
  if (!m) {
    return { m: 0, q: qq, k: 0, threshold: null, rejected: [], ranked: [], expectedFalseDiscoveries: 0 };
  }
  const ranked = clean.map((row, i) => ({
    index: row.index,
    rank: i + 1,
    p: row.p,
    threshold: ((i + 1) / m) * qq,
    passes: row.p <= ((i + 1) / m) * qq,
  }));
  let k = 0;
  for (const row of ranked) if (row.passes) k = row.rank;
  const rejected = ranked
    .filter((row) => row.rank <= k)
    .map((row) => row.index)
    .sort((a, b) => a - b);
  return {
    m,
    q: qq,
    k,
    threshold: k ? ranked[k - 1].threshold : null,
    rejected,
    ranked,
    expectedFalseDiscoveries: round(m * qq, 4),
  };
}

/** Wilson score interval for a binomial proportion (no continuity correction). */
export function wilsonInterval(successes, n, z = 1.959964) {
  const s = Math.max(0, Math.round(Number(successes) || 0));
  const total = Math.max(0, Math.round(Number(n) || 0));
  if (!total || s > total) return { n: total, successes: s, p: null, lo: null, hi: null };
  const p = s / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return {
    n: total,
    successes: s,
    p: round(p, 4),
    lo: round(Math.max(0, centre - half), 4),
    hi: round(Math.min(1, centre + half), 4),
  };
}

/* ---------------------------------------------------------------- policy */

/** Read and clamp the policy out of settings, so a hand-edited blob cannot lie. */
export function readWatchPolicy(settings = {}) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const int = (value, lo, hi, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  const q = Number(s.watchQ);
  return {
    q: Number.isFinite(q) ? Math.min(0.5, Math.max(0.01, q)) : EW_DEFAULT_Q,
    budget: int(s.watchAlertBudget, 1, 20, EW_DEFAULT_BUDGET),
    windowDays: int(s.watchWindowDays, 7, 90, EW_DEFAULT_WINDOW_DAYS),
    triageDays: int(s.watchTriageDays, 1, 30, EW_DEFAULT_TRIAGE_DAYS),
    cooldownDays: int(s.watchCooldownDays, 0, 60, EW_DEFAULT_COOLDOWN_DAYS),
    autoPropagate: s.watchAutoPropagate !== false,
  };
}

/* ------------------------------------------------------------------- scan */

function seriesGaps(points = []) {
  const gaps = [];
  for (const p of points) if (p.value === null) gaps.push(p.date);
  return gaps;
}

function falseAlarmCount(alerts, seriesId, today, lookbackDays) {
  return alerts.filter((a) => a && a.seriesId === seriesId && a.status === 'false-alarm'
    && a.detectedOn && daysBetween(a.detectedOn, today) <= lookbackDays
    && daysBetween(a.detectedOn, today) >= 0).length;
}

/**
 * Reconstruct every monitored series, test it, and run the scan-level FDR
 * procedure. Pure: it reads a state object and returns a plan. Nothing is
 * written here — `earlyWarningRule` applies the plan to a draft.
 */
export function scanWatch(state, now = new Date()) {
  const settings = state?.settings || {};
  const policy = readWatchPolicy(settings);
  const today = dayKey(now) || dayKey(new Date());
  const alerts = Array.isArray(state?.watchAlerts) ? state.watchAlerts.filter(Boolean) : [];

  const series = EW_SERIES_REGISTRY.map((entry) => {
    let built = { points: [], measured: 0, reason: 'No workspace loaded.' };
    try {
      built = buildVitalSeries(state, entry.vital, { asOf: now, buckets: EW_BUCKETS });
    } catch {
      built = { points: [], measured: 0, reason: 'This series could not be reconstructed.' };
    }
    const points = Array.isArray(built.points) ? built.points : [];
    const wanted = entry.vital && built.direction
      ? (built.direction === 'down-good' ? 'lower' : 'higher')
      : 'lower';
    const spc = computeXmR(points.map((p) => ({ date: p.date, label: p.date, value: p.value })), {
      desirableDirection: wanted,
      unit: entry.unit,
      minBound: entry.minBound,
    });
    let latestIndex = -1;
    for (let i = 0; i < points.length; i += 1) if (points[i].value !== null) latestIndex = i;
    const latest = latestIndex >= 0 ? points[latestIndex] : null;
    const latestSignals = spc.available && latestIndex >= 0
      ? spc.signals.filter((s) => s.index === latestIndex)
      : [];
    const strongest = latestSignals.length
      ? [...latestSignals].sort((a, b) => nominalAlpha(a.rule) - nominalAlpha(b.rule))[0]
      : null;
    const pValue = seriesPValue(latestSignals);
    const hasChart = Boolean(spc.available && latest && latest.value !== null);
    const recentAlerts = alerts
      .filter((a) => a && a.seriesId === entry.id && a.status !== 'suppressed')
      .sort((a, b) => String(b.detectedOn).localeCompare(String(a.detectedOn)));
    const noisy = falseAlarmCount(alerts, entry.id, today, EW_NOISE_LOOKBACK_DAYS) >= EW_NOISY_FALSE_ALARMS;
    const openAlert = alerts.find((a) => a && a.seriesId === entry.id && a.status === 'open') || null;
    return {
      id: entry.id,
      vital: entry.vital,
      label: entry.label,
      unit: entry.unit,
      direction: wanted,
      points,
      gaps: seriesGaps(points),
      hasChart,
      chartReason: hasChart ? null : (built.reason || spc.reason || 'Not enough measured history.'),
      measured: spc.measuredCount || 0,
      mean: spc.available ? spc.mean : null,
      unpl: spc.available ? spc.unpl : null,
      lnpl: spc.available ? spc.lnpl : null,
      sigma: spc.available ? spc.sigmaWithin : null,
      movingRange: spc.available ? spc.avgMovingRange : null,
      latestDate: latest ? latest.date : null,
      latestValue: latest ? latest.value : null,
      latestSignals,
      strongestRule: strongest ? strongest.rule : null,
      strongestPolarity: strongest ? strongest.polarity : null,
      strongestSummary: strongest ? strongest.summary : null,
      pValue,
      noisy,
      falseAlarms: falseAlarmCount(alerts, entry.id, today, EW_NOISE_LOOKBACK_DAYS),
      lastAlertOn: recentAlerts[0] ? recentAlerts[0].detectedOn || null : null,
      openAlertId: openAlert ? openAlert.id : null,
    };
  });

  const tested = series.filter((s) => s.hasChart);
  const fdr = benjaminiHochberg(tested.map((s) => s.pValue), policy.q);
  const rejectedSet = new Set(fdr.rejected.map((i) => tested[i].id));
  const rankById = new Map(fdr.ranked.map((row) => [tested[row.index].id, row]));

  // The budget counts alerts a human was actually asked to look at.
  const windowStart = addDays(today, -policy.windowDays);
  const usedInWindow = alerts.filter((a) => a && a.status !== 'suppressed'
    && a.detectedOn && a.detectedOn > windowStart && a.detectedOn <= today).length;

  const candidates = [];
  const promotions = [];
  const suppressions = [];
  let budgetUsed = usedInWindow;

  for (const s of tested) {
    const ranked = rankById.get(s.id) || null;
    const adverse = s.strongestPolarity === 'adverse';
    const rejected = rejectedSet.has(s.id);
    if (!s.strongestRule) continue;
    candidates.push({
      seriesId: s.id,
      label: s.label,
      pValue: s.pValue,
      rank: ranked ? ranked.rank : null,
      threshold: ranked ? ranked.threshold : null,
      rule: s.strongestRule,
      polarity: s.strongestPolarity,
      rejected,
      adverse,
    });
    // Only an adverse signal the procedure rejects is a case for action.
    if (!rejected || !adverse) continue;
    const key = `${s.id}|${today}`;
    if (alerts.some((a) => a && a.seriesId === s.id && a.detectedOn === today)) {
      suppressions.push({ seriesId: s.id, label: s.label, reason: 'cooldown', alreadyRecorded: true, pValue: s.pValue, rank: ranked?.rank ?? null });
      continue;
    }
    if (s.noisy) {
      suppressions.push({ seriesId: s.id, label: s.label, reason: 'noisy-series', pValue: s.pValue, rank: ranked?.rank ?? null });
      continue;
    }
    if (s.lastAlertOn && daysBetween(s.lastAlertOn, today) < policy.cooldownDays) {
      suppressions.push({ seriesId: s.id, label: s.label, reason: 'cooldown', pValue: s.pValue, rank: ranked?.rank ?? null });
      continue;
    }
    if (budgetUsed >= policy.budget) {
      suppressions.push({ seriesId: s.id, label: s.label, reason: 'budget', pValue: s.pValue, rank: ranked?.rank ?? null });
      continue;
    }
    budgetUsed += 1;
    promotions.push({
      seriesId: s.id,
      label: s.label,
      unit: s.unit,
      rule: s.strongestRule,
      polarity: s.strongestPolarity,
      pValue: s.pValue,
      rank: ranked?.rank ?? null,
      threshold: ranked?.threshold ?? null,
      m: fdr.m,
      q: policy.q,
      key,
      latestDate: s.latestDate,
      latestValue: s.latestValue,
      mean: s.mean,
      unpl: s.unpl,
      lnpl: s.lnpl,
      sigma: s.sigma,
      summary: s.strongestSummary,
      frozen: {
        dueOn: addDays(s.latestDate, 7),
        point: s.mean,
        lo: s.lnpl,
        hi: s.unpl,
        baselinePoint: s.latestValue,
        sigma: s.sigma,
      },
    });
  }

  // Always-on forecast ledger: one frozen prediction per series per day, so the
  // detector's skill is measured whether or not it ever alerts.
  const forecasts = [];
  for (const s of tested) {
    if (s.latestValue === null || s.latestDate === null) continue;
    const issuedOn = today;
    if ((state.watchForecasts || []).some((f) => f && f.seriesId === s.id && f.issuedOn === issuedOn)) continue;
    const dueOn = addDays(s.latestDate, 7);
    if (!dueOn) continue;
    forecasts.push({
      seriesId: s.id,
      issuedOn,
      dueOn,
      point: s.mean,
      lo: s.lnpl,
      hi: s.unpl,
      baselinePoint: s.latestValue,
      sigma: s.sigma,
    });
  }

  return {
    engineVersion: EW_ENGINE_VERSION,
    today,
    policy,
    series,
    testedCount: tested.length,
    unavailable: series.filter((s) => !s.hasChart).length,
    fdr,
    candidates,
    promotions,
    suppressions,
    forecasts,
    budget: {
      used: usedInWindow,
      after: budgetUsed,
      cap: policy.budget,
      windowDays: policy.windowDays,
      windowStart,
      remaining: Math.max(0, policy.budget - budgetUsed),
      exhausted: budgetUsed >= policy.budget,
    },
    unreducedSeries: series.filter((s) => !s.hasChart).map((s) => ({ id: s.id, label: s.label, reason: s.chartReason })),
  };
}

/* --------------------------------------------------------------- scoring */

function pointOn(series, date) {
  if (!series || !date) return null;
  const hit = (series.points || []).find((p) => p.date === date);
  return hit && hit.value !== null && Number.isFinite(hit.value) ? hit.value : null;
}

/**
 * Score one frozen prediction against the realised bucket. Withheld when the
 * bucket is unmeasured (no interpolation) or when the naive baseline is exactly
 * right at zero error (skill would divide by zero).
 */
export function scoreFrozen(frozen, observed) {
  if (!frozen || !Number.isFinite(frozen.point) || !Number.isFinite(observed)) {
    return { scored: false, reason: 'unmeasured', observed: null, absErrorModel: null, absErrorNaive: null, skill: null, directionHit: null };
  }
  const absErrorModel = round(Math.abs(observed - frozen.point), 4);
  const absErrorNaive = Number.isFinite(frozen.baselinePoint)
    ? round(Math.abs(observed - frozen.baselinePoint), 4)
    : null;
  const skill = absErrorNaive === null || absErrorNaive === 0
    ? null
    : round(1 - absErrorModel / absErrorNaive, 4);
  const predictedDelta = Number.isFinite(frozen.point) && Number.isFinite(frozen.baselinePoint)
    ? frozen.point - frozen.baselinePoint
    : null;
  const realisedDelta = Number.isFinite(frozen.baselinePoint) ? observed - frozen.baselinePoint : null;
  const directionHit = predictedDelta === null || realisedDelta === null
    ? null
    : (Math.sign(predictedDelta) === Math.sign(realisedDelta));
  return { scored: true, reason: null, observed, absErrorModel, absErrorNaive, skill, directionHit };
}

/** Pooled out-of-sample skill across the forecast ledger. */
export function pooledSkill(rows = [], minScored = EW_MIN_SCORED) {
  const scored = rows.filter((r) => r && r.scored === true && Number.isFinite(r.absErrorModel));
  const withSkill = scored.filter((r) => Number.isFinite(r.skill));
  const n = scored.length;
  const withNaive = scored.filter((r) => Number.isFinite(r.absErrorNaive));
  const mean = (nums) => (nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length, 4) : null);
  const hits = scored.filter((r) => r.directionHit === true).length;
  const reliable = n >= minScored;
  // Pooled suppression: below the floor the counts are reported and every
  // aggregate figure is withheld. Printing a skill score over two predictions
  // is exactly the kind of confident-looking arithmetic this module exists to
  // refuse.
  return {
    scored: n,
    pending: rows.filter((r) => r && r.scored === false && r.reason === 'pending').length,
    unmeasured: rows.filter((r) => r && r.scored === false && r.reason === 'unmeasured').length,
    maeModel: reliable ? mean(scored.map((r) => r.absErrorModel)) : null,
    maeNaive: reliable ? mean(withNaive.map((r) => r.absErrorNaive)) : null,
    meanSkill: reliable ? mean(withSkill.map((r) => r.skill)) : null,
    directionAccuracy: reliable ? round(hits / n, 4) : null,
    reliable,
    label: reliable ? 'measured' : 'counts-only',
    note: reliable
      ? 'Out-of-sample: each prediction was frozen before the week it describes.'
      : `Below the ${minScored}-forecast evidence floor. Counts are shown; no skill figure is claimed.`,
  };
}

/** Alert precision from human verdicts, with a Wilson 95% interval. */
export function alertPrecision(alerts = [], minVerdicts = EW_MIN_VERDICTS) {
  const rows = (Array.isArray(alerts) ? alerts : []).filter(Boolean);
  const confirmed = rows.filter((a) => a.status === 'confirmed').length;
  const falseAlarms = rows.filter((a) => a.status === 'false-alarm').length;
  const explained = rows.filter((a) => a.status === 'explained').length;
  const dismissed = rows.filter((a) => a.status === 'dismissed').length;
  const open = rows.filter((a) => a.status === 'open').length;
  const suppressed = rows.filter((a) => a.status === 'suppressed').length;
  const judged = confirmed + falseAlarms;
  const ci = wilsonInterval(confirmed, judged);
  const reliable = judged >= minVerdicts;
  return {
    confirmed,
    falseAlarms,
    explained,
    dismissed,
    open,
    suppressed,
    judged,
    precision: reliable ? ci.p : null,
    lo: reliable ? ci.lo : null,
    hi: reliable ? ci.hi : null,
    tolerance: EW_PRECISION_TOLERANCE,
    reliable,
    label: reliable ? 'measured' : 'counts-only',
    badlyTuned: reliable && ci.p !== null && ci.p < EW_PRECISION_TOLERANCE,
    note: reliable
      ? `${confirmed} confirmed and ${falseAlarms} false alarm(s) judged by a human. “Explained” and “dismissed” are excluded because neither is a claim about the detector.`
      : `Below the ${minVerdicts}-verdict floor. Verdict counts are shown; no precision figure is claimed.`,
  };
}

/* ---------------------------------------------------------------- report */

function enrichForecast(row, series, today) {
  const due = row.dueOn || null;
  if (!due) return { ...row, scoring: { scored: false, reason: 'unmeasured' } };
  if (due > today) {
    return { ...row, scoring: { scored: false, reason: 'pending' }, daysUntilDue: daysBetween(today, due) };
  }
  const observed = pointOn(series, due);
  if (observed === null) {
    return { ...row, scoring: { scored: false, reason: 'unmeasured', observed: null }, daysUntilDue: 0 };
  }
  return { ...row, daysUntilDue: 0, scoring: scoreFrozen(row, observed) };
}

/** A pure, derived read model of the whole watch. No writes. */
export function buildWatchReport(state, now = new Date()) {
  const scan = scanWatch(state, now);
  const today = scan.today;
  const seriesById = new Map(scan.series.map((s) => [s.id, s]));

  const alerts = (Array.isArray(state?.watchAlerts) ? state.watchAlerts : [])
    .filter(Boolean)
    .map((a) => {
      const series = seriesById.get(a.seriesId) || null;
      const observed = a.frozen && a.frozen.dueOn ? pointOn(series, a.frozen.dueOn) : null;
      const scoring = a.frozen && a.frozen.dueOn
        ? (a.frozen.dueOn > today
            ? { scored: false, reason: 'pending' }
            : (observed === null
                ? { scored: false, reason: 'unmeasured', observed: null }
                : scoreFrozen(a.frozen, observed)))
        : { scored: false, reason: 'unmeasured' };
      return {
        ...a,
        label: series ? series.label : (EW_SERIES_BY_ID.get(a.seriesId) || {}).label || a.seriesId,
        unit: series ? series.unit : '',
        ageDays: a.detectedOn ? daysBetween(a.detectedOn, today) : null,
        scoredForecast: scoring,
      };
    })
    .sort((x, y) => String(y.detectedOn).localeCompare(String(x.detectedOn)) || String(y.id).localeCompare(String(x.id)));

  const queue = alerts.filter((a) => a.status === 'open');
  const forecasts = (Array.isArray(state?.watchForecasts) ? state.watchForecasts : [])
    .filter(Boolean)
    .map((f) => enrichForecast(f, seriesById.get(f.seriesId), today))
    .sort((x, y) => String(y.issuedOn).localeCompare(String(x.issuedOn)) || String(x.seriesId).localeCompare(String(y.seriesId)));
  const skill = pooledSkill(forecasts.map((f) => ({ ...f.scoring })));
  const precision = alertPrecision(alerts);

  const windowStart = scan.budget.windowStart;
  const suppressedInWindow = alerts.filter((a) => a.status === 'suppressed'
    && a.detectedOn && a.detectedOn > windowStart && a.detectedOn <= today);

  return {
    engineVersion: EW_ENGINE_VERSION,
    today,
    policy: scan.policy,
    fdrMethod: EW_FDR_METHOD,
    scan,
    series: scan.series,
    alerts,
    queue,
    forecasts,
    skill,
    precision,
    budget: scan.budget,
    suppressed: {
      total: alerts.filter((a) => a.status === 'suppressed').length,
      inWindow: suppressedInWindow.length,
      byReason: countByReason(suppressedInWindow),
    },
    attention: queue.length,
  };
}

function countByReason(rows) {
  const out = {};
  for (const r of rows) out[r.suppressedReason || 'unknown'] = (out[r.suppressedReason || 'unknown'] || 0) + 1;
  return out;
}

/* --------------------------------------------------------------- signals */

/** Read-side signals for the Insights surface (EW-01..05). */
export function watchSignals(state, now = new Date()) {
  const report = buildWatchReport(state, now);
  const out = [];
  const { queue, precision, skill, suppressed, budget, scan } = report;

  if (queue.length) {
    const oldest = queue.reduce((acc, a) => (acc === null || (a.ageDays || 0) > (acc.ageDays || 0) ? a : acc), null);
    out.push({
      ruleId: 'EW-01',
      domain: 'Early warning',
      title: queue.length === 1
        ? `An early-warning alert on ${queue[0].label} is waiting for your verdict`
        : `${queue.length} early-warning alerts are waiting for your verdict`,
      detail: `Nothing is automated until you judge a signal. The oldest has been open ${oldest?.ageDays ?? 0} day(s). `
        + `The scan tested ${scan.testedCount} series at a ${(scan.policy.q * 100).toFixed(0)}% false-discovery rate and expected about `
        + `${scan.fdr.expectedFalseDiscoveries} false discovery(ies) at this q — which is exactly why your verdict, not the p value, decides what happens next.`,
      severity: (oldest?.ageDays ?? 0) > scan.policy.triageDays ? 4 : 3,
      confidence: 'high',
      evidence: queue.slice(0, 5).map((a) => `${a.label}: ${a.summary || a.rule} (p ${a.pValue}, rank ${a.bhRank ?? '—'} of ${a.m ?? '—'})`),
      action: { label: 'Open the watch', route: '#/watch' },
    });
  }

  if (suppressed.inWindow > 0) {
    out.push({
      ruleId: 'EW-02',
      domain: 'Early warning',
      title: `${suppressed.inWindow} candidate signal(s) were suppressed by a governor`,
      detail: 'Suppression is recorded, not hidden: the budget, the per-series cooldown and the noisy-series rule each stop a real statistical signal from becoming an alert. '
        + 'If this keeps happening, the monitoring policy — not the process — is what needs to change.',
      severity: suppressed.byReason.budget ? 3 : 2,
      confidence: 'high',
      evidence: Object.entries(suppressed.byReason).map(([reason, count]) => `${count} suppressed: ${EW_SUPPRESSION_REASONS[reason] || reason}`),
      action: { label: 'Review the policy', route: '#/watch?tab=policy' },
    });
  }

  if (precision.badlyTuned) {
    out.push({
      ruleId: 'EW-03',
      domain: 'Early warning',
      title: `Your detector is wrong more often than it is right (precision ${Math.round((precision.precision || 0) * 100)}%)`,
      detail: `Of ${precision.judged} judged alerts, ${precision.confirmed} were confirmed and ${precision.falseAlarms} were false alarms `
        + `(Wilson 95% ${Math.round((precision.lo || 0) * 100)}–${Math.round((precision.hi || 0) * 100)}%). `
        + `A detector that is ignored is worse than one that is switched off, so the honest response is to tighten q or narrow the monitored set.`,
      severity: 3,
      confidence: 'high',
      evidence: [`q = ${precision.tolerance} tolerance for measured precision`, `n = ${precision.judged} judged alerts`],
      action: { label: 'Re-tune the detector', route: '#/watch?tab=calibration' },
    });
  }

  const unmeasured = report.forecasts.filter((f) => f.scoring && f.scoring.reason === 'unmeasured').length;
  if (unmeasured > 0) {
    out.push({
      ruleId: 'EW-04',
      domain: 'Early warning',
      title: `${unmeasured} frozen forecast(s) can never be scored`,
      detail: 'The prediction was frozen, the due week arrived, and the workspace has no measured value for that week — usually because nothing was recorded, '
        + 'or because an undated record made the bucket unreconstructable. No value is interpolated: a gap in the record is reported as a gap.',
      severity: 2,
      confidence: 'high',
      evidence: ['Gaps are never interpolated by vitals.js'],
      action: { label: 'Inspect the forecast ledger', route: '#/watch?tab=forecasts' },
    });
  }

  if (skill.reliable && Number.isFinite(skill.meanSkill) && skill.meanSkill < 0) {
    out.push({
      ruleId: 'EW-05',
      domain: 'Early warning',
      title: 'The centre-line forecast is worse than assuming nothing changes',
      detail: `Across ${skill.scored} scored forecasts the mean skill is ${skill.meanSkill} (1 − model error / naive error), `
        + `so the naive "next week looks like this week" rule wins. That is a fact about a 26-point series, not a failure of nerve: `
        + 'the honest conclusion is that these series are close to unpredictable at a one-week horizon.',
      severity: 2,
      confidence: 'medium',
      evidence: [
        `Mean absolute error: model ${skill.maeModel} vs naive ${skill.maeNaive}`,
        `Direction accuracy ${skill.directionAccuracy === null ? '—' : Math.round(skill.directionAccuracy * 100) + '%'}`,
        `Budget used ${budget.used}/${budget.cap} in ${budget.windowDays} days`,
      ],
      action: { label: 'Open the calibration tab', route: '#/watch?tab=calibration' },
    });
  }

  return out;
}

/* ----------------------------------------------------------------- brief */

/** Deterministic board-ready brief. No names, no free text from verdict notes. */
export function watchBrief(state, now = new Date()) {
  const report = buildWatchReport(state, now);
  const { scan, precision, skill, budget } = report;
  const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`);
  const num = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : String(round(v, d)));
  const lines = [
    '# Early-warning watch',
    '',
    `Generated ${report.today} · engine ${report.engineVersion}`,
    '',
    '## Scan',
    `- Series tested: ${scan.testedCount} (${scan.unavailable} not yet reconstructable)`,
    `- False-discovery target q = ${scan.policy.q}; expected false discoveries ≤ ${scan.fdr.expectedFalseDiscoveries}`,
    `- Series the step-up rejected: ${scan.fdr.rejected.length} of ${scan.fdr.m} (cutoff p ≤ ${num(scan.fdr.threshold, 4)})`,
    `- Alerts opened by this scan: ${scan.promotions.length}; suppressed: ${scan.suppressions.length}`,
    `- Alert budget: ${budget.used}/${budget.cap} used in the last ${budget.windowDays} days`,
    '',
    '## Awaiting a human verdict',
  ];
  if (!report.queue.length) {
    lines.push('- None. No signal has been promoted since the last verdict.');
  } else {
    for (const a of report.queue) {
      lines.push(`- ${a.label}: ${a.rule} on ${a.detectedOn}, value ${num(a.latestValue)}, centre ${num(a.mean)}, limits ${num(a.lnpl)}–${num(a.unpl)} (p ${num(a.pValue, 4)}, rank ${a.bhRank ?? '—'}/${a.m ?? '—'}, open ${a.ageDays} d)`);
    }
  }
  lines.push(
    '',
    '## Detector record',
    `- Precision: ${precision.reliable ? `${pct(precision.precision)} (Wilson 95% ${pct(precision.lo)}–${pct(precision.hi)})` : `counts only — ${precision.judged} judged`}`,
    `- Confirmed ${precision.confirmed} · false alarm ${precision.falseAlarms} · explained ${precision.explained} · dismissed ${precision.dismissed} · open ${precision.open} · suppressed ${precision.suppressed}`,
    `- Forecast skill: ${skill.reliable ? `${num(skill.meanSkill, 3)} (n = ${skill.scored}; MAE ${num(skill.maeModel)} vs naive ${num(skill.maeNaive)})` : `counts only — ${skill.scored} scored`}`,
    '',
    '## Method and limits',
    report.fdrMethod,
    '- Nominal α per Shewhart rule: beyond-limit 0.0027, range-spike 0.0027 (normal approximation; the moving-range distribution is skewed), '
      + 'near-limit-cluster 0.0000463 (3 of 4 beyond 2σ, one-sided binomial), sustained-shift 0.0078 (8-run, two-sided).',
    '- Series are reconstructed from dated records; a week with no contributing record is a gap and is never interpolated or scored.',
    '- No case, decision or note is created by a p value. Every cross-module record here exists because a named human recorded a verdict.',
    '- A 26-week series cannot support a multi-week forecast; only the next single weekly bucket is frozen and scored.',
    '',
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ rule */

function clampText(value, max = 300) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: clampText(summary, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  out.push({ ruleId, action, targetType, targetId, summary: clampText(summary, 300) });
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

/** Marker helpers: idempotency lives in text, exactly as the other rules do it. */
function hasMarker(rows, field, marker) {
  return (rows || []).some((row) => row && String(row[field] || '').includes(marker));
}

const EW_TRIGGER_EXACT = new Set([
  'watch.scan',
  'watch.triaged',
  'watch.policy',
  'workspace.import',
  'app.open',
]);
const EW_TRIGGER_PREFIXES = [
  'case.',
  'delegation.',
  'decision.',
  'feedback.',
  'oneonone.',
  'pulse.',
  'recognition.',
  'goal.',
  'negotiation.',
];

function makeDecision(draft, runCtx, { title, question, marker, options, contributors = '' }) {
  const decision = {
    id: runCtx.idFactory('dec'),
    title: clampText(title, 180),
    question: clampText(question, 2000),
    date: runCtx.todayStr,
    reversibility: 'reversible',
    driver: clampText(draft.settings?.leaderName || '', 120),
    approver: '',
    contributors: clampText(contributors, 200),
    informed: '',
    options: options.map((label, i) => ({
      id: runCtx.idFactory('dopt'),
      label: clampText(label, 200),
      pros: '',
      cons: '',
    })),
    chosen: '',
    rationale: '',
    reviewOn: null,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: runCtx.nowIso,
  };
  decision.question = `${decision.question} ${marker}`.slice(0, 2000);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  return decision;
}

/**
 * Post-commit rule (ADR-0008). Sense → govern → respond.
 *
 *   RULE-EW-00  scan every monitored series, run the BH step-up, record
 *               promotions AND suppressions, freeze the next-week prediction
 *   RULE-EW-01  a human-confirmed alert opens exactly one operational case and
 *               one typed `escalates-from` edge; the case engine then cascades
 *   RULE-EW-02  an alert left untriaged past the deadline opens exactly one
 *               DACI decision (drifting is itself a decision)
 *   RULE-EW-03  a scan that exhausted the budget opens exactly one decision on
 *               the monitoring scope, once per window
 *   RULE-EW-04  measured precision below tolerance opens exactly one decision
 *               to re-tune the detector, at most once per quarter
 */
export function earlyWarningRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const triggered = EW_TRIGGER_EXACT.has(event.type)
    || EW_TRIGGER_PREFIXES.some((p) => event.type.startsWith(p));
  if (!triggered) return [];
  if (draft.settings?.watchAutoPropagate === false && event.type !== 'watch.scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];
  draft.watchAlerts = Array.isArray(draft.watchAlerts) ? draft.watchAlerts : [];
  draft.watchForecasts = Array.isArray(draft.watchForecasts) ? draft.watchForecasts : [];

  /* ----- RULE-EW-00 — sense, govern, record ------------------------------ */
  const scan = scanWatch(draft, now);

  for (const promo of scan.promotions) {
    if (draft.watchAlerts.some((a) => a && a.seriesId === promo.seriesId && a.detectedOn === scan.today)) continue;
    const alert = {
      id: runCtx.idFactory('ew'),
      seriesId: promo.seriesId,
      detectedOn: scan.today,
      detectedAt: runCtx.nowIso,
      status: 'open',
      rule: promo.rule,
      polarity: promo.polarity,
      severity: promo.rule === 'sustained-shift' ? 4 : 3,
      pValue: round(promo.pValue, 6),
      bhRank: promo.rank,
      bhThreshold: promo.threshold === null ? null : round(promo.threshold, 6),
      m: promo.m,
      q: promo.q,
      latestValue: promo.latestValue,
      mean: promo.mean,
      unpl: promo.unpl,
      lnpl: promo.lnpl,
      sigma: promo.sigma,
      summary: clampText(promo.summary, 300),
      frozen: promo.frozen,
      triagedOn: null,
      verdictNote: '',
      linkedCaseId: null,
      linkedDecisionId: null,
      suppressedReason: null,
    };
    draft.watchAlerts.push(alert);
    note(runCtx, EW_RULE_IDS.SENSE, 'created', 'alert', alert.id,
      `Promoted ${promo.label} (${promo.rule}, p ${round(promo.pValue, 4)}, rank ${promo.rank}/${promo.m}) to a triage alert`, out);
    pushLink(draft, {
      sourceType: 'alert',
      sourceId: alert.id,
      targetType: 'series',
      targetId: promo.seriesId,
      relation: 'forecasts',
      ruleId: EW_RULE_IDS.SENSE,
      summary: `Frozen next-week prediction ${round(promo.frozen.point, 2)} (${round(promo.frozen.lo, 2)}–${round(promo.frozen.hi, 2)}) due ${promo.frozen.dueOn}`,
    }, runCtx);
  }

  for (const sup of scan.suppressions) {
    if (draft.watchAlerts.some((a) => a && a.seriesId === sup.seriesId && a.detectedOn === scan.today)) continue;
    const alert = {
      id: runCtx.idFactory('ew'),
      seriesId: sup.seriesId,
      detectedOn: scan.today,
      detectedAt: runCtx.nowIso,
      status: 'suppressed',
      rule: null,
      polarity: 'adverse',
      severity: 1,
      pValue: round(sup.pValue, 6),
      bhRank: sup.rank,
      bhThreshold: null,
      m: scan.fdr.m,
      q: scan.policy.q,
      latestValue: null,
      mean: null,
      unpl: null,
      lnpl: null,
      sigma: null,
      summary: `${sup.label}: ${EW_SUPPRESSION_REASONS[sup.reason] || sup.reason}. The statistical signal was real and is recorded here.`,
      frozen: null,
      triagedOn: null,
      verdictNote: '',
      linkedCaseId: null,
      linkedDecisionId: null,
      suppressedReason: sup.reason,
    };
    draft.watchAlerts.push(alert);
    note(runCtx, EW_RULE_IDS.SENSE, 'suppressed', 'alert', alert.id,
      `Suppressed ${sup.label} (${sup.reason}); p ${round(sup.pValue, 4)}`, out);
  }

  for (const f of scan.forecasts) {
    draft.watchForecasts.push({
      id: runCtx.idFactory('ewf'),
      seriesId: f.seriesId,
      issuedOn: f.issuedOn,
      issuedAt: runCtx.nowIso,
      dueOn: f.dueOn,
      point: f.point,
      lo: f.lo,
      hi: f.hi,
      baselinePoint: f.baselinePoint,
      sigma: f.sigma,
      method: 'xmR-centreline',
    });
  }
  // The ledger is bounded: the oldest rows are dropped, never the provenance of
  // a live alert (each alert carries its own frozen copy).
  if (draft.watchForecasts.length > EW_MAX_FORECASTS) {
    draft.watchForecasts = draft.watchForecasts
      .slice()
      .sort((a, b) => String(a.issuedOn).localeCompare(String(b.issuedOn)) || String(a.id).localeCompare(String(b.id)))
      .slice(-EW_MAX_FORECASTS);
  }

  /* ----- RULE-EW-01 — a human verdict is the only trigger for a case ------ */
  for (const alert of draft.watchAlerts.filter((a) => a && a.status === 'confirmed')) {
    if (alert.linkedCaseId && (draft.cases || []).some((c) => c && c.id === alert.linkedCaseId)) continue;
    const series = EW_SERIES_BY_ID.get(alert.seriesId) || { label: alert.seriesId, unit: '' };
    const caseId = runCtx.idFactory('case');
    const severity = alert.severity === 4 ? 7 : 6;
    const newCase = {
      id: caseId,
      title: clampText(`Confirmed early warning: ${series.label}`, 180),
      kind: 'risk',
      status: 'open',
      summary: clampText(
        `A human confirmed a special-cause change on “${series.label}” detected ${alert.detectedOn} `
        + `(${alert.rule}; value ${alert.latestValue}${series.unit ? ` ${series.unit}` : ''}, centre ${alert.mean}, natural limits ${alert.lnpl}–${alert.unpl}; `
        + `series p ${alert.pValue}, Benjamini–Hochberg rank ${alert.bhRank} of ${alert.m} at q ${alert.q}). `
        + `The frozen next-week prediction was ${alert.frozen ? `${alert.frozen.point} (${alert.frozen.lo}–${alert.frozen.hi}) due ${alert.frozen.dueOn}` : 'not recorded'}. `
        + 'The statistical signal alone created nothing; this case exists because a named person judged the signal real.',
        3000,
      ),
      ownerId: null,
      involvedPersonIds: [],
      linkedGoalId: null,
      openedOn: runCtx.todayStr,
      reviewOn: addDays(runCtx.todayStr, draft.settings?.caseReviewDays ?? 14),
      resolvedOn: null,
      resolutionNotes: '',
      fmea: {
        failureMode: clampText(`Undetected process shift in ${series.label}`, 600),
        effect: 'The measured trend continues unmanaged while the leader believes the process is stable',
        severity,
        probability: 6,
        detectability: 4,
        controls: clampText(alert.summary, 600),
        residualSeverity: severity,
        residualProbability: 4,
        residualDetectability: 3,
      },
      rca: {
        problemStatement: clampText(`Confirmed special-cause change on ${series.label}`, 1000),
        whys: [`The ${alert.rule} rule fired on ${alert.detectedOn} and a human confirmed the change`, '', '', '', ''],
        rootCause: '',
        systemicBarrier: '',
        preventiveAction: 'Identify the change that moved the process and decide whether to anchor or reverse it',
      },
      financial: {
        currency: 'USD',
        optimistic: 0,
        mostLikely: 0,
        pessimistic: 0,
        mitigationCost: 0,
        capacityDaysOptimistic: 0,
        capacityDaysMostLikely: 0,
        capacityDaysPessimistic: 0,
        opportunityCost: '',
      },
      stakeholders: [],
      autoPropagate: true,
      createdAt: runCtx.nowIso,
      updatedAt: runCtx.nowIso,
    };
    draft.cases = Array.isArray(draft.cases) ? draft.cases : [];
    draft.cases.push(newCase);
    alert.linkedCaseId = caseId;
    pushLink(draft, {
      sourceType: 'case',
      sourceId: caseId,
      targetType: 'alert',
      targetId: alert.id,
      relation: 'escalates-from',
      ruleId: EW_RULE_IDS.PROMOTE,
      summary: `Case opened from a human-confirmed early warning on ${series.label}`,
    }, runCtx);
    note(runCtx, EW_RULE_IDS.PROMOTE, 'created', 'case', caseId,
      `Opened an operational case from the confirmed alert on ${series.label}`, out);
  }

  /* ----- RULE-EW-02 — an untriaged alert past the deadline is a decision --- */
  for (const alert of draft.watchAlerts.filter((a) => a && a.status === 'open')) {
    const age = alert.detectedOn ? daysBetween(alert.detectedOn, runCtx.todayStr) : 0;
    if (age <= scan.policy.triageDays) continue;
    const marker = `[${EW_RULE_IDS.STALE}:${alert.id}]`;
    if (hasMarker(draft.decisions, 'question', marker)) continue;
    const series = EW_SERIES_BY_ID.get(alert.seriesId) || { label: alert.seriesId, unit: '' };
    const decision = makeDecision(draft, runCtx, {
      title: `Decide what the ${series.label} signal means`,
      question: `An early-warning alert on “${series.label}” has been open ${age} days without a verdict `
        + `(${alert.rule} on ${alert.detectedOn}; series p ${alert.pValue}, rank ${alert.bhRank} of ${alert.m} at q ${alert.q}). `
        + 'An untriaged signal is not neutral: it silently teaches you to ignore the next one. Choose how to close it.',
      marker,
      options: [
        'Confirm it — the process really changed, so open a case',
        'Record it as a false alarm — the detector needs tightening',
        'Explain it — a known cause already handled, no action needed',
        'Stop monitoring this series — the measurement costs more than it is worth',
      ],
    });
    alert.linkedDecisionId = decision.id;
    pushLink(draft, {
      sourceType: 'alert',
      sourceId: alert.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'decides',
      ruleId: EW_RULE_IDS.STALE,
      summary: `Untriaged for ${age} days; escalated into a DACI decision`,
    }, runCtx);
    note(runCtx, EW_RULE_IDS.STALE, 'created', 'decision', decision.id,
      `Escalated the untriaged ${series.label} alert (${age} days) into a decision`, out);
  }

  /* ----- RULE-EW-03 — budget exhaustion is a monitoring-scope decision ---- */
  const exhaustedToday = draft.watchAlerts.filter((a) => a && a.detectedOn === runCtx.todayStr && a.status === 'suppressed' && a.suppressedReason === 'budget');
  if (exhaustedToday.length) {
    const windowKey = `[${EW_RULE_IDS.BUDGET}:${scan.budget.windowStart}]`;
    if (!hasMarker(draft.decisions, 'question', windowKey)) {
      const decision = makeDecision(draft, runCtx, {
        title: 'Decide the monitoring scope: the alert budget is exhausted',
        question: `The watch tested ${scan.testedCount} series and suppressed ${exhaustedToday.length} statistically real candidate(s) because the budget of `
          + `${scan.policy.budget} alert(s) per ${scan.policy.windowDays} days was already spent. Suppression is honest, not harmless: `
          + 'the signal exists and nobody is looking at it. Choose what to change.',
        marker: windowKey,
        options: [
          `Raise the alert budget above ${scan.policy.budget} per ${scan.policy.windowDays} days`,
          'Narrow the monitored series to the few that have ever mattered',
          `Tighten q below ${scan.policy.q} so fewer candidates survive the step-up`,
          'Keep the policy and accept that some real signals will be suppressed',
        ],
      });
      note(runCtx, EW_RULE_IDS.BUDGET, 'created', 'decision', decision.id,
        `Budget exhausted with ${exhaustedToday.length} suppressed candidate(s); opened a monitoring-scope decision`, out);
    }
  }

  /* ----- RULE-EW-04 — the detector grades itself ------------------------- */
  const report = buildWatchReport(draft, now);
  if (report.precision.badlyTuned) {
    const marker = `[${EW_RULE_IDS.PRECISION}:${report.today.slice(0, 7)}]`;
    if (!hasMarker(draft.decisions, 'question', marker)) {
      const decision = makeDecision(draft, runCtx, {
        title: 'Re-tune the early-warning detector',
        question: `Measured precision is ${Math.round((report.precision.precision || 0) * 100)}% `
          + `(${report.precision.confirmed} confirmed, ${report.precision.falseAlarms} false alarm(s); Wilson 95% `
          + `${Math.round((report.precision.lo || 0) * 100)}–${Math.round((report.precision.hi || 0) * 100)}%), below the ${Math.round(EW_PRECISION_TOLERANCE * 100)}% tolerance. `
          + 'A detector that cries wolf costs attention and credibility, so its settings are a decision, not a preference.',
        marker,
        options: [
          `Halve q (currently ${scan.policy.q}) so only stronger signals survive`,
          'Remove the series with the worst verdict record',
          'Keep the detector and treat verdicts as coaching evidence instead',
          'Switch the watch off and keep only a manual chart review',
        ],
      });
      note(runCtx, EW_RULE_IDS.PRECISION, 'created', 'decision', decision.id,
        `Measured precision ${Math.round((report.precision.precision || 0) * 100)}% below tolerance; opened a re-tuning decision`, out);
    }
  }

  return out;
}
