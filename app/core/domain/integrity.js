/**
 * app/core/domain/integrity.js — the Signal Integrity Board read model
 * (Schema v70, ADR-0061).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * Session 95 priced the fact that the weekly scans are *repeated looks at the
 * same records*, and owed a durable statistical review. Session 39 gave one
 * scan (Early warning) a Benjamini–Hochberg step-up *inside* each look. Nobody
 * ever charged the suite as a whole for the number of looks it takes, and
 * nobody measured whether the whole thing is any good: every screen re-runs
 * hundreds of deterministic rules and one p-valued scan, and the workspace
 * kept no record of how often those fired signals were actually right.
 *
 * The Board is two things, and the honesty of the whole module depends on
 * keeping them apart:
 *
 *  1. **The error budget (planned, arithmetic).** A programme that looks K
 *     times and wants a family-wise error rate α must spend α across those
 *     looks, not at each of them. Lan–DeMets (1983) alpha-spending functions
 *     do exactly that and need no joint distribution: the O’Brien–Fleming-like
 *     boundary α*(t) = 2 − 2Φ(z_{α/2}/√t) and the Pocock-like boundary
 *     α*(t) = α·ln(1 + (e−1)t) both satisfy α*(0) = 0 and α*(1) = α, so the
 *     cumulative spend over the planned looks is α by construction. The
 *     *incremental* nominal α of look k is α*(k/K) − α*((k−1)/K); the
 *     Bonferroni-per-test level is that increment over the effective number of
 *     tests. That arithmetic is exact and testable, and it is the number this
 *     module exists to print: what p must today's candidate clear.
 *
 *  2. **The measured truth (empirical).** The leader's own one-way verdicts on
 *     surfaced signals — the same four words the early-warning ledger uses —
 *     are the only ground truth the product will ever have. From them the
 *     Board computes per-family detection precision, actionable precision, a
 *     Wilson (1927) score interval for each, and the number of alerts a leader
 *     must triage to get one worth acting on. Then it compares the measured
 *     figure against what the plan claims, and says which one is wrong.
 *
 * WHAT IS DELIBERATELY REFUSED
 * ----------------------------
 *  - **No p-value is manufactured for a deterministic rule.** A predicate over
 *    the leader's records has no null distribution, so applying Bonferroni to
 *    it would be arithmetic cosplay. Those families are audited by measured
 *    precision instead, and the UI says so on every row.
 *  - **No correlation is estimated.** m_eff = 1 + (m−1)(1−ρ) is a declared
 *    positive-dependence convention (the Galwey/Nyholt approximation), printed
 *    with its ρ sensitivity, because a leadership record cannot identify the
 *    dependence between its own detectors.
 *  - **A look count is a LOWER BOUND when reconstructed.** A day scanned with
 *    no candidate leaves no trace in the alert ledger, so reconstructed looks
 *    under-count the spend and the Board prints that the direction of that
 *    error is optimistic, never safe.
 *  - **No person is ever scored.** A verdict is about a rule, keyed by a
 *    de-identified digest; the ledger stores no name and no person id.
 *
 * Pure module: no DOM, no storage, no network, no Math.random, no wall clock
 * (callers pass `now`). Deterministic.
 */

import { dayKey } from '../time.js';
import {
  INTEGRITY_DEFAULTS,
  INTEGRITY_DOMAIN,
  INTEGRITY_SIGNAL_IDS,
  RHO_SENSITIVITY,
  SIGNAL_FAMILIES,
  SIGNAL_VERDICT_KINDS,
  SPENDING_FUNCTIONS,
  STATISTICAL_FAMILIES,
} from './integrityRegistry.js';

const round = (v, dp = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null);
const pct = (v, dp = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null);

/* --------------------------------------------------------------- normal law */

/**
 * Standard normal CDF. Zelen & Severo's erf approximation (Abramowitz &
 * Stegun 26.2.17), |error| < 1.5e-7 — far tighter than any figure the Board
 * quotes to four decimal places.
 */
export function normalCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/**
 * Inverse standard normal (Acklam 2003, with one Halley refinement). Used for
 * the alpha-spending boundary, so its accuracy is what makes the printed
 * boundary reproducible by hand.
 */
export function normalInv(p) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const plow = 0.02425;
  let q;
  let r;
  let x;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - plow) {
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley step: e = Φ(x) − p, u = e·φ(x), x ← x − u/(1 + x·u/2).
  const e = normalCdf(x) - p;
  const u = e * Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  return x - u / (1 + x * u / 2);
}

/* ------------------------------------------------------------ alpha spending */

/**
 * Cumulative alpha spent by information fraction `t` under a spending function.
 * Both functions are normalised so that α*(1) = α exactly: the programme can
 * never spend more than the leader declared, however many looks it takes,
 * provided it stops at the planned number of looks.
 */
export function alphaSpent(spending, alpha, t) {
  if (!Number.isFinite(alpha) || alpha <= 0) return 0;
  const tt = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (tt === 0) return 0;
  if (spending === 'pocock') return alpha * Math.log(1 + (Math.E - 1) * tt);
  const z = normalInv(1 - alpha / 2);
  if (z === null) return 0;
  return 2 * (1 - normalCdf(z / Math.sqrt(tt)));
}

/**
 * The boundary of one look.
 *
 * Returns the cumulative spend, the increment this look is allowed, the
 * two-sided nominal alpha of the boundary, the z value it corresponds to and —
 * the number the leader actually needs — the per-test p threshold after the
 * effective-number-of-tests correction.
 *
 * A look number beyond the plan spends nothing: the budget is already fully
 * spent, so no further look can buy nominal significance. That is not an error,
 * it is the answer, and `exhausted` says so.
 */
export function lookBoundary({
  spending = 'obf',
  alpha = 0.1,
  plannedLooks = 26,
  lookIndex = 1,
  mEff = 1,
} = {}) {
  const fn = SPENDING_FUNCTIONS.includes(spending) ? spending : 'obf';
  const a = Number.isFinite(alpha) && alpha > 0 ? Math.min(0.5, alpha) : 0.1;
  const K = Number.isFinite(plannedLooks) ? Math.max(2, Math.round(plannedLooks)) : 12;
  const k = Number.isFinite(lookIndex) ? Math.max(1, Math.round(lookIndex)) : 1;
  const m = Number.isFinite(mEff) && mEff >= 1 ? mEff : 1;
  if (k > K) {
    return {
      lookIndex: k,
      plannedLooks: K,
      informationFraction: 1,
      cumulativeAlpha: a,
      nominalAlpha: 0,
      zBoundary: null,
      sideP: 0,
      perTestThreshold: 0,
      effectivelyUnreachable: true,
      exhausted: true,
      spending: fn,
    };
  }
  const t = k / K;
  const cumulative = alphaSpent(fn, a, t);
  const previous = alphaSpent(fn, a, (k - 1) / K);
  const nominal = Math.max(0, cumulative - previous);
  const z = nominal > 0 ? normalInv(1 - nominal / 2) : null;
  const sideP = nominal / 2;
  return {
    lookIndex: k,
    plannedLooks: K,
    informationFraction: round(t, 6),
    cumulativeAlpha: cumulative,
    nominalAlpha: nominal,
    zBoundary: z === null ? null : round(z, 4),
    sideP,
    perTestThreshold: round(Math.min(1, nominal / m), 10),
    // O’Brien–Fleming’s early boundaries are so small at a realistic look
    // count that no leader will ever clear one: below 1e-6 of nominal alpha
    // (a two-sided boundary beyond |z| ≈ 4.9) the boundary is not a bar, it is
    // a formality. That is the function working as designed, and the Board says
    // "unreachable" instead of printing a number nobody can use.
    effectivelyUnreachable: nominal < 1e-6,
    exhausted: false,
    spending: fn,
  };
}

/* ------------------------------------------------------- multiplicity reading */

/**
 * Effective number of tests under a declared positive dependence. With
 * equipositive correlation ρ the Galwey/Nyholt approximation collapses m
 * correlated tests to 1 + (m−1)(1−ρ) independent ones. It is a convention, not
 * an estimate: this product has no way to identify the dependence between its
 * own detectors, and inventing one would be the failure mode the Board exists
 * to prevent.
 */
export function effectiveTests(m, rho = 0.3) {
  const mm = Number.isFinite(m) ? Math.max(1, m) : 1;
  const r = Number.isFinite(rho) ? Math.min(0.95, Math.max(0, rho)) : 0.3;
  return round(1 + (mm - 1) * (1 - r), 4);
}

/** Šidák adjusted p under the effective count — exact when tests are independent. */
export function sidakAdjusted(p, mEff = 1) {
  if (!Number.isFinite(p)) return 1;
  const m = Number.isFinite(mEff) && mEff >= 1 ? mEff : 1;
  return Math.min(1, 1 - (1 - Math.min(1, Math.max(0, p))) ** m);
}

/** Bonferroni adjusted p — the conservative bound that needs no assumption. */
export function bonferroniAdjusted(p, m = 1) {
  if (!Number.isFinite(p)) return 1;
  const mm = Number.isFinite(m) && m >= 1 ? m : 1;
  return Math.min(1, Math.max(0, p) * mm);
}

/* ------------------------------------------------------------------ precision */

/** Wilson score interval for a binomial proportion (Wilson 1927, no continuity correction). */
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

export function integrityConventions(settings = {}) {
  const s = settings || {};
  const d = INTEGRITY_DEFAULTS;
  const num = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const alphaPct = num(s.integrityAlphaPct, 1, 50, d.integrityAlphaPct);
  const plannedLooks = Math.round(num(s.integrityPlannedLooks, 2, 260, d.integrityPlannedLooks));
  return {
    autoPropagate: s.integrityAutoPropagate !== false,
    alphaPct,
    alpha: alphaPct / 100,
    plannedLooks,
    spending: SPENDING_FUNCTIONS.includes(s.integritySpending) ? s.integritySpending : d.integritySpending,
    rhoPct: num(s.integrityRhoPct, 0, 90, d.integrityRhoPct),
    rho: num(s.integrityRhoPct, 0, 90, d.integrityRhoPct) / 100,
    precisionFloorPct: num(s.integrityPrecisionFloorPct, 20, 95, d.integrityPrecisionFloorPct),
    minVerdicts: Math.round(num(s.integrityMinVerdicts, 2, 40, d.integrityMinVerdicts)),
    spendWarnPct: num(s.integritySpendWarnPct, 50, 100, d.integritySpendWarnPct),
    looksWarnPct: num(s.integrityLooksWarnPct, 5, 90, d.integrityLooksWarnPct),
    surpriseBrier: num(s.integritySurpriseBrier, 0.05, 0.49, d.integritySurpriseBrier),
    horizonAlerts: Math.round(num(s.integrityHorizonAlerts, 1, 40, d.integrityHorizonAlerts)),
    reviewCap: Math.round(num(s.integrityReviewCap, 5, 20, d.integrityReviewCap)),
    lookCap: Math.round(num(s.integrityLookCap, 60, 400, d.integrityLookCap)),
    verdictCap: Math.round(num(s.integrityVerdictCap, 100, 1200, d.integrityVerdictCap)),
  };
}

/* --------------------------------------------------------- instance identity */

/**
 * A de-identified digest for one surfaced finding.
 *
 * The ledger must be able to tell one firing from another without ever storing
 * a person's id or a finding's title — a verdict is about a rule, and a table of
 * rules keyed by names would be a table of people. Two FNV-1a passes with
 * different salts give 16 hex characters, which is ample to separate the few
 * hundred findings a workspace will ever hold. This is de-identification for
 * readability, NOT a security control: it is not keyed, and it is not a hash of
 * anything secret.
 */
export function signalInstanceKey({ ruleId = '', day = '', title = '', personId = '' } = {}) {
  const raw = `${ruleId}|${day}|${personId}|${title}`;
  const fnv = (input, seed) => {
    let hash = seed >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `${fnv(raw, 0x811c9dc5)}${fnv(raw, 0x01000193)}`;
}

/* -------------------------------------------------------- verdict observation */

const WATCH_VERDICT_MAP = Object.freeze({
  confirmed: 'confirmed',
  explained: 'explained',
  dismissed: 'dismissed',
  'false-alarm': 'false-alarm',
});

/**
 * Every verdict the workspace holds, in one shape: the early-warning ledger's
 * human verdicts (family `Early warning`, surfaced iff it was promoted) plus
 * the Board's own cross-family verdicts. `surfaced` distinguishes an alert the
 * leader was actually shown from a suppressed candidate, because grading a
 * forecast about "the next alerts" must not count a candidate nobody saw.
 */
export function collectVerdictObservations(state) {
  const rows = [];
  for (const alert of state?.watchAlerts || []) {
    if (!alert || !WATCH_VERDICT_MAP[alert.status]) continue;
    rows.push({
      domain: 'Early warning',
      ruleId: alert.rule || 'EW',
      verdict: WATCH_VERDICT_MAP[alert.status],
      day: alert.detectedOn || (alert.detectedAt || '').slice(0, 10) || null,
      recordedAt: alert.triagedAt || alert.detectedAt || null,
      surfaced: alert.status !== 'suppressed',
      source: 'watch',
    });
  }
  for (const row of state?.signalVerdicts || []) {
    if (!row || !SIGNAL_VERDICT_KINDS[row.verdict]) continue;
    rows.push({
      domain: row.domain,
      ruleId: row.ruleId || '',
      verdict: row.verdict,
      day: row.day || (row.recordedAt || '').slice(0, 10) || null,
      recordedAt: row.recordedAt || null,
      surfaced: true,
      source: 'board',
    });
  }
  return rows;
}

/**
 * Score one family. Two precisions, because they answer different questions:
 *   - detection precision: of the signals judged, how many described a real
 *     change? (`explained` and `dismissed` are real changes, just not news)
 *   - actionable precision: of the signals judged, how many were worth acting
 *     on? That is the one that decides whether to keep the detector.
 * Below the declared verdict floor nothing is claimed: counts only.
 */
export function scoreFamily(domain, observations, conventions = integrityConventions({})) {
  const rows = (observations || []).filter((o) => o && o.domain === domain);
  const counts = { confirmed: 0, explained: 0, dismissed: 0, 'false-alarm': 0 };
  for (const row of rows) if (counts[row.verdict] !== undefined) counts[row.verdict] += 1;
  const n = rows.length;
  const trueCount = counts.confirmed + counts.explained + counts.dismissed;
  const falseCount = counts['false-alarm'];
  const detection = wilsonInterval(trueCount, n);
  // Actionable precision excludes the real-but-known and real-but-trivial
  // signals from the denominator: it asks what share of the two decisive
  // verdicts was worth a leader's time.
  const decisive = counts.confirmed + falseCount;
  const actionable = wilsonInterval(counts.confirmed, decisive);
  const floor = conventions.precisionFloorPct / 100;
  let status = 'unscored';
  if (n > 0) status = 'insufficient';
  if (n >= conventions.minVerdicts && actionable.p !== null) {
    if (actionable.hi !== null && actionable.hi < floor) status = 'over-claiming';
    else if (actionable.lo !== null && actionable.lo >= floor) status = 'calibrated';
    else status = 'indeterminate';
  }
  return {
    domain,
    n,
    counts,
    trueCount,
    falseCount,
    decisive,
    detection,
    actionable,
    status,
    statusLabel: status,
    // How many alerts a leader must read to get one worth acting on. Withheld
    // when there is nothing to divide by, never printed as Infinity.
    nnAlert: actionable.p && actionable.p > 0 ? Math.ceil(1 / actionable.p) : null,
    // The same figure read through the interval: best case = ceil(1/upper),
    // worst case = ceil(1/lower). Printed so a leader can see how little a
    // small sample actually pins down.
    nnAlertRange: actionable.lo && actionable.hi
      ? { best: Math.ceil(1 / actionable.hi), worst: Math.ceil(1 / actionable.lo) }
      : null,
    lastVerdictOn: rows.map((r) => r.day).filter(Boolean).sort().at(-1) || null,
  };
}

/* --------------------------------------------------------------- look ledger */

const pValuesOf = (alert) => (typeof alert?.pValue === 'number' && Number.isFinite(alert.pValue)
  && alert.pValue >= 0 && alert.pValue <= 1 ? alert.pValue : null);

/**
 * Reconstruct looks from the alert ledger. Every recorded candidate — promoted
 * or suppressed — proves the detectors ran that day. A day that produced no
 * candidate leaves no trace, which is why the reported look count is a lower
 * bound whenever it is built this way; the report carries that flag and the UI
 * prints it beside the number.
 */
export function reconstructLooks(state) {
  const byDay = new Map();
  for (const alert of state?.watchAlerts || []) {
    if (!alert || !alert.detectedOn) continue;
    const p = pValuesOf(alert);
    if (p === null) continue;
    const entry = byDay.get(alert.detectedOn) || {
      lookOn: alert.detectedOn,
      seriesTested: 0,
      candidates: 0,
      promoted: 0,
      pValues: [],
    };
    entry.seriesTested = Math.max(entry.seriesTested, Number(alert.m) || 0);
    entry.candidates += 1;
    if (alert.status !== 'suppressed') entry.promoted += 1;
    entry.pValues.push(p);
    byDay.set(alert.detectedOn, entry);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.lookOn < b.lookOn ? -1 : a.lookOn > b.lookOn ? 1 : 0))
    .map((row) => ({ ...row, source: 'reconstructed', alphaPctAtLook: null }));
}

/**
 * The merged ledger. A durably recorded look wins over a reconstruction of the
 * same day, because the record knows the plan that was in force; the
 * reconstruction only knows the p values.
 */
export function buildLookLedger(state, now, settings = {}) {
  const conventions = integrityConventions(settings);
  const recorded = (state?.integrityLooks || []).map((row) => ({ ...row, source: row.source || 'scan' }));
  const recordedDays = new Set(recorded.map((row) => row.lookOn));
  const reconstructed = reconstructLooks(state).filter((row) => !recordedDays.has(row.lookOn));
  const merged = [...recorded, ...reconstructed]
    .sort((a, b) => (a.lookOn < b.lookOn ? -1 : a.lookOn > b.lookOn ? 1 : 0));

  const mEff = (m) => effectiveTests(m, conventions.rho);
  return merged.map((row, index) => {
    const seriesTested = Number(row.seriesTested) || 0;
    const plan = row.alphaPctAtLook !== null && row.alphaPctAtLook !== undefined
      ? {
        alpha: row.alphaPctAtLook / 100,
        alphaPct: row.alphaPctAtLook,
        plannedLooks: row.plannedLooksAtLook || conventions.plannedLooks,
        spending: row.spendingAtLook || conventions.spending,
      }
      : { alpha: conventions.alpha, alphaPct: conventions.alphaPct, plannedLooks: conventions.plannedLooks, spending: conventions.spending };
    const mEffValue = mEff(seriesTested > 0 ? seriesTested : 1);
    const boundary = lookBoundary({
      spending: plan.spending,
      alpha: plan.alpha,
      plannedLooks: plan.plannedLooks,
      lookIndex: index + 1,
      mEff: mEffValue,
    });
    const survivors = (row.pValues || []).filter((p) => p <= boundary.perTestThreshold);
    const minP = (row.pValues || []).length ? Math.min(...row.pValues) : null;
    return {
      id: row.id || `look-${row.lookOn}`,
      lookOn: row.lookOn,
      source: row.source,
      seriesTested,
      candidates: Number(row.candidates) || 0,
      promoted: Number(row.promoted) || 0,
      pValues: row.pValues || [],
      minP: minP === null ? null : round(minP, 6),
      planInForce: Boolean(row.alphaPctAtLook !== null && row.alphaPctAtLook !== undefined),
      alphaPct: plan.alphaPct,
      plannedLooks: plan.plannedLooks,
      spending: plan.spending,
      lookIndex: index + 1,
      mEff: mEffValue,
      boundary,
      survivors: survivors.length,
      survivorPValues: survivors.map((p) => round(p, 6)),
      weakestSurvivor: survivors.length ? round(Math.max(...survivors), 6) : null,
      note: row.note || '',
    };
  });
}

/* -------------------------------------------------------------------- report */

export function buildIntegrityReview(report, {
  id,
  label = '',
  reviewOn,
  horizonAlerts = null,
  nowIso,
} = {}) {
  const pooled = report.precision.pooled;
  if (!pooled || !pooled.n) {
    return {
      ok: false,
      error: 'The Board cannot freeze a false-discovery claim with no verdicts. Record a few signal verdicts first — a forecast with no evidence behind it is a guess with a date on it.',
    };
  }
  const horizon = Number.isFinite(Number(horizonAlerts))
    ? Math.round(Number(horizonAlerts)) : report.conventions.horizonAlerts;
  const fdr = (pooled.falseAlarmPct || 0) / 100;
  const predicted = 1 - (1 - fdr) ** Math.max(1, horizon);
  const record = {
    id,
    label: label || `Signal integrity review — ${String(nowIso).slice(0, 10)}`,
    frozenAt: nowIso,
    reviewOn,
    alphaPct: report.conventions.alphaPct,
    plannedLooks: report.conventions.plannedLooks,
    spending: report.conventions.spending,
    looksUsed: report.looks.used,
    cumulativeAlphaPct: pct(report.looks.cumulativeAlpha * 100, 2),
    perTestThreshold: report.looks.nextBoundary.perTestThreshold,
    seriesTested: report.looks.seriesTested,
    mEff: report.looks.mEff,
    verdictsScored: pooled.n,
    familiesScored: report.precision.scoredFamilies,
    pooledDetectionPct: pooled.detectionPct,
    pooledActionablePct: pooled.actionablePct,
    pooledFalseAlarmPct: pooled.falseAlarmPct,
    familyStatuses: report.precision.families
      .filter((row) => row.n > 0)
      .slice(0, 16)
      .map((row) => ({
        domain: row.domain,
        n: row.n,
        actionablePct: row.actionable.p === null ? null : pct(row.actionable.p * 100, 1),
        status: row.status,
      })),
    horizonAlerts: horizon,
    predictedAnyFalseAlarmPct: pct(predicted * 100, 2),
    graded: null,
    challengeNotes: [],
  };
  return { ok: true, record };
}

/**
 * Grade a frozen review once, from the verdicts recorded in its window.
 * The claim is about the *next* `horizonAlerts` signals that were surfaced; the
 * grader therefore counts surfaced observations dated strictly after the freeze
 * day and on or before the review day, and is ungradable with none.
 */
export function gradeIntegrityReview(review, state, now = new Date()) {
  if (!review) return null;
  const frozenDay = String(review.frozenAt).slice(0, 10);
  const today = dayKey(now);
  if (review.reviewOn > today) return null;
  const observations = collectVerdictObservations(state)
    .filter((o) => o.surfaced && o.day && o.day > frozenDay && o.day <= review.reviewOn);
  if (!observations.length) return null;
  const falseAlarms = observations.filter((o) => o.verdict === 'false-alarm').length;
  const anyFalse = falseAlarms > 0;
  const predicted = review.predictedAnyFalseAlarmPct / 100;
  return {
    gradedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    anyFalse,
    scored: observations.length,
    falseAlarms,
    brier: round((predicted - (anyFalse ? 1 : 0)) ** 2, 6),
  };
}

export function pooledPrecision(observations, conventions) {
  const rows = observations || [];
  const n = rows.length;
  const falseCount = rows.filter((r) => r.verdict === 'false-alarm').length;
  const trueCount = n - falseCount;
  const confirmed = rows.filter((r) => r.verdict === 'confirmed').length;
  const detection = wilsonInterval(trueCount, n);
  const actionable = wilsonInterval(confirmed, confirmed + falseCount);
  return {
    n,
    trueCount,
    falseCount,
    confirmed,
    detectionPct: detection.p === null ? null : pct(detection.p * 100, 1),
    detectionLoPct: detection.lo === null ? null : pct(detection.lo * 100, 1),
    detectionHiPct: detection.hi === null ? null : pct(detection.hi * 100, 1),
    actionablePct: actionable.p === null ? null : pct(actionable.p * 100, 1),
    actionableLoPct: actionable.lo === null ? null : pct(actionable.lo * 100, 1),
    actionableHiPct: actionable.hi === null ? null : pct(actionable.hi * 100, 1),
    falseAlarmPct: n ? pct((falseCount / n) * 100, 1) : null,
    ready: n >= (conventions?.minVerdicts || INTEGRITY_DEFAULTS.integrityMinVerdicts),
  };
}

/**
 * The whole Board. `findings` is optional: the view passes today's
 * `buildInsights` output so the inventory can show what each family fired
 * today; the API omits it, and every `firedToday` cell then reads `null`
 * ("not evaluated here") rather than `0` ("fired nothing"), because those are
 * different statements.
 */
export function integrityReport(state, now = new Date(), settingsOverride = null, findings = null) {
  const settings = settingsOverride || state?.settings || {};
  const conventions = integrityConventions(settings);
  const today = dayKey(now);
  const observations = collectVerdictObservations(state);
  const families = SIGNAL_FAMILIES.map((family) => {
    const score = scoreFamily(family.domain, observations, conventions);
    const fired = Array.isArray(findings)
      ? findings.filter((f) => f && f.domain === family.domain).length
      : null;
    return { ...family, ...score, firedToday: fired };
  });

  const looks = buildLookLedger(state, now, settings);
  const used = looks.length;
  const seriesTested = looks.length ? Math.max(...looks.map((l) => l.seriesTested || 0)) : 0;
  const mEff = effectiveTests(seriesTested || 0, conventions.rho);
  const nextBoundary = lookBoundary({
    spending: conventions.spending,
    alpha: conventions.alpha,
    plannedLooks: conventions.plannedLooks,
    lookIndex: used + 1,
    mEff,
  });
  // Nothing has been looked at, so nothing has been spent. Reporting the first
  // look's increment against a look count of zero would claim a spend for a look
  // that never happened.
  const cumulativeAlpha = used === 0 ? 0 : lookBoundary({
    spending: conventions.spending,
    alpha: conventions.alpha,
    plannedLooks: conventions.plannedLooks,
    lookIndex: Math.min(used, conventions.plannedLooks),
    mEff,
  }).cumulativeAlpha;
  const latestLook = looks.at(-1) || null;
  const reconstructedDays = looks.filter((l) => l.source === 'reconstructed').length;

  const pooled = pooledPrecision(observations, conventions);
  const scoredFamilies = families.filter((f) => f.n >= conventions.minVerdicts);
  const overClaiming = families.filter((f) => f.status === 'over-claiming');
  const calibrated = families.filter((f) => f.status === 'calibrated');
  const unscored = families.filter((f) => f.n === 0);

  const reviews = (state?.integrityReviews || []).slice(0, conventions.reviewCap);
  const due = reviews.filter((r) => !r.graded && r.reviewOn <= today);
  const pending = reviews.filter((r) => !r.graded && r.reviewOn > today);
  const graded = reviews.filter((r) => r.graded);
  const surprise = graded.filter((r) => r.graded.brier >= conventions.surpriseBrier);
  const meanBrier = graded.length
    ? round(graded.reduce((n, r) => n + r.graded.brier, 0) / graded.length, 4) : null;
  const baseRate = graded.length
    ? graded.reduce((n, r) => n + r.predictedAnyFalseAlarmPct / 100, 0) / graded.length : null;
  const naiveBrier = graded.length
    ? round(graded.reduce((n, r) => {
      const actual = r.graded.anyFalse ? 1 : 0;
      return n + (baseRate - actual) ** 2;
    }, 0) / graded.length, 4) : null;

  const rhoSensitivity = RHO_SENSITIVITY.map((rho) => {
    const mEffValue = effectiveTests(seriesTested || 0, rho);
    const b = lookBoundary({
      spending: conventions.spending,
      alpha: conventions.alpha,
      plannedLooks: conventions.plannedLooks,
      lookIndex: used + 1,
      mEff: mEffValue,
    });
    return { rho, mEff: mEffValue, perTestThreshold: b.perTestThreshold };
  });

  const spendPct = conventions.alpha > 0 ? (cumulativeAlpha / conventions.alpha) * 100 : 0;
  const lookPct = (Math.max(used, 1) / conventions.plannedLooks) * 100;

  return {
    today,
    conventions,
    suite: {
      families: SIGNAL_FAMILIES.length,
      ruleFamilies: SIGNAL_FAMILIES.length - STATISTICAL_FAMILIES.length,
      statisticalFamilies: STATISTICAL_FAMILIES.length,
      statisticalDomains: STATISTICAL_FAMILIES,
      findingsToday: Array.isArray(findings) ? findings.length : null,
      domainsFiringToday: Array.isArray(findings)
        ? new Set(findings.map((f) => f && f.domain).filter(Boolean)).size : null,
      unscoredFamilies: unscored.length,
    },
    looks: {
      rows: looks,
      used,
      planned: conventions.plannedLooks,
      remaining: Math.max(0, conventions.plannedLooks - used),
      seriesTested,
      mEff,
      cumulativeAlpha,
      cumulativeAlphaPct: pct(cumulativeAlpha * 100, 2),
      remainingAlpha: Math.max(0, conventions.alpha - cumulativeAlpha),
      remainingAlphaPct: pct(Math.max(0, conventions.alpha - cumulativeAlpha) * 100, 2),
      spendPct: pct(spendPct, 1),
      lookPct: pct(lookPct, 1),
      nextBoundary,
      latestLook,
      reconstructedDays,
      lowerBound: reconstructedDays > 0,
      exhausted: nextBoundary.exhausted,
      overrun: used > conventions.plannedLooks,
      rhoSensitivity,
    },
    precision: {
      observations,
      pooled,
      families: families.filter((f) => f.n > 0).sort((a, b) => b.n - a.n),
      overClaiming,
      calibrated,
      scoredFamilies: scoredFamilies.length,
      minVerdicts: conventions.minVerdicts,
      floorPct: conventions.precisionFloorPct,
    },
    reviews: {
      all: reviews,
      due,
      pending,
      graded,
      surprise,
      meanBrier,
      naiveBrier,
      baseRatePct: baseRate === null ? null : pct(baseRate * 100, 1),
      skillPct: meanBrier !== null && naiveBrier !== null && naiveBrier > 0
        ? pct((1 - meanBrier / naiveBrier) * 100, 1) : null,
      minGraded: 3,
    },
    inventory: families,
    signals: integritySignals(state, now, settings, findings),
    attentionCount: integrityAttentionCount(state, now, settings),
  };
}

/* ------------------------------------------------------------------- signals */

/**
 * Signals the recommendation engine shows. They read only records the Board
 * writes — never `buildInsights` — so the nav badge is cheap and cannot recurse
 * into the engine that calls it.
 */
export function integritySignals(state, now = new Date(), settings = null, findings = null) {
  const s = settings || state?.settings || {};
  const conventions = integrityConventions(s);
  const today = dayKey(now);
  const observations = collectVerdictObservations(state);
  const looks = buildLookLedger(state, now, s);
  const out = [];

  const used = looks.length;
  const seriesTested = looks.length ? Math.max(...looks.map((l) => l.seriesTested || 0)) : 0;
  const mEff = effectiveTests(seriesTested || 0, conventions.rho);
  const boundary = lookBoundary({
    spending: conventions.spending,
    alpha: conventions.alpha,
    plannedLooks: conventions.plannedLooks,
    lookIndex: used + 1,
    mEff,
  });
  const spentCumulative = lookBoundary({
    spending: conventions.spending,
    alpha: conventions.alpha,
    plannedLooks: conventions.plannedLooks,
    lookIndex: Math.min(Math.max(used, 1), conventions.plannedLooks),
    mEff,
  }).cumulativeAlpha;
  const spendPct = conventions.alpha > 0 ? (spentCumulative / conventions.alpha) * 100 : 0;
  const lookPct = (Math.max(used, 1) / conventions.plannedLooks) * 100;

  const remainingLookPct = 100 - lookPct;
  if (used > 0 && spendPct >= conventions.spendWarnPct && remainingLookPct >= conventions.looksWarnPct) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.ALPHA_EXHAUSTED,
      domain: 'Signal integrity',
      title: `${Math.round(spendPct)}% of the error budget is gone with ${Math.round(remainingLookPct)}% of the planned looks still to run`,
      detail: `The ${conventions.spending === 'pocock' ? 'Pocock-like' : 'O’Brien–Fleming-like'} boundary at look ${used} of ${conventions.plannedLooks} has already spent ${pct(spentCumulative * 100, 2)} of the declared ${conventions.alphaPct}% family-wise error budget, and ${conventions.looksWarnPct}% or more of the plan is still to run. Every further look must now clear a stricter bar than the one before it. That is the arithmetic working, not failing — but if the plan was meant to last ${conventions.plannedLooks} looks, the plan and the practice disagree.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `Looks recorded: ${used} of ${conventions.plannedLooks} planned`,
        `Cumulative alpha spent: ${pct(spentCumulative * 100, 2)}% of ${conventions.alphaPct}%`,
        `Next look's per-test threshold: p < ${boundary.perTestThreshold}`,
      ],
      action: { label: 'Open the Signal Integrity Board', route: '#/integrity' },
    });
  }

  const scored = SIGNAL_FAMILIES
    .map((f) => scoreFamily(f.domain, observations, conventions))
    .filter((f) => f.status === 'over-claiming');
  if (scored.length) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.OVER_CLAIMS,
      domain: 'Signal integrity',
      title: `${scored.length} signal famil${scored.length === 1 ? 'y is' : 'ies are'} measured below the declared precision floor`,
      detail: `A family is judged over-claiming only when the upper end of its Wilson 95% interval for actionable precision sits below the ${conventions.precisionFloorPct}% floor — so this is a conclusion the sample supports, not a hunch about a small count. The families are named in the evidence, and the fix is a settings decision or an honest retirement, not a new dashboard.`,
      severity: 4,
      confidence: 'high',
      evidence: scored.slice(0, 5).map((f) => `${f.domain}: ${f.counts.confirmed} of ${f.decisive} decisive verdicts actionable (${pct((f.actionable.p || 0) * 100, 1)}%, 95% CI ${pct((f.actionable.lo || 0) * 100, 1)}–${pct((f.actionable.hi || 0) * 100, 1)}%; n=${f.n})`),
      action: { label: 'Review the verdict ledger', route: '#/integrity?panel=verdicts' },
    });
  }

  // A suite that is surfacing findings nobody has judged is the single most
  // common state this Board will ever be in, so it is signalled on the
  // findings the engine actually produced — not on the look count, which is
  // zero on the first day a leader opens the app.
  // A setup nudge is not a detected condition, so it is not something a leader
  // can judge a detector on. Only a finding that reports something about the
  // workspace counts as a signal nobody has graded.
  const unjudged = Array.isArray(findings)
    ? findings.filter((f) => f && f.domain !== INTEGRITY_DOMAIN
      && f.ruleId !== 'SETUP-01' && Number(f.severity) >= 2).length
    : 0;
  if (observations.length === 0 && (unjudged > 0 || used > 0)) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.UNSCORED,
      domain: 'Signal integrity',
      title: 'The detector suite has never been graded',
      detail: `${SIGNAL_FAMILIES.length} signal families are registered here and ${unjudged > 0 ? `${unjudged} finding(s) are waiting on this screen right now` : `${used} look(s) have been recorded`}, but not one verdict exists. Until a leader judges a few of them, the only honest precision figure on the Board is "unknown" — and the error budget is being spent on a procedure nobody has measured.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `${SIGNAL_FAMILIES.length} signal families registered, 0 verdicts recorded`,
        unjudged > 0 ? `${unjudged} finding(s) awaiting a verdict today` : `${used} look(s) recorded`,
        'A verdict is one click on any finding card and covers the rule, never a person',
      ],
      action: { label: 'Judge today’s signals', route: '#/integrity?panel=verdicts' },
    });
  }

  const due = (state?.integrityReviews || []).filter((r) => r && !r.graded && r.reviewOn <= today);
  if (due.length) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.REVIEW_DUE,
      domain: 'Signal integrity',
      title: `${due.length} frozen signal-integrity review${due.length === 1 ? ' is' : 's are'} past their review date`,
      detail: 'A frozen review is a claim the leader made about the next alerts before the verdicts landed. Grading it is the only thing that turns the Board from a report into a calibration record.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 3).map((r) => `${r.label || r.id}: frozen ${String(r.frozenAt).slice(0, 10)}, review due ${r.reviewOn}, predicted ${r.predictedAnyFalseAlarmPct}% chance of at least one false alarm in the next ${r.horizonAlerts}`),
      action: { label: 'Grade the signal reviews', route: '#/integrity?panel=ledger' },
    });
  }

  const surprises = (state?.integrityReviews || [])
    .filter((r) => r && r.graded && r.graded.brier >= conventions.surpriseBrier);
  if (surprises.length) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.SURPRISE,
      domain: 'Signal integrity',
      title: `${surprises.length} graded signal review${surprises.length === 1 ? '' : 's'} missed by a wide margin`,
      detail: `A Brier score at or above ${conventions.surpriseBrier} means the frozen probability and what happened were far apart. The Board treats that as a process finding about the detector suite, never as a person's mistake.`,
      severity: 2,
      confidence: 'high',
      evidence: surprises.slice(0, 3).map((r) => `${r.label || r.id}: predicted ${r.predictedAnyFalseAlarmPct}%, observed ${r.graded.anyFalse ? 'at least one false alarm' : 'no false alarms'}, Brier ${r.graded.brier}`),
      action: { label: 'Read the graded reviews', route: '#/integrity?panel=ledger' },
    });
  }

  if (used > conventions.plannedLooks) {
    out.push({
      ruleId: INTEGRITY_SIGNAL_IDS.LOOKS_OVERRUN,
      domain: 'Signal integrity',
      title: `The programme has taken ${used} looks against a plan of ${conventions.plannedLooks}`,
      detail: `The spending function is normalised so that α*(1) = α. Past the planned number of looks there is nothing left to spend, so the Board will not grant any further nominal significance. Either declare a longer plan, widen α, or stop looking — those are the three honest options.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `Looks recorded: ${used}; planned: ${conventions.plannedLooks}`,
        `Cumulative alpha: ${pct(spentCumulative * 100, 2)}% of ${conventions.alphaPct}%`,
        'The error budget does not renew itself',
      ],
      action: { label: 'Re-declare the monitoring plan', route: '#/integrity?panel=method' },
    });
  }

  return out;
}

export function integrityAttentionCount(state, now = new Date(), settings = null) {
  const s = settings || state?.settings || {};
  const conventions = integrityConventions(s);
  const today = dayKey(now);
  const observations = collectVerdictObservations(state);
  const overClaiming = SIGNAL_FAMILIES
    .map((f) => scoreFamily(f.domain, observations, conventions))
    .filter((f) => f.status === 'over-claiming').length;
  const due = (state?.integrityReviews || [])
    .filter((r) => r && !r.graded && r.reviewOn <= today).length;
  return overClaiming + due;
}

/* --------------------------------------------------------------------- brief */

export function integrityBrief(state, now = new Date(), settings = null) {
  const report = integrityReport(state, now, settings || state?.settings || {});
  const { conventions, looks, precision, reviews } = report;
  const lines = [];
  lines.push('SIGNAL INTEGRITY — how good is the thing that tells me what is wrong?');
  lines.push(`Generated ${report.today}. Aggregate and rule-level only: no person, no finding text, no names.`);
  lines.push('');
  lines.push(`THE PROCEDURE: ${report.suite.ruleFamilies} deterministic rule families and ${report.suite.statisticalFamilies} p-valued scan, evaluated ${looks.used} recorded look(s) against a plan of ${looks.planned}.`);
  lines.push(`ERROR BUDGET: ${conventions.alphaPct}% family-wise, spent with the ${conventions.spending === 'pocock' ? 'Pocock-like' : 'O’Brien–Fleming-like'} spending function.`);
  lines.push(`  spent so far  ${looks.cumulativeAlphaPct}% of ${conventions.alphaPct}% (${looks.spendPct}% of the budget, at ${looks.lookPct}% of the planned looks)`);
  lines.push(`  next look     nominal alpha ${looks.nextBoundary.nominalAlpha === 0 ? '0 (budget exhausted)' : pct(looks.nextBoundary.nominalAlpha * 100, 4) + '%'}, z ${looks.nextBoundary.zBoundary ?? '—'}`);
  lines.push(`  per test      p < ${looks.nextBoundary.perTestThreshold} after ${looks.mEff} effective test(s) from ${looks.seriesTested || '—'} series at declared rho ${conventions.rhoPct}%`);
  lines.push(`  look count    ${looks.lowerBound ? 'LOWER BOUND — reconstructed from the alert ledger; a silent scanning day leaves no trace' : 'recorded durably by the rule engine'}`);
  lines.push('');
  const pooled = precision.pooled;
  lines.push(`MEASURED PRECISION (the leader's own verdicts): ${pooled.n} verdict(s).`);
  if (!pooled.n) {
    lines.push('  none — the suite has never been graded, so no precision figure is claimed.');
  } else {
    lines.push(`  detection precision    ${pooled.detectionPct}% (95% CI ${pooled.detectionLoPct}–${pooled.detectionHiPct}%, n=${pooled.n}) — of the signals judged, how many described a real change`);
    lines.push(`  actionable precision   ${pooled.actionablePct === null ? 'withheld' : pct(pooled.actionablePct, 1) + '%'} (95% CI ${pooled.actionableLoPct ?? '—'}–${pooled.actionableHiPct ?? '—'}%, n=${pooled.n}) — how many were worth acting on`);
    lines.push(`  declared floor         ${conventions.precisionFloorPct}%`);
    lines.push(`  families over-claiming ${precision.overClaiming.length}${precision.overClaiming.length ? ` (${precision.overClaiming.map((f) => f.domain).join(', ')})` : ''}`);
    const nn = pooled.actionablePct ? Math.ceil(100 / pooled.actionablePct) : null;
    lines.push(`  alerts per useful alert ${nn === null ? '—' : nn}`);
  }
  lines.push('');
  lines.push(`FROZEN REVIEWS: ${reviews.all.length} total, ${reviews.pending.length} pending, ${reviews.due.length} due, ${reviews.graded.length} graded.`);
  if (reviews.graded.length) {
    lines.push(`  mean Brier ${reviews.meanBrier} against a naive ${reviews.naiveBrier} (${reviews.skillPct === null ? 'skill withheld' : reviews.skillPct + '% skill'}); ${reviews.minGraded} grades are the floor for a skill figure.`);
  }
  lines.push('');
  lines.push('WHAT THIS DOES NOT CLAIM: no p-value is manufactured for a deterministic rule; the rho correction is a declared convention, not an estimate; a reconstructed look count is a lower bound; a Wilson interval is not a guarantee; and no person is scored anywhere in this file.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------- route wiring */

/** Deep-link aliases the router accepts for this terminal. */
export const INTEGRITY_ROUTE_ALIASES = Object.freeze([
  'integrity', 'signal-integrity', 'alpha-budget', 'error-budget', 'multiplicity',
  'false-discovery', 'detector-health', 'signal-quality', 'verdicts', 'looks',
  'statistical-review',
]);
