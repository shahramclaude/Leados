/**
 * app/core/domain/survival.js — the Delivery Survival Terminal (Schema v63).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * Every queue screen in LeadOS (and in every other leadership tool) answers
 * "what is open?". None of them answers the question a manager actually asks
 * on a Monday morning:
 *
 *   *"Thirteen things are open. Which of them are already past the point where
 *    work like this normally finishes — and if I wait two more weeks, what is
 *    the chance each one is still sitting there?"*
 *
 * The honest way to answer that is survival analysis over the leader's own
 * closed record, and the honest reason no product does it is that it requires
 * two corrections that a dashboard cannot make:
 *
 *   1. **Censoring.** Fourteen items are still open. Dropping them (what every
 *      "average cycle time" tile does) is survivorship bias: you compute the
 *      average of the work that went well. Kaplan & Meier (1958) keep them in
 *      the risk set and let the curve speak. This module never drops an open
 *      item; it censors it at the day it was last observed.
 *
 *   2. **Competing risks.** Work does not only finish; it is *abandoned*,
 *      parked or handed back. Counting an abandoned item as "still going"
 *      makes every team look like it eventually completes everything. Aalen &
 *      Johansen (1978) split the exit into causes, so the page can print two
 *      numbers side by side: the naive Kaplan–Meier "eventually completes"
 *      figure — which treats abandonment as if it had not happened yet — and
 *      the cumulative incidence of completion, which is the truth.
 *
 * NAMED, CITABLE METHODS (product doctrine §0.2)
 * ----------------------------------------------
 *  - **Kaplan & Meier (1958)**: product-limit estimator of the survival
 *    function for time-to-exit, with open items right-censored at today.
 *  - **Greenwood (1926)** variance and the **Kalbfleisch & Prentice (2002)**
 *    log–log transform for pointwise confidence bands, because the plain
 *    linear band leaves the unit interval near the tails.
 *  - **Aalen (1978) / Aalen & Johansen (1978)**: cumulative incidence function
 *    for completion with abandonment as a competing risk, and the Aalen
 *    variance estimator for that incidence.
 *  - **Nelson (1972) / Aalen (1978)**: the non-parametric cumulative hazard,
 *    differenced into elapsed-time buckets to get an empirical hazard rate per
 *    bucket (events per 100 item-days at risk) with a Poisson rate ratio and a
 *    Katz (log-rate) confidence interval.
 *  - **Mantel (1966) / Cox (1972) log-rank test**: does one class of work
 *    survive materially longer than another? Chi-square on one degree of
 *    freedom; the p-value is the exact `erfc(sqrt(χ²/2))`, not a table lookup.
 *  - **Kahneman & Tversky (1979) / Flyvbjerg (2006) reference-class
 *    forecasting**: the outside view is the class median, not the leader's
 *    inside estimate.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * -----------------------------------------
 *  - No item is scored as a person's failure. A survival curve is a property
 *    of a *class of work in a system*, and every sentence says so.
 *  - No duration is invented. An item with no start date is excluded and
 *    counted; a class below the at-risk floor returns **no reading**, never a
 *    point estimate built on two observations.
 *  - No extrapolation past the observed record. When the at-risk count falls
 *    below the declared floor the page says the curve has run out of evidence
 *    instead of drawing a tail.
 *  - Effort-days and calendar days are never mixed. The planning-fallacy ratio
 *    is computed only where the workspace recorded *both* quantities in the
 *    same unit (a declared effort estimate and a recorded actual effort).
 *  - Independence of censoring is assumed and stated. A leader who abandons
 *    the slowest work first violates it, which is exactly why abandonment is
 *    modelled as a competing risk instead of being folded into censoring.
 *
 * Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';

export const SURVIVAL_ENGINE_VERSION = 'survival-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Vocabulary and conventions                                       */
/* ------------------------------------------------------------------ */

export const SURVIVAL_DEFAULTS = Object.freeze({
  // The forward window used for the per-item "will this finish soon" reading.
  survHorizonDays: 14,
  // Minimum number at risk at the evaluation time before a conditional
  // probability is printed. Below this the curve is a rumour.
  survMinAtRisk: 4,
  // Below this frozen probability the rule opens owned work for the item.
  survRiskFloorPct: 35,
  // The share of exits that are abandonments at which the class itself —
  // not the item — becomes a decision.
  survAbandonSharePct: 30,
  // A frozen reading still ungraded this many days after its review date is
  // stale and becomes owned work.
  survStaleDays: 14,
  // Minimum paired (declared, actual) estimates in the same unit before the
  // planning-fallacy ratio is printed.
  survBiasFloor: 4,
  // Bound on a single frozen reading. A reading is a sample, not the whole app.
  survMaxPredictions: 40,
  // Buckets for the empirical hazard, in days from start. Three buckets is the
  // smallest split that can show a *direction* without inventing a curve.
  survHazardBuckets: '7,30',
  survAutoPropagate: true,
});

export function conventionsFromSettings(settings = {}) {
  const s = settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, fallback, min, max) => Math.min(max, Math.max(min, Math.round(num(value, fallback))));
  const rawBuckets = String(s.survHazardBuckets ?? SURVIVAL_DEFAULTS.survHazardBuckets)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 3650);
  const buckets = [...new Set(rawBuckets)].sort((a, b) => a - b).slice(0, 4);
  return {
    horizonDays: int(s.survHorizonDays, SURVIVAL_DEFAULTS.survHorizonDays, 1, 180),
    minAtRisk: int(s.survMinAtRisk, SURVIVAL_DEFAULTS.survMinAtRisk, 2, 100),
    riskFloorPct: int(s.survRiskFloorPct, SURVIVAL_DEFAULTS.survRiskFloorPct, 0, 100),
    abandonSharePct: int(s.survAbandonSharePct, SURVIVAL_DEFAULTS.survAbandonSharePct, 1, 100),
    staleDays: int(s.survStaleDays, SURVIVAL_DEFAULTS.survStaleDays, 1, 365),
    biasFloor: int(s.survBiasFloor, SURVIVAL_DEFAULTS.survBiasFloor, 3, 100),
    maxPredictions: int(s.survMaxPredictions, SURVIVAL_DEFAULTS.survMaxPredictions, 1, 200),
    hazardBuckets: buckets.length ? buckets : [7, 30],
    autoPropagate: s.survAutoPropagate !== false,
  };
}

export const SURVIVAL_SIGNAL_IDS = Object.freeze([
  'SURV-01', 'SURV-02', 'SURV-03', 'SURV-04', 'SURV-05', 'SURV-06', 'SURV-07', 'SURV-08',
  'SURV-09', 'SURV-10',
]);

/* Drift-decomposition floors. The calendar-drift test above uses its own
 * literals (8 per cohort, 6 pooled exits); the decomposition shares the
 * cohort floor and adds a per-cause event floor, because a share computed
 * from three abandonments is three anecdotes wearing a percentage. The
 * family size is fixed a priori at 6 classes × 2 causes, exactly as the
 * drift family's six classes are fixed whether or not every class tests. */
export const DRIFT_MIN_COHORT = 8;
export const DRIFT_MIN_CAUSE_EVENTS = 5;
export const DRIFT_FAMILY_SIZE = 12;

export const DECOMP_VERDICT_LABELS = Object.freeze({
  substitution: 'Abandonments replacing completions',
  'completion-decline': 'Completion-led decline',
  'abandonment-rise': 'Abandonment-led rise',
  stall: 'Both exits fell — work is sitting',
  churn: 'Faster exits of both kinds',
  'completion-gain': 'Completion gain',
  'abandonment-decline': 'Fewer abandonments',
  'broad-improvement': 'More completions, fewer abandonments',
  'no-attributable-shift': 'No attributable exit-mix shift',
  refused: 'Not enough evidence to decompose',
});

/* ------------------------------------------------------------------ */
/* 1. Classes of work and where each one is harvested from             */
/* ------------------------------------------------------------------ */

/**
 * Six classes, each harvested from a collection that already records a start
 * and a terminal state. Nothing is created here and nothing is inferred: an
 * item without a recorded start date is not "approximately" started.
 *
 * `abandoned` is a real, closed status in the source record. Parking (a
 * `released` portfolio item, a `paused` change, an `on-hold` requisition) is
 * NOT abandonment and is treated as censoring — the work may resume, and the
 * record does not claim otherwise.
 */
export const SURVIVAL_CLASSES = Object.freeze([
  {
    key: 'work',
    label: 'Funded work',
    sourceType: 'portfolio',
    unit: 'calendar days from funding to completion',
    note: 'Portfolio items. An estimate of team effort is stored separately and is never compared to calendar time.',
  },
  {
    key: 'case',
    label: 'Operational cases',
    sourceType: 'case',
    unit: 'calendar days from opening to resolution',
    note: 'Incidents, risks, initiatives and escalations. A case closed without resolution is censored, not completed.',
  },
  {
    key: 'hiring',
    label: 'Hiring requisitions',
    sourceType: 'requisition',
    unit: 'calendar days from opening a req to a filled seat',
    note: 'A cancelled requisition is an abandonment, not a hire.',
  },
  {
    key: 'change',
    label: 'Org-change programmes',
    sourceType: 'change',
    unit: 'calendar days from opening to anchoring',
    note: 'Anchored is a completion; abandoned is an abandonment; paused is censored because the programme may resume.',
  },
  {
    key: 'delegation',
    label: 'Delegations',
    sourceType: 'delegation',
    unit: 'calendar days from hand-off to completion',
    note: 'A returned delegation is an abandonment. Whether it was returned is a fact about the hand-off, never about the person.',
  },
  {
    key: 'decision',
    label: 'Decisions',
    sourceType: 'decision',
    unit: 'calendar days from logging a decision to deciding it',
    note: 'Time-to-decide. An undecided decision is censored at today; the terminal never guesses whether it will be decided.',
  },
]);

const CLASS_BY_KEY = new Map(SURVIVAL_CLASSES.map((row) => [row.key, row]));

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveOrNull(value) {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

function day(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function text(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/* ------------------------------------------------------------------ */
/* 2. Harvest                                                          */
/* ------------------------------------------------------------------ */

/**
 * One harvested work item. `elapsedDays` is time observed: to the exit for a
 * closed item, to `today` for an open one. `exitType` is `'completed'`,
 * `'abandoned'` or `null` (censored).
 */
function makeItem({
  key, kind, sourceType, sourceId, title, startedOn, endedOn, exitType, today, ownerId, declaredDays, actualDays, route, partial,
}) {
  const start = day(startedOn);
  if (!start) return null;
  if (start > today) return null; // A record that has not started has no time at risk.
  const end = exitType && day(endedOn) ? day(endedOn) : null;
  const observedEnd = end && end <= today ? end : today;
  const elapsed = daysBetween(start, observedEnd);
  if (elapsed === null || elapsed < 0) return null;
  const resolvedExit = end ? exitType : null;
  return {
    key,
    kind,
    sourceType,
    sourceId,
    title: text(title, 160) || 'Untitled',
    startedOn: start,
    endedOn: end,
    exitType: resolvedExit,
    // A completed item with no end date is not credited with a completion; it
    // stays censored. The alternative — stamping today — is an invented event.
    censoredOn: resolvedExit ? null : today,
    elapsedDays: elapsed,
    ownerId: ownerId || null,
    declaredDays: num(declaredDays),
    actualDays: num(actualDays),
    route: route || '',
    partial: Boolean(partial),
  };
}

function harvestPortfolio(state, today) {
  return (Array.isArray(state?.portfolio) ? state.portfolio : []).map((item) => {
    if (!item || !item.id) return null;
    const status = text(item.status, 20) || 'open';
    const exitType = status === 'done' ? 'completed' : null;
    return makeItem({
      key: `portfolio:${item.id}`,
      kind: 'work',
      sourceType: 'portfolio',
      sourceId: item.id,
      title: item.title,
      startedOn: item.createdOn,
      endedOn: item.completedOn,
      exitType,
      today,
      ownerId: item.ownerId,
      // The normaliser stores a PERT triple of zeros when no estimate was
      // entered. A zero-day estimate is not an estimate, so it is read as
      // absent rather than as "this takes no time".
      declaredDays: positiveOrNull(item.effortDays?.mostLikely),
      actualDays: positiveOrNull(item.actualEffortDays),
      route: `#/capital?item=${encodeURIComponent(item.id)}`,
    });
  }).filter(Boolean);
}

function harvestCases(state, today) {
  return (Array.isArray(state?.cases) ? state.cases : []).map((item) => {
    if (!item || !item.id) return null;
    const status = text(item.status, 20);
    const exitType = status === 'resolved' || status === 'closed' ? 'completed' : null;
    return makeItem({
      key: `case:${item.id}`,
      kind: 'case',
      sourceType: 'case',
      sourceId: item.id,
      title: item.title,
      startedOn: item.openedOn,
      endedOn: item.resolvedOn,
      exitType,
      today,
      ownerId: item.ownerId,
      route: `#/cases?id=${encodeURIComponent(item.id)}`,
    });
  }).filter(Boolean);
}

function harvestRequisitions(state, today) {
  return (Array.isArray(state?.requisitions) ? state.requisitions : []).map((item) => {
    if (!item || !item.id) return null;
    const status = text(item.status, 20);
    const exitType = status === 'filled' ? 'completed' : status === 'cancelled' ? 'abandoned' : null;
    return makeItem({
      key: `requisition:${item.id}`,
      kind: 'hiring',
      sourceType: 'requisition',
      sourceId: item.id,
      title: item.title,
      startedOn: item.openedOn,
      endedOn: item.closedOn,
      exitType,
      today,
      ownerId: item.filledPersonId || null,
      route: `#/hiring/${encodeURIComponent(item.id)}`,
    });
  }).filter(Boolean);
}

function harvestChanges(state, today) {
  return (Array.isArray(state?.changes) ? state.changes : []).map((item) => {
    if (!item || !item.id) return null;
    const status = text(item.status, 20);
    // `anchoredOn` is the only terminal date a change record keeps. An
    // abandoned change therefore has an event type but no event *date*: it is
    // censored at its last write and counted as `abandonedUndated` by the
    // report, because crediting it with today would be an invented event and
    // silently dropping it would be an invented completion.
    const anchored = status === 'anchored' ? day(item.anchoredOn) : null;
    const exitType = anchored ? 'completed' : null;
    const end = anchored;
    return makeItem({
      key: `change:${item.id}`,
      kind: 'change',
      sourceType: 'change',
      sourceId: item.id,
      title: item.title,
      startedOn: item.openedOn,
      endedOn: end,
      exitType,
      today,
      ownerId: null,
      declaredDays: positiveOrNull(item.effortDays?.mostLikely),
      route: `#/changes/${encodeURIComponent(item.id)}`,
      partial: status === 'abandoned' && !anchored,
    });
  }).filter(Boolean);
}

function harvestDelegations(state, today) {
  return (Array.isArray(state?.delegations) ? state.delegations : []).map((item) => {
    if (!item || !item.id) return null;
    const status = text(item.status, 20);
    const exitType = status === 'done' ? 'completed' : status === 'returned' ? 'abandoned' : null;
    return makeItem({
      key: `delegation:${item.id}`,
      kind: 'delegation',
      sourceType: 'delegation',
      sourceId: item.id,
      title: item.title,
      startedOn: item.delegatedOn,
      endedOn: status === 'done' ? item.completedOn : status === 'returned' ? item.returnedOn : null,
      exitType,
      today,
      ownerId: item.personId,
      route: `#/delegations?focus=${encodeURIComponent(item.id)}`,
    });
  }).filter(Boolean);
}

function harvestDecisions(state, today) {
  return (Array.isArray(state?.decisions) ? state.decisions : []).map((item) => {
    if (!item || !item.id) return null;
    const decided = Boolean(text(item.chosen, 300));
    return makeItem({
      key: `decision:${item.id}`,
      kind: 'decision',
      sourceType: 'decision',
      sourceId: item.id,
      title: item.title,
      startedOn: item.date,
      endedOn: item.decidedOn,
      exitType: decided ? 'completed' : null,
      today,
      ownerId: null,
      route: `#/decisions?focus=${encodeURIComponent(item.id)}`,
    });
  }).filter(Boolean);
}

const HARVESTERS = Object.freeze([
  harvestPortfolio,
  harvestCases,
  harvestRequisitions,
  harvestChanges,
  harvestDelegations,
  harvestDecisions,
]);

/**
 * Every work item the workspace can date. The count of records that could not
 * be dated is returned alongside, so the page can say what it excluded instead
 * of quietly shrinking the denominator.
 */
export function harvestWorkItems(state, now = new Date()) {
  const today = dayKey(now) || dayKey(new Date());
  const items = [];
  for (const harvest of HARVESTERS) {
    for (const item of harvest(state, today)) items.push(item);
  }
  const keys = new Set();
  const unique = [];
  for (const item of items) {
    if (keys.has(item.key)) continue;
    keys.add(item.key);
    unique.push(item);
  }
  const declaredByKey = new Set(unique.filter((i) => i.declaredDays !== null).map((i) => i.key));
  return {
    today,
    items: unique,
    // Records whose source exists but cannot contribute a duration. Counted,
    // never assumed.
    undated: countUndated(state),
    declared: unique.filter((i) => i.declaredDays !== null).length,
    withActualEffort: unique.filter((i) => i.actualDays !== null && i.declaredDays !== null).length,
    declaredKeys: declaredByKey,
  };
}

function countUndated(state) {
  let undated = 0;
  const bump = (list, field) => {
    for (const row of Array.isArray(list) ? list : []) {
      if (row && row.id && !day(row[field])) undated += 1;
    }
  };
  bump(state?.portfolio, 'createdOn');
  bump(state?.cases, 'openedOn');
  bump(state?.requisitions, 'openedOn');
  bump(state?.changes, 'openedOn');
  bump(state?.delegations, 'delegatedOn');
  bump(state?.decisions, 'date');
  return undated;
}

/* ------------------------------------------------------------------ */
/* 3. Kaplan–Meier, Greenwood, log–log band                            */
/* ------------------------------------------------------------------ */

const Z_95 = 1.959963984540054;

function normalCdf(x) {
  // Abramowitz & Stegun 7.1.26 on erf; |error| < 1.5e-7, which is far below
  // anything this page prints.
  const t = Math.abs(x) / Math.SQRT2;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const u = 1 / (1 + p * t);
  const erf = 1 - (((((a5 * u + a4) * u + a3) * u + a2) * u + a1) * u) * Math.exp(-t * t);
  return 0.5 * (1 + sign * erf);
}

/** Two-sided p-value for a chi-square statistic on one degree of freedom. */
export function chiSquarePValue1df(chi2) {
  if (!Number.isFinite(chi2) || chi2 <= 0) return 1;
  return 2 * (1 - normalCdf(Math.sqrt(chi2)));
}

/**
 * The product-limit estimate over a set of items.
 *
 * Two event types are kept apart at every step: `completions` and
 * `abandonments`. `survival` is the Kaplan–Meier estimate of *not having
 * exited at all* (both causes combined, which is the correct risk set).
 * `cif` is the Aalen–Johansen cumulative incidence of completion and
 * `cifA` the same estimator for abandonment, so at every step the three
 * shares partition the cohort exactly: `survival + cif + cifA = 1`. The
 * drift decomposition below is arithmetic on that identity; without the
 * second incidence it could not be checked, only asserted.
 *
 * Everything the page prints is derived from the returned steps; there is no
 * second implementation of the curve anywhere in the app.
 */
export function kaplanMeier(items = []) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item && Number.isFinite(item.elapsedDays));
  const totalEvents = rows.filter((item) => item.exitType === 'completed' || item.exitType === 'abandoned').length;
  if (!rows.length) {
    return {
      steps: [],
      n: 0,
      events: 0,
      completions: 0,
      abandonments: 0,
      censored: 0,
      maxObservedDays: 0,
      blockedWithoutStart: 0,
      survivalAt: () => 1,
      cifAt: () => 0,
      cifAbandonAt: () => 0,
      atRiskAt: () => 0,
    };
  }

  // Distinct observation times, ascending. Events are processed before
  // censorings at the same time, which is the standard convention and the one
  // that keeps the at-risk set honest for same-day exits.
  const times = [...new Set(rows.map((item) => item.elapsedDays))].sort((a, b) => a - b);
  let survival = 1;
  let greenwood = 0;
  let cif = 0;
  let cifA = 0;
  const steps = [];

  for (const time of times) {
    const atRisk = rows.filter((item) => item.elapsedDays >= time).length;
    const completions = rows.filter((item) => item.elapsedDays === time && item.exitType === 'completed').length;
    const abandonments = rows.filter((item) => item.elapsedDays === time && item.exitType === 'abandoned').length;
    const censored = rows.filter((item) => item.elapsedDays === time && !item.exitType).length;
    const events = completions + abandonments;
    const survivalBefore = survival;

    if (events > 0 && atRisk > 0) {
      if (atRisk - events > 0) {
        survival *= 1 - events / atRisk;
        greenwood += events / (atRisk * (atRisk - events));
      } else {
        // The risk set empties: the curve ends at zero and the variance is
        // zero from here on. Dividing by (atRisk - events) would be ∞.
        survival = 0;
      }
      // Aalen–Johansen incidence increments, using the curve *before* the step.
      cif += survivalBefore * (completions / atRisk);
      cifA += survivalBefore * (abandonments / atRisk);
    }

    const se = survival > 0 ? survival * Math.sqrt(greenwood) : 0;
    let lo = survival;
    let hi = survival;
    if (survival > 0 && survival < 1 && greenwood > 0) {
      // Kalbfleisch & Prentice log–log transform: the band stays inside [0,1].
      const logSurv = Math.log(survival);
      const sigma = Math.sqrt(greenwood) / Math.abs(logSurv);
      lo = Math.max(0, Math.min(1, survival ** Math.exp(Z_95 * sigma)));
      hi = Math.max(0, Math.min(1, survival ** Math.exp(-Z_95 * sigma)));
    }
    steps.push({
      time,
      atRisk,
      completions,
      abandonments,
      censored,
      events,
      survival: round(survival, 6),
      survivalBefore: round(survivalBefore, 6),
      se: round(se, 6),
      lo: round(lo, 6),
      hi: round(hi, 6),
      cif: round(cif, 6),
      cifSe: null, // Filled in a second pass; the variance needs F̂ at the evaluation time.
      cifA: round(cifA, 6),
      cifAse: null,
    });
  }

  // Delta-method variance for a cumulative incidence — the Taylor-linearisation
  // form for the Aalen–Johansen estimator, computed after the whole curve
  // exists because each term references F̂_k(t) at the evaluation time:
  //
  //   Σ_j≤t [F̂(t)−F̂(t_j)]²·d_j/(Y_j(Y_j−d_j))  +  Ŝ²(t_j−)·d_jk(Y_j−d_jk)/Y_j³
  //         − 2·[F̂(t)−F̂(t_j)]·Ŝ(t_j−)·d_jk/Y_j²
  //
  // All three terms matter. An earlier transcription of this estimator kept a
  // Y² denominator in the first term, used the total exit count in the second
  // and dropped the cross term entirely, which misstated the variance in
  // either direction depending on how event times spread (Session 94 defect;
  // ADR-0057). The anchor case is exact and pinned by the test suite: with no
  // censoring before t the estimator is a multinomial proportion and this
  // variance collapses to F(1−F)/n. Aalen's counting-process form (Y−1
  // denominators) overestimates at workspace sample sizes (Braun & Yuan 2007),
  // so the delta form serves both causes through this one implementation —
  // which is also what keeps the two incidences comparable when the drift
  // decomposition differences them.
  const cifVarianceByTimeFor = (valueOf, causeOf) => {
    const byTime = new Map();
    steps.forEach((step, index) => {
      const atT = valueOf(step);
      let variance = 0;
      for (let j = 0; j <= index; j += 1) {
        const row = steps[j];
        if (!row.atRisk) continue;
        const Y = row.atRisk;
        const d = row.events;
        const dk = causeOf(row);
        const gap = atT - valueOf(row);
        // When the risk set empties at t_j the curve ends there, so the
        // bracket is zero at the only evaluation time that reaches this term.
        const first = Y - d > 0 ? gap ** 2 * (d / (Y * (Y - d))) : 0;
        const second = row.survivalBefore ** 2 * ((dk * (Y - dk)) / Y ** 3);
        const third = 2 * gap * row.survivalBefore * (dk / Y ** 2);
        variance += first + second - third;
      }
      byTime.set(step.time, Math.max(0, variance));
    });
    return byTime;
  };
  const cifVarianceByTime = cifVarianceByTimeFor((row) => row.cif, (row) => row.completions);
  const cifAVarianceByTime = cifVarianceByTimeFor((row) => row.cifA, (row) => row.abandonments);
  for (const step of steps) {
    const variance = cifVarianceByTime.get(step.time) || 0;
    const se = Math.sqrt(variance);
    step.cifSe = round(se, 6);
    step.cifLo = round(Math.max(0, step.cif - Z_95 * se), 6);
    step.cifHi = round(Math.min(1, step.cif + Z_95 * se), 6);
    const varianceA = cifAVarianceByTime.get(step.time) || 0;
    const seA = Math.sqrt(varianceA);
    step.cifAse = round(seA, 6);
    step.cifALo = round(Math.max(0, step.cifA - Z_95 * seA), 6);
    step.cifAHi = round(Math.min(1, step.cifA + Z_95 * seA), 6);
  }

  const survivalAt = (t) => {
    let value = 1;
    for (const step of steps) {
      if (step.time > t) break;
      value = step.survival;
    }
    return value;
  };
  const cifAt = (t) => {
    let value = 0;
    for (const step of steps) {
      if (step.time > t) break;
      value = step.cif;
    }
    return value;
  };
  const cifAbandonAt = (t) => {
    let value = 0;
    for (const step of steps) {
      if (step.time > t) break;
      value = step.cifA;
    }
    return value;
  };
  const atRiskAt = (t) => {
    for (const step of steps) {
      if (step.time >= t) return step.atRisk;
    }
    return 0;
  };

  const completions = rows.filter((item) => item.exitType === 'completed').length;
  const abandonments = rows.filter((item) => item.exitType === 'abandoned').length;
  return {
    steps,
    n: rows.length,
    events: totalEvents,
    completions,
    abandonments,
    censored: rows.length - totalEvents,
    maxObservedDays: times[times.length - 1] || 0,
    survivalAt,
    cifAt,
    cifAbandonAt,
    atRiskAt,
  };
}

/**
 * The first time the cumulative incidence of completion reaches `target`.
 * Returns `reached: false` when the observed record never gets there — the
 * honest answer, and the reason this is not called a median.
 */
export function incidenceQuantile(curve, target = 0.5) {
  for (const step of curve.steps || []) {
    if (step.cif >= target) {
      return {
        reached: true,
        days: step.time,
        // A distribution-free bracket from the pointwise Aalen band. When the
        // band is degenerate at the crossing, the bracket collapses to the day.
        lo: (() => {
          for (const row of curve.steps) {
            if (row.cifLo >= target) return row.time;
          }
          return step.time;
        })(),
        hi: (() => {
          for (const row of curve.steps) {
            if (row.cifHi >= target) return row.time;
          }
          return null;
        })(),
      };
    }
  }
  return { reached: false, days: null, lo: null, hi: null };
}

/**
 * Median time to *any* exit (the Kaplan–Meier median), with the log–log
 * band-based Brookmeyer–Crowley style bracket. Distinct from the completion
 * incidence quantile above and labelled as such on the page.
 */
export function medianExit(curve) {
  for (const step of curve.steps || []) {
    if (step.survival <= 0.5) {
      const lo = (() => {
        for (const row of curve.steps) {
          if (row.hi <= 0.5) return row.time;
        }
        return step.time;
      })();
      const hi = (() => {
        for (const row of curve.steps) {
          if (row.lo <= 0.5) return row.time;
        }
        return null;
      })();
      return { reached: true, days: step.time, lo, hi };
    }
  }
  return { reached: false, days: null, lo: null, hi: null };
}

/* ------------------------------------------------------------------ */
/* 4. Conditional completion reading for one open item                 */
/* ------------------------------------------------------------------ */

/**
 * P(completes within `horizonDays` more days | has already lasted
 * `elapsedDays`) using the competing-risk incidence:
 *
 *     ( F1(s + w) − F1(s) ) / S(s)
 *
 * The numerator is not a probability of its own; the division by the survival
 * at `s` is what conditions on the item having lasted this long. Below the
 * at-risk floor the function refuses rather than dividing a thin tail.
 */
export function conditionalCompletion(curve, elapsedDays, horizonDays, options = {}) {
  const minAtRisk = Number.isFinite(options.minAtRisk) ? options.minAtRisk : SURVIVAL_DEFAULTS.survMinAtRisk;
  if (!curve || !curve.steps?.length) {
    return { available: false, probability: null, reason: 'no closed or open record of this class exists yet' };
  }
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    return { available: false, probability: null, reason: 'the item has no start date' };
  }
  const survivalNow = curve.survivalAt(elapsedDays);
  if (survivalNow <= 0) {
    return { available: false, probability: null, reason: 'every comparable item has already exited the risk set' };
  }
  const atRisk = curve.atRiskAt(elapsedDays);
  if (atRisk < minAtRisk) {
    return {
      available: false,
      probability: null,
      atRisk,
      reason: `only ${atRisk} comparable item(s) remain at risk at day ${Math.round(elapsedDays)}; the reading floor is ${minAtRisk}`,
    };
  }
  const horizonEnd = elapsedDays + horizonDays;
  // The evidence limit is the longest observation in the class, never extended
  // by a caller-supplied number: the tail beyond it is extrapolation and the
  // reading says so.
  const observedCap = curve.maxObservedDays;
  const beyondEvidence = horizonEnd > observedCap;
  const probability = Math.max(0, Math.min(1, (curve.cifAt(horizonEnd) - curve.cifAt(elapsedDays)) / survivalNow));
  return {
    available: true,
    probability,
    probabilityPct: round(probability * 100, 1),
    atRisk,
    horizonEnd,
    survivalNow: round(survivalNow, 4),
    beyondEvidence,
    reason: beyondEvidence
      ? `the horizon reaches day ${Math.round(horizonEnd)}, past the longest observation on record (${Math.round(observedCap)} days), so the tail is extrapolated rather than observed`
      : '',
  };
}

/**
 * The empirical percentile of an item's age among past *exits* of its class.
 *
 * This is deliberately NOT a survival probability and the page never calls it
 * one. It answers the one question that is answerable at any age: of the work
 * that has already finished or been abandoned, what share took less time than
 * this item has already taken? It needs no at-risk set, which is exactly why it
 * still answers when the conditional probability has run out of comparables.
 */
export function agePercentile(items = [], elapsedDays, floor = SURVIVAL_DEFAULTS.survMinAtRisk) {
  const exits = (Array.isArray(items) ? items : []).filter((item) => item && item.exitType && Number.isFinite(item.elapsedDays));
  if (exits.length < floor) {
    return { available: false, percentile: null, n: exits.length, floor, reason: `only ${exits.length} exit(s) on record; the floor is ${floor}` };
  }
  const sooner = exits.filter((item) => item.elapsedDays < elapsedDays).length;
  return {
    available: true,
    percentile: round((sooner / exits.length) * 100, 1),
    n: exits.length,
    sooner,
    reason: '',
  };
}

/* ------------------------------------------------------------------ */
/* 5. Empirical hazard, bucket trends and the log-rank test             */
/* ------------------------------------------------------------------ */

/**
 * Nelson–Aalen hazard, differenced into elapsed-time buckets. `rate` is exits
 * per 100 item-days at risk inside the bucket, so buckets of different widths
 * are comparable. The rate ratio between the first and last bucket carries a
 * Katz log-rate interval.
 */
export function hazardBuckets(items = [], boundaries = [7, 30]) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item && Number.isFinite(item.elapsedDays));
  const edges = [0, ...boundaries, Infinity];
  const buckets = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    buckets.push({
      index: i,
      from: edges[i],
      to: edges[i + 1] === Infinity ? null : edges[i + 1],
      exposure: 0,
      events: 0,
      completions: 0,
      abandonments: 0,
      rate: null,
    });
  }
  for (const item of rows) {
    const exited = Boolean(item.exitType);
    const end = item.elapsedDays;
    for (const bucket of buckets) {
      const start = bucket.from;
      const stop = bucket.to === null ? Infinity : bucket.to;
      const overlap = Math.max(0, Math.min(end, stop) - Math.min(Math.max(start, 0), end));
      // Person-days at risk inside this bucket. An exit exactly on a boundary
      // contributes zero exposure to the next bucket and its event here.
      bucket.exposure += overlap;
      if (exited && end >= start && end < stop) {
        bucket.events += 1;
        if (item.exitType === 'completed') bucket.completions += 1;
        else bucket.abandonments += 1;
      }
    }
  }
  for (const bucket of buckets) {
    bucket.exposure = round(bucket.exposure, 2);
    bucket.rate = bucket.exposure > 0 ? round((bucket.events / bucket.exposure) * 100, 3) : null;
  }
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  let ratio = null;
  if (first.events > 0 && last.events > 0 && first.exposure > 0 && last.exposure > 0) {
    const logRatio = Math.log((first.events / first.exposure) / (last.events / last.exposure));
    const se = Math.sqrt(1 / first.events + 1 / last.events);
    ratio = {
      value: round(Math.exp(logRatio), 2),
      lo: round(Math.exp(logRatio - Z_95 * se), 2),
      hi: round(Math.exp(logRatio + Z_95 * se), 2),
      firstBucket: `${first.from}–${first.to ?? '∞'}d`,
      lastBucket: `${last.from}–${last.to ?? '∞'}d`,
    };
  }
  return { buckets, ratio };
}

/**
 * Mantel–Cox log-rank test across two groups. Returns `null` when either group
 * has no exit, because a test of a hazard with no events is not a test.
 */
export function logRank(items = [], groupOf = () => 'a') {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item && Number.isFinite(item.elapsedDays));
  const groups = new Set(rows.map((row) => groupOf(row)));
  if (groups.size !== 2) return null;
  const [ga, gb] = [...groups];
  const times = [...new Set(rows.filter((r) => r.exitType).map((r) => r.elapsedDays))].sort((a, b) => a - b);
  let observed = 0;
  let expected = 0;
  let variance = 0;
  for (const time of times) {
    const atRisk = rows.filter((r) => r.elapsedDays >= time);
    const n = atRisk.length;
    const nA = atRisk.filter((r) => groupOf(r) === ga).length;
    const events = rows.filter((r) => r.elapsedDays === time && r.exitType);
    const d = events.length;
    const dA = events.filter((r) => groupOf(r) === ga).length;
    if (n < 2 || d === 0) continue;
    observed += dA;
    expected += (d * nA) / n;
    variance += (nA * (n - nA) * d * (n - d)) / (n * n * (n - 1));
  }
  if (!(variance > 0)) return null;
  const chi2 = (observed - expected) ** 2 / variance;
  return {
    groupA: ga,
    groupB: gb,
    observedA: observed,
    expectedA: round(expected, 2),
    chi2: round(chi2, 3),
    rawP: chiSquarePValue1df(chi2),
    p: round(chiSquarePValue1df(chi2), 4),
    significant: chiSquarePValue1df(chi2) < 0.05,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Planning-fallacy ratio (same-unit only)                          */
/* ------------------------------------------------------------------ */

/**
 * Exact two-sided sign test. Below the floor the ratio is not printed; above
 * it, this says whether the direction is real or one ugly outlier.
 */
export function signTest(ratios = []) {
  const usable = (Array.isArray(ratios) ? ratios : []).filter((value) => Number.isFinite(value) && value > 0);
  const above = usable.filter((value) => value > 1).length;
  const below = usable.filter((value) => value < 1).length;
  const n = above + below;
  if (!n) return { n: 0, above, below, p: null, direction: 'none' };
  const k = Math.min(above, below);
  let tail = 0;
  for (let i = 0; i <= k; i += 1) tail += binomialCoefficient(n, i);
  const p = Math.min(1, (2 * tail) / 2 ** n);
  return {
    n,
    above,
    below,
    p: round(p, 4),
    direction: above > below ? 'over' : below > above ? 'under' : 'balanced',
  };
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

function median(values = []) {
  const nums = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Declared effort-days against recorded actual effort-days, for the one source
 * that stores both. Calendar duration is deliberately NOT in this ratio: a
 * team-effort estimate and a calendar duration are different units, and
 * dividing one by the other would manufacture a "planning fallacy" out of a
 * unit error.
 */
export function effortBias(items = [], floor = SURVIVAL_DEFAULTS.survBiasFloor) {
  const pairs = (Array.isArray(items) ? items : [])
    .filter((item) => Number.isFinite(item.declaredDays) && item.declaredDays > 0 && Number.isFinite(item.actualDays) && item.actualDays >= 0)
    .map((item) => ({ key: item.key, title: item.title, declared: item.declaredDays, actual: item.actualDays, ratio: item.actualDays / item.declaredDays }));
  if (pairs.length < floor) {
    return {
      available: false,
      n: pairs.length,
      floor,
      reason: `${pairs.length} item(s) carry both a declared effort estimate and a recorded actual effort; the floor is ${floor}`,
      pairs: [],
    };
  }
  const ratios = pairs.map((pair) => pair.ratio);
  const test = signTest(ratios);
  return {
    available: true,
    n: pairs.length,
    floor,
    medianRatio: round(median(ratios), 2),
    direction: test.direction,
    p: test.p,
    pairs: pairs.slice(0, 20),
    reason: '',
  };
}

/* ------------------------------------------------------------------ */
/* 7. The report                                                      */
/* ------------------------------------------------------------------ */

function classReport(key, label, items, conventions) {
  const curve = kaplanMeier(items);
  const open = items.filter((item) => !item.exitType);
  const exits = curve.completions + curve.abandonments;
  const completionQuantile = incidenceQuantile(curve, 0.5);
  const completionQuartile = incidenceQuantile(curve, 0.25);
  const median = medianExit(curve);
  const abandonShare = exits ? round((curve.abandonments / exits) * 100, 1) : null;
  const hazard = hazardBuckets(items, conventions.hazardBuckets);
  return {
    key,
    label,
    unit: CLASS_BY_KEY.get(key)?.unit || 'calendar days',
    note: CLASS_BY_KEY.get(key)?.note || '',
    items,
    open,
    curve,
    counts: {
      total: items.length,
      completed: curve.completions,
      abandoned: curve.abandonments,
      censored: curve.censored,
      open: open.length,
      exits,
    },
    abandonSharePct: abandonShare,
    median,
    completionQuantile,
    completionQuartile,
    hazard,
    bias: effortBias(items, conventions.biasFloor),
    evidenceFloorMet: curve.n >= conventions.minAtRisk,
  };
}

/**
 * The two fixed start cohorts shared by the drift test and its decomposition:
 * recent = started 30–89 days ago, prior = 90–149 days ago, each item's
 * follow-up administratively censored at 30 days. Because every item in
 * either cohort could have been observed for the full 30 days, the only
 * censoring inside the window is at day 30 itself — which is precisely what
 * makes the day-30 incidence comparison in `driftDecomposition` a clean
 * two-sample landmark problem rather than an extrapolation.
 */
export function driftCohorts(items, key, today) {
  const cohorts = { recent: [], prior: [] };
  for (const item of (Array.isArray(items) ? items : []).filter((r) => r && r.kind === key)) {
    const age = daysBetween(item.startedOn, today);
    const group = age >= 30 && age < 90 ? 'recent' : age >= 90 && age < 150 ? 'prior' : null;
    if (!group) continue;
    cohorts[group].push({
      ...item,
      cohort: group,
      elapsedDays: Math.min(item.elapsedDays, 30),
      exitType: item.elapsedDays <= 30 ? item.exitType : null,
    });
  }
  return cohorts;
}

/** Calendar drift: fixed, non-overlapping start cohorts; equal 30-day follow-up.
 * Recent starts: 30–89 days ago; prior: 90–149. No adaptive cutpoint search.
 * All exits (including abandonment) are tested, NOT completion performance.
 * Holm step-down controls the six-class family at .05 for this scan only.
 */
export function calendarDrift(items, today) {
  const rows = SURVIVAL_CLASSES.map(({ key, label }) => {
    const cohorts = driftCohorts(items, key, today);
    const base = { key, label, recentN: cohorts.recent.length, priorN: cohorts.prior.length,
      horizonDays: 30, available: false, changed: false, adjustedP: null };
    if (Math.min(base.recentN, base.priorN) < 8) return { ...base, reason: 'Needs at least 8 dated items in each mature start cohort.' };
    const all = [...cohorts.recent, ...cohorts.prior];
    if (all.filter((r) => r.exitType).length < 6) return { ...base, reason: 'Needs at least 6 observed exits within 30 days.' };
    const test = logRank(all, (r) => r.cohort);
    if (!test) return { ...base, reason: 'No estimable log-rank variance.' };
    const restrictedMean = (rows) => {
      const curve = kaplanMeier(rows);
      let area = 0, previous = 0, survival = 1;
      for (const step of curve.steps) {
        area += survival * (step.time - previous);
        previous = step.time; survival = step.survival;
      }
      return area + survival * (30 - previous);
    };
    const recentDays = restrictedMean(cohorts.recent), priorDays = restrictedMean(cohorts.prior);
    return { ...base, available: true, reason: '', p: test.rawP,
      recentDays: round(recentDays, 2), priorDays: round(priorDays, 2),
      deltaDays: round(recentDays - priorDays, 2),
      direction: recentDays > priorDays ? 'slower exit' : recentDays < priorDays ? 'faster exit' : 'unchanged' };
  });
  let running = 0;
  rows.filter((r) => r.available).sort((a, b) => a.p - b.p).forEach((r, i) => {
    running = Math.max(running, Math.min(1, r.p * (SURVIVAL_CLASSES.length - i)));
    r.adjustedP = round(running, 4); r.changed = running < 0.05;
  });
  return rows;
}

/**
 * The endpoint incidence of one cause on a cohort curve whose times are all
 * capped at the landmark τ = 30: the last step carries F_k(30), and its
 * delta-method standard error is the variance *at* 30 because the step
 * function is constant afterwards. Reading from the shared `kaplanMeier`
 * keeps exactly one implementation of the estimator and its variance in the
 * app.
 */
function cifEndpoint(curve, cause) {
  const steps = curve?.steps || [];
  if (!steps.length) return { value: 0, se: 0 };
  const last = steps[steps.length - 1];
  return cause === 'completed'
    ? { value: last.cif, se: last.cifSe ?? 0 }
    : { value: last.cifA, se: last.cifAse ?? 0 };
}

/**
 * Pepe & Mori (1993) integrated difference ∫₀^τ [F_recent − F_prior] dt over
 * the two step functions, in incidence-days. Printed as a descriptive effect
 * size only: the inferential test is the landmark Wald test at day 30, whose
 * variance this codebase can compute exactly from the Aalen estimator. The
 * curve-wide Pepe–Mori and Gray (1988) tests are deliberately not
 * approximated — Gray's variance under risk sets that retain subjects after
 * a competing event is not the log-rank variance, and printing the wrong
 * one would be a fabricated p-value.
 */
function integratedCifDifference(recentCurve, priorCurve, cause, tau = 30) {
  const at = (curve, t) => (cause === 'completed' ? curve.cifAt(t) : curve.cifAbandonAt(t));
  const times = [...new Set([
    0,
    ...(recentCurve.steps || []).map((step) => step.time),
    ...(priorCurve.steps || []).map((step) => step.time),
  ].filter((t) => t < tau))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < times.length; i += 1) {
    const start = times[i];
    const end = i + 1 < times.length ? times[i + 1] : tau;
    area += (at(recentCurve, start) - at(priorCurve, start)) * (end - start);
  }
  return area;
}

/* Lanczos log-gamma: enough accuracy (≪1e-9 relative) for exact-test tails. */
function logGamma(z) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  const w = z - 1;
  let x = c[0];
  for (let i = 1; i < c.length; i += 1) x += c[i] / (w + i);
  const t = w + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (w + 0.5) * Math.log(t) - t + Math.log(x);
}

const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

/**
 * Fisher (1935) exact two-sided p-value for a 2×2 table [[a,b],[c,d]],
 * summing every table with the same margins whose hypergeometric probability
 * does not exceed the observed table's. Used only at the Wald test's boundary
 * (see `causeDecomposition`), never as a second opinion beside it.
 */
export function fisherExactTwoSided(a, b, c, d) {
  const n1 = a + b;
  const m1 = a + c;
  const N = a + b + c + d;
  if (!N || !n1 || n1 === N || !m1 || m1 === N) return 1;
  const logP = (k) => logChoose(m1, k) + logChoose(N - m1, n1 - k) - logChoose(N, n1);
  const lo = Math.max(0, n1 - (N - m1));
  const hi = Math.min(n1, m1);
  const observed = logP(a);
  let p = 0;
  for (let k = lo; k <= hi; k += 1) {
    const lp = logP(k);
    if (lp <= observed + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

function causeDecomposition(cause, recentCurve, priorCurve, cohorts) {
  const eventsOf = (rows) => rows.filter((row) => row.exitType === cause).length;
  const events = { recent: eventsOf(cohorts.recent), prior: eventsOf(cohorts.prior) };
  events.pooled = events.recent + events.prior;
  const base = {
    cause, events, refused: false, reason: '',
    prior: null, recent: null, delta: null, deltaSe: null, lo: null, hi: null,
    z: null, p: null, adjustedP: null, significant: false, direction: null,
    integratedDelta: null, test: null,
  };
  if (events.pooled < DRIFT_MIN_CAUSE_EVENTS) {
    return {
      ...base,
      refused: true,
      reason: `Only ${events.pooled} ${cause === 'completed' ? 'completion' : 'abandonment'}(s) within 30 days across both cohorts; the floor is ${DRIFT_MIN_CAUSE_EVENTS}. Below it the cause is reported as counts, not as a drift share.`,
    };
  }
  const recent = cifEndpoint(recentCurve, cause);
  const prior = cifEndpoint(priorCurve, cause);
  const delta = recent.value - prior.value;
  const deltaSe = Math.sqrt(recent.se ** 2 + prior.se ** 2);
  const block = {
    ...base,
    prior: round(prior.value, 4),
    recent: round(recent.value, 4),
    priorSe: round(prior.se, 4),
    recentSe: round(recent.se, 4),
    delta: round(delta, 4),
    integratedDelta: round(integratedCifDifference(recentCurve, priorCurve, cause), 2),
  };
  if (!(deltaSe > 0)) {
    // The Wald boundary: an incidence of exactly 0 or 1 in both cohorts has
    // zero estimated variance, so the z-ratio is undefined however large the
    // gap. Three honest exits, in order: identical shares carry no evidence
    // (p = 1, not a refusal); when every item in both cohorts was observable
    // for the full 30 days — censoring only at day 30 itself, which the fixed
    // mature cohorts usually guarantee and which is checked here, never
    // assumed — the day-30 incidence is a plain proportion and Fisher's exact
    // test on the counts is exact at the boundary; otherwise the cause is
    // refused rather than given a p-value neither method can support.
    if (delta === 0) return { ...block, deltaSe: 0, test: 'boundary-equal', p: 1 };
    const fullyObserved = (rows) => rows.every((row) => row.exitType || row.elapsedDays >= 30);
    if (fullyObserved(cohorts.recent) && fullyObserved(cohorts.prior)) {
      const p = fisherExactTwoSided(
        events.recent, cohorts.recent.length - events.recent,
        events.prior, cohorts.prior.length - events.prior,
      );
      return { ...block, deltaSe: 0, test: 'fisher', p };
    }
    return {
      ...block,
      refused: true,
      reason: 'The incidence sits on the 0/1 boundary in both cohorts and some items were censored before day 30, so neither the Wald variance nor an exact count test is available. The day-30 shares are shown; no p-value is attached.',
    };
  }
  const z = delta / deltaSe;
  return {
    ...block,
    deltaSe: round(deltaSe, 4),
    // A difference of two probabilities lives in [−1, 1]; the Wald interval is
    // clipped to that range for printing, as the log–log band keeps the
    // curve's own interval inside [0, 1]. The test itself is unaffected.
    lo: round(Math.max(-1, delta - Z_95 * deltaSe), 4),
    hi: round(Math.min(1, delta + Z_95 * deltaSe), 4),
    z: round(z, 3),
    test: 'wald',
    p: 2 * (1 - normalCdf(Math.abs(z))),
  };
}

/**
 * Drift decomposition: *which* exit moved?
 *
 * `calendarDrift` tests time to *any* exit, so it cannot distinguish "less
 * work finishes" from "more work is dropped" — and those two readings demand
 * opposite responses (completion capacity vs intake discipline). Worse, a
 * one-for-one swap of completions for abandonments at unchanged speed leaves
 * the any-exit curve untouched: every cycle-time view stays green while the
 * delivery system quietly stops finishing things. This decomposition exists
 * to catch that case.
 *
 * At the 30-day landmark the Aalen–Johansen partition is exact in each
 * cohort — F_complete(30) + F_abandon(30) + S(30) = 1 — so the change in
 * "still open at day 30" decomposes without remainder into the completion
 * change plus the abandonment change (`identityResidual` is that claim,
 * checked, not asserted). Each cause is compared across cohorts with a
 * two-sample Wald test on the incidence difference using the delta-method
 * variances of the Aalen–Johansen estimator; at the 0/1 boundary, where that
 * variance is truly zero and the Wald ratio undefined, a fully-observed
 * cohort pair falls back to Fisher's exact test on the day-30 counts (checked
 * per cohort, never assumed). Holm step-down controls the fixed family of
 * 6 classes × 2 causes for this scan. A cause with fewer than `DRIFT_MIN_CAUSE_EVENTS`
 * pooled events is refused, not estimated. Association only: a verdict says
 * the recorded exit mix changed, never why.
 */
export function driftDecomposition(items, today) {
  const rows = SURVIVAL_CLASSES.map(({ key, label }) => {
    const cohorts = driftCohorts(items, key, today);
    const base = {
      key, label, horizonDays: 30,
      recentN: cohorts.recent.length, priorN: cohorts.prior.length,
      available: false, reason: '', verdict: 'refused', adverse: false, favorable: false,
      completion: null, abandonment: null, stillOpen: null, identityResidual: null,
    };
    if (Math.min(base.recentN, base.priorN) < DRIFT_MIN_COHORT) {
      return {
        ...base,
        reason: `Needs at least ${DRIFT_MIN_COHORT} dated items in each mature start cohort (recent ${base.recentN}, prior ${base.priorN}).`,
      };
    }
    const recentCurve = kaplanMeier(cohorts.recent);
    const priorCurve = kaplanMeier(cohorts.prior);
    const completion = causeDecomposition('completed', recentCurve, priorCurve, cohorts);
    const abandonment = causeDecomposition('abandoned', recentCurve, priorCurve, cohorts);
    const stillRecent = recentCurve.survivalAt(30);
    const stillPrior = priorCurve.survivalAt(30);
    const openDelta = stillRecent - stillPrior;
    const completionDelta = cifEndpoint(recentCurve, 'completed').value - cifEndpoint(priorCurve, 'completed').value;
    const abandonDelta = cifEndpoint(recentCurve, 'abandoned').value - cifEndpoint(priorCurve, 'abandoned').value;
    return {
      ...base,
      available: true,
      completion,
      abandonment,
      stillOpen: { prior: round(stillPrior, 4), recent: round(stillRecent, 4), delta: round(openDelta, 4) },
      identityResidual: round(openDelta + completionDelta + abandonDelta, 6),
    };
  });

  const tested = [];
  for (const row of rows) {
    if (!row.available) continue;
    for (const block of [row.completion, row.abandonment]) {
      if (block && !block.refused && block.p !== null) tested.push(block);
    }
  }
  let running = 0;
  tested.sort((a, b) => a.p - b.p).forEach((block, index) => {
    running = Math.max(running, Math.min(1, block.p * (DRIFT_FAMILY_SIZE - index)));
    block.adjustedP = round(running, 4);
    block.significant = running < 0.05;
    block.direction = block.significant ? (block.delta > 0 ? 'up' : block.delta < 0 ? 'down' : null) : null;
  });

  for (const row of rows) {
    if (!row.available) continue;
    const c = row.completion;
    const a = row.abandonment;
    const cDown = Boolean(c?.significant && c.direction === 'down');
    const cUp = Boolean(c?.significant && c.direction === 'up');
    const aUp = Boolean(a?.significant && a.direction === 'up');
    const aDown = Boolean(a?.significant && a.direction === 'down');
    row.adverse = cDown || aUp;
    row.favorable = (cUp || aDown) && !row.adverse;
    row.verdict = cDown && aUp ? 'substitution'
      : cUp && aDown ? 'broad-improvement'
        : cDown && aDown ? 'stall'
          : cUp && aUp ? 'churn'
            : cDown ? 'completion-decline'
              : aUp ? 'abandonment-rise'
                : cUp ? 'completion-gain'
                  : aDown ? 'abandonment-decline'
                    : 'no-attributable-shift';
  }
  return rows;
}

/** The report every screen, signal and rule reads. Pure. */
export function survivalReport(state, now = new Date(), settings = {}) {
  const conventions = conventionsFromSettings(settings);
  const harvest = harvestWorkItems(state, now);
  const today = harvest.today;

  const classes = SURVIVAL_CLASSES.map((spec) => {
    const items = harvest.items.filter((item) => item.kind === spec.key);
    return classReport(spec.key, spec.label, items, conventions);
  });
  const drift = calendarDrift(harvest.items, today);
  const decomposition = driftDecomposition(harvest.items, today);
  for (const klass of classes) {
    klass.drift = drift.find((r) => r.key === klass.key);
    klass.decomp = decomposition.find((r) => r.key === klass.key);
  }
  const pooled = classReport('all', 'All dated work', harvest.items, conventions);

  const openItems = harvest.items
    .filter((item) => !item.exitType)
    .map((item) => {
      const klass = classes.find((row) => row.key === item.kind) || pooled;
      const reading = conditionalCompletion(klass.curve, item.elapsedDays, conventions.horizonDays, {
        minAtRisk: conventions.minAtRisk,
        maxObservedDays: klass.curve.maxObservedDays,
      });
      const quantile = klass.completionQuantile;
      const pastMedian = quantile.reached && item.elapsedDays > quantile.days;
      const percentile = agePercentile(klass.items, item.elapsedDays, conventions.minAtRisk);
      return {
        item,
        klass,
        reading,
        percentile,
        pastMedian,
        overdueBy: quantile.reached ? item.elapsedDays - quantile.days : null,
        atRisk: reading.atRisk ?? null,
      };
    })
    .sort((a, b) => {
      const pa = a.reading.probability ?? 2;
      const pb = b.reading.probability ?? 2;
      if (pa !== pb) return pa - pb;
      return b.item.elapsedDays - a.item.elapsedDays;
    });

  const readings = (Array.isArray(state?.survivalReadings) ? state.survivalReadings : [])
    .map((reading) => ({ reading, grade: gradeReading(reading, now) }));

  const tracked = new Set(readings.flatMap((row) => (row.reading.predictions || []).map((p) => `${p.sourceType}:${p.sourceId}`)));

  return {
    today,
    conventions,
    harvest,
    classes,
    pooled,
    openItems,
    readings,
    counts: {
      items: harvest.items.length,
      open: openItems.length,
      completed: harvest.items.filter((i) => i.exitType === 'completed').length,
      abandoned: harvest.items.filter((i) => i.exitType === 'abandoned').length,
      abandonedUndated: harvest.items.filter((i) => i.partial).length,
      undated: harvest.undated,
      classesWithEvidence: classes.filter((row) => row.evidenceFloorMet).length,
      readings: readings.length,
      frozen: readings.filter((row) => row.reading.status === 'frozen').length,
      graded: readings.filter((row) => row.reading.status === 'graded').length,
      atRiskBelowFloor: openItems.filter((row) => !row.reading.available).length,
      untracked: openItems.filter((row) => !tracked.has(`${row.item.sourceType}:${row.item.sourceId}`)).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 8. Frozen readings and their out-of-sample grade                    */
/* ------------------------------------------------------------------ */

/**
 * A frozen reading is a set of per-item completion probabilities at a horizon
 * and a review date. Grading is Brier (1950) over the items whose outcome is
 * observable at review, with the pooled completion rate as the base rate, so
 * the page can say whether the curve beat the naive answer or not.
 */
export function buildPredictionSet(report, conventions, limit = null) {
  const cap = limit ?? conventions.maxPredictions;
  return report.openItems
    .filter((row) => row.reading.available && Number.isFinite(row.reading.probability))
    .slice(0, cap)
    .map((row) => ({
      itemKey: row.item.key,
      sourceType: row.item.sourceType,
      sourceId: row.item.sourceId,
      title: row.item.title,
      kind: row.item.kind,
      elapsedDays: row.item.elapsedDays,
      probabilityPct: round(row.reading.probability * 100, 1),
      atRisk: row.reading.atRisk ?? null,
      classKey: row.klass.key,
    }));
}

export function gradeReading(reading, now = new Date()) {
  if (!reading || !reading.predictions?.length) {
    return { available: false, reason: 'the reading froze no prediction' };
  }
  const gradedOn = dayKey(now);
  const reviewOn = day(reading.reviewOn);
  const settled = [];
  for (const prediction of reading.predictions) {
    const outcome = prediction.outcome;
    if (!outcome) continue;
    const dayOf = outcome.completedOn || outcome.abandonedOn;
    if (!dayOf || !reviewOn) continue;
    // The frozen claim was "completes on or before the review date". An
    // abandonment, or a completion after the date, is a 0 — not missing data.
    const observed = dayOf <= reviewOn && outcome.completedOn ? 1 : 0;
    settled.push({ prediction, observed });
  }
  if (!settled.length) {
    return {
      available: false,
      reason: reviewOn && gradedOn < reviewOn
        ? `the review date (${reviewOn}) has not arrived`
        : 'no predicted item has settled yet',
    };
  }
  const brier = settled.reduce((sum, row) => {
    const p = row.prediction.probabilityPct / 100;
    return sum + (p - row.observed) ** 2;
  }, 0) / settled.length;
  const baseRate = settled.reduce((sum, row) => sum + row.observed, 0) / settled.length;
  const baseline = settled.reduce((sum, row) => sum + (baseRate - row.observed) ** 2, 0) / settled.length;
  const skill = baseline > 0 ? 1 - brier / baseline : null;
  return {
    available: true,
    settledCount: settled.length,
    brier: round(brier, 4),
    baselineBrier: round(baseline, 4),
    baseRatePct: round(baseRate * 100, 1),
    skillScore: skill === null ? null : round(skill, 3),
    beatsBaseRate: skill === null ? null : skill > 0,
    hits: settled.filter((row) => row.observed === 1).length,
    misses: settled.filter((row) => row.observed === 0).length,
    // Below the floor the module refuses to call a skill score a property of
    // the model rather than of five lucky items.
    belowFloor: settled.length < 5,
  };
}

/**
 * Attach the observed outcome of an item to a frozen prediction. Called when a
 * reading is graded; the reading is never rewritten afterwards.
 */
export function attachOutcomes(reading, state) {
  const lookup = {
    portfolio: (id) => (state?.portfolio || []).find((row) => row.id === id),
    case: (id) => (state?.cases || []).find((row) => row.id === id),
    requisition: (id) => (state?.requisitions || []).find((row) => row.id === id),
    change: (id) => (state?.changes || []).find((row) => row.id === id),
    delegation: (id) => (state?.delegations || []).find((row) => row.id === id),
    decision: (id) => (state?.decisions || []).find((row) => row.id === id),
  };
  return (reading?.predictions || []).map((prediction) => {
    const finder = lookup[prediction.sourceType];
    const source = finder ? finder(prediction.sourceId) : null;
    if (!source) {
      return { ...prediction, outcome: { completedOn: null, abandonedOn: null, missing: true } };
    }
    let completedOn = null;
    let abandonedOn = null;
    if (prediction.sourceType === 'portfolio') {
      if (source.status === 'done') completedOn = day(source.completedOn);
    } else if (prediction.sourceType === 'case') {
      if (source.status === 'resolved' || source.status === 'closed') completedOn = day(source.resolvedOn);
    } else if (prediction.sourceType === 'requisition') {
      if (source.status === 'filled') completedOn = day(source.closedOn);
      if (source.status === 'cancelled') abandonedOn = day(source.closedOn);
    } else if (prediction.sourceType === 'change') {
      if (source.status === 'anchored') completedOn = day(source.anchoredOn);
      if (source.status === 'abandoned') abandonedOn = day(source.closedOn || source.abandonedOn);
    } else if (prediction.sourceType === 'delegation') {
      if (source.status === 'done') completedOn = day(source.completedOn);
      if (source.status === 'returned') abandonedOn = day(source.returnedOn);
    } else if (prediction.sourceType === 'decision') {
      if (text(source.chosen, 300)) completedOn = day(source.decidedOn);
    }
    return { ...prediction, outcome: { completedOn, abandonedOn, missing: !completedOn && !abandonedOn } };
  });
}

/* ------------------------------------------------------------------ */
/* 9. Signals, attention, brief                                        */
/* ------------------------------------------------------------------ */

export function survivalSignals(state, now = new Date(), settings = {}) {
  const report = survivalReport(state, now, settings);
  const { conventions } = report;
  const signals = [];
  const classRoute = (key) => `#/survival?panel=classes&class=${encodeURIComponent(key)}`;

  for (const klass of report.classes.filter((r) => r.drift?.changed)) {
    signals.push({ ruleId: 'SURV-08', domain: 'Delivery survival', severity: 3,
      title: `${klass.label}: calendar-cohort exit behaviour changed`,
      detail: `Recent versus prior restricted mean time to any exit changed by ${klass.drift.deltaDays} days over equal 30-day follow-up. Holm-adjusted p=${klass.drift.adjustedP}. Historical probabilities may not transport; this is not causal evidence or a completion-quality score.`,
      evidence: [`Recent n=${klass.drift.recentN}; prior n=${klass.drift.priorN}`],
      action: { label: 'Review drift', route: `#/survival?panel=classes&class=${klass.key}` } });
  }
  // SURV-09 / SURV-10 — the decomposition of the drift into its two causes.
  // SURV-10 is the case no any-exit view can see: completions replaced by
  // abandonments at unchanged speed. It gets its own id precisely because
  // SURV-08 stays silent there.
  const pp = (value) => `${value > 0 ? '+' : ''}${round(value * 100, 1)}pp`;
  for (const klass of report.classes) {
    const d = klass.decomp;
    if (!d?.available || !d.adverse) continue;
    const causeLine = (label, block) => (block.refused
      ? `${label} by day 30: ${block.events.pooled} event(s) pooled — untested (${block.prior === null ? 'below the event floor' : 'no measurable variance'})`
      : `${label} by day 30: ${round(block.prior * 100, 1)}% → ${round(block.recent * 100, 1)}% (${pp(block.delta)}${block.adjustedP !== null ? `, Holm p=${block.adjustedP}` : ''})`);
    const evidence = [
      causeLine('Completed', d.completion),
      causeLine('Abandoned', d.abandonment),
      `Still open at day 30: ${round(d.stillOpen.prior * 100, 1)}% → ${round(d.stillOpen.recent * 100, 1)}% · recent n=${d.recentN}, prior n=${d.priorN}`,
    ];
    if (d.verdict === 'substitution' && !klass.drift?.changed) {
      signals.push({ ruleId: 'SURV-10', domain: 'Delivery survival', severity: 3,
        title: `${klass.label}: abandonments are quietly replacing completions`,
        detail: 'Time to any exit did not change, so cycle-time views look stable — but what an exit *is* changed. By day 30 the recent cohort finishes less and gives up more than the prior cohort (competing-risk incidence, Holm-controlled across classes and causes). Speed is not the problem; finishing is. Association, not cause.',
        evidence,
        action: { label: 'Review the exit mix', route: `#/survival?panel=classes&class=${klass.key}` } });
      continue;
    }
    const titles = {
      substitution: `${klass.label}: abandonments are replacing completions`,
      'completion-decline': `${klass.label}: less work finishes within 30 days than the prior cohort`,
      'abandonment-rise': `${klass.label}: more work is abandoned within 30 days than the prior cohort`,
      stall: `${klass.label}: both completions and abandonments fell — work is sitting`,
      churn: `${klass.label}: exits of both kinds rose — finishes and give-ups alike`,
    };
    signals.push({ ruleId: 'SURV-09', domain: 'Delivery survival', severity: 3,
      title: titles[d.verdict] || `${klass.label}: the 30-day exit mix changed`,
      detail: 'The calendar drift decomposes by cause at the 30-day landmark (Aalen–Johansen incidence, Holm-controlled across six classes × two causes). A completion-led change asks about capacity and blockers; an abandonment-led change asks about intake and triage. The test attributes the recorded shift; it does not explain it.',
      evidence,
      action: { label: 'Review the exit mix', route: `#/survival?panel=classes&class=${klass.key}` } });
  }
  for (const klass of report.classes) {
    if (!klass.counts.exits) continue;
    // SURV-01 — systematic effort underestimation, printed only above the floor
    // and only when the sign test says the direction is not one outlier.
    if (klass.bias.available && klass.bias.direction === 'over' && klass.bias.medianRatio > 1.15 && klass.bias.p !== null && klass.bias.p <= 0.1) {
      signals.push({
        ruleId: 'SURV-01',
        domain: 'Delivery survival',
        severity: 3,
        title: `${klass.label}: recorded effort is about ${klass.bias.medianRatio}× the declared estimate`,
        detail: `${klass.bias.n} item(s) carry both a declared effort estimate and a recorded actual effort. The median ratio is ${klass.bias.medianRatio} and the exact sign test gives p = ${klass.bias.p} on ${klass.bias.n} pairs. This is the planning fallacy measured on your own record, not on a survey.`,
        evidence: [
          `Median actual ÷ declared: ${klass.bias.medianRatio}× over ${klass.bias.n} pair(s)`,
          `Sign-test p: ${klass.bias.p}`,
        ],
        action: { label: 'Open the class', route: classRoute(klass.key) },
      });
    }
    // SURV-02 — the class, not the item, is the problem.
    if (klass.abandonSharePct !== null && klass.abandonSharePct >= conventions.abandonSharePct) {
      signals.push({
        ruleId: 'SURV-02',
        domain: 'Delivery survival',
        severity: 3,
        title: `${klass.label}: ${klass.abandonSharePct}% of exits are abandonments, not completions`,
        detail: 'Counting these as "still running" would make the class look healthier than it is. The cumulative incidence of completion is the number that leaves abandonment in the denominator.',
        evidence: [`${klass.counts.abandoned} abandoned of ${klass.counts.exits} exits`, `Threshold ${conventions.abandonSharePct}%`],
        action: { label: 'Open the class', route: classRoute(klass.key) },
      });
    }
    // SURV-03 — a front-loaded hazard means waiting is a losing strategy.
    if (klass.hazard.ratio && klass.hazard.ratio.value >= 2) {
      signals.push({
        ruleId: 'SURV-03',
        domain: 'Delivery survival',
        severity: 2,
        title: `${klass.label}: exit is ${klass.hazard.ratio.value}× faster in the first ${klass.hazard.ratio.firstBucket} than after`,
        detail: 'A front-loaded hazard means an item that has survived a long time is less likely to exit next week, not more. "It will close soon" is contradicted by your own record; escalation is now the cheaper option.',
        evidence: [`Rate ratio ${klass.hazard.ratio.value} (95% CI ${klass.hazard.ratio.lo}–${klass.hazard.ratio.hi})`, `${klass.hazard.ratio.firstBucket} vs ${klass.hazard.ratio.lastBucket}`],
        action: { label: 'Open the hazard', route: `#/survival?panel=classes&class=${encodeURIComponent(klass.key)}` },
      });
    }
  }

  // SURV-04 — open items past their class's completion median with no owner.
  const unowned = report.openItems.filter((row) => !row.item.ownerId && row.pastMedian);
  if (unowned.length) {
    signals.push({
      ruleId: 'SURV-04',
      domain: 'Delivery survival',
      severity: 3,
      title: `${unowned.length} item(s) are past their class's completion median and have no owner`,
      detail: 'Work that passes the point where comparable work usually finishes, and that nobody owns, does not resolve itself. Assign an owner or decide to stop it — both are honest answers.',
      evidence: unowned.slice(0, 5).map((row) => `${row.item.title} · ${row.item.elapsedDays}d of ${row.klass.completionQuantile.days}d`),
      action: { label: 'Open the queue', route: '#/survival?panel=queue' },
    });
  }

  // SURV-05 — the reading floor was not met: the honest answer is "unknown".
  const belowFloor = report.openItems.filter((row) => !row.reading.available && row.pastMedian);
  if (belowFloor.length) {
    signals.push({
      ruleId: 'SURV-05',
      domain: 'Delivery survival',
      severity: 2,
      title: `${belowFloor.length} item(s) are past the class median where the curve has too few comparables to read`,
      detail: 'The page will not print a probability here: below the at-risk floor the estimate would be a guess wearing a percentage. The age of the item is still a fact, and it is past the median.',
      evidence: belowFloor.slice(0, 5).map((row) => `${row.item.title} · ${row.item.elapsedDays}d · ${row.reading.reason}`),
      action: { label: 'Open the queue', route: '#/survival?panel=queue' },
    });
  }

  // SURV-06 — a frozen reading whose review has passed and is still ungraded.
  for (const { reading, grade } of report.readings) {
    if (reading.status === 'frozen' && reading.reviewOn && reading.reviewOn < report.today && !grade.available) {
      signals.push({
        ruleId: 'SURV-06',
        domain: 'Delivery survival',
        severity: 2,
        title: `The reading frozen for ${reading.reviewOn} has not been graded`,
        detail: 'A forecast nobody scores is a forecast nobody can learn from. Grade it: the items that settled against the date are the whole evidence base.',
        evidence: [`Horizon ${reading.horizonDays} day(s)`, `${(reading.predictions || []).length} predicted item(s)`],
        action: { label: 'Open the reading', route: `#/survival?panel=readings&reading=${encodeURIComponent(reading.id)}` },
      });
    }
    // SURV-07 — the frozen reading lost to the base rate.
    if (reading.status === 'graded' && grade.available && grade.skillScore !== null && grade.skillScore < 0 && !grade.belowFloor) {
      signals.push({
        ruleId: 'SURV-07',
        domain: 'Delivery survival',
        severity: 3,
        title: `The ${reading.label} reading scored worse than the base rate`,
        detail: `Brier ${grade.brier} against a ${grade.baselineBrier} base rate over ${grade.settledCount} settled item(s), a skill score of ${grade.skillScore}. The curve is not describing this work yet — narrow the class or shorten the horizon.`,
        evidence: [`Settled ${grade.settledCount}`, `Hits ${grade.hits} · misses ${grade.misses}`],
        action: { label: 'Open the reading', route: `#/survival?panel=readings&reading=${encodeURIComponent(reading.id)}` },
      });
    }
  }
  return signals;
}

export function survivalAttentionCount(state, now = new Date(), settings = {}) {
  return survivalSignals(state, now, settings).filter((signal) => signal.severity >= 3).length;
}

/** Deterministic internal brief. Titles of external records are redacted. */
export function survivalBrief(state, now = new Date(), settings = {}) {
  const report = survivalReport(state, now, settings);
  const { conventions } = report;
  const lines = [];
  lines.push('DELIVERY SURVIVAL — INTERNAL BRIEF');
  lines.push(`Generated ${report.today} · ${report.counts.items} dated item(s): ${report.counts.completed} completed, ${report.counts.abandoned} abandoned, ${report.counts.open} open (censored, never dropped)`);
  lines.push('');
  if (!report.counts.items) {
    lines.push('No dated work exists yet. A survival curve cannot be invented; it needs closed and open records with a start date.');
    return lines.join('\n');
  }
  if (report.counts.undated) {
    lines.push(`${report.counts.undated} record(s) have no start date and are excluded from every figure below — counted, not assumed.`);
    lines.push('');
  }
  for (const klass of report.classes) {
    if (!klass.counts.total) {
      lines.push(`- ${klass.label}: no dated record. No reading.`);
      continue;
    }
    const q = klass.completionQuantile;
    if (klass.drift?.changed) lines.push(`  TRANSPORT WARNING: calendar-cohort shift, Holm p=${klass.drift.adjustedP}; historical forecasts need review.`);
    if (klass.decomp?.available && klass.decomp.verdict !== 'no-attributable-shift') {
      const d = klass.decomp;
      const share = (block) => (block.prior === null ? 'untested' : `${round(block.prior * 100, 1)}%→${round(block.recent * 100, 1)}%`);
      lines.push(`  EXIT-MIX ATTRIBUTION (day 30, recent vs prior cohort): completed ${share(d.completion)} · abandoned ${share(d.abandonment)} · still open ${round(d.stillOpen.prior * 100, 1)}%→${round(d.stillOpen.recent * 100, 1)}% — ${DECOMP_VERDICT_LABELS[d.verdict]}. Association, not cause.`);
    }
    lines.push(`- ${klass.label}: n=${klass.counts.total} (${klass.counts.completed} completed, ${klass.counts.abandoned} abandoned, ${klass.counts.censored} open)`);
    lines.push(`  Completion incidence: ${q.reached ? `50% by ${q.days} day(s) (bracket ${q.lo}–${q.hi ?? '∞'})` : 'has not reached 50% in the observed record'}`);
    lines.push(`  Naive "eventually completes" (1 − KM, all-cause survival): ${round((1 - klass.curve.survivalAt(klass.curve.maxObservedDays)) * 100, 1)}% · abandonment share of exits: ${klass.abandonSharePct ?? '—'}%`);
    if (klass.bias.available) {
      lines.push(`  Declared effort ÷ actual effort: median ${klass.bias.medianRatio}× over ${klass.bias.n} pair(s), sign-test p = ${klass.bias.p}`);
    }
    if (klass.hazard.ratio) {
      lines.push(`  Hazard rate ratio, ${klass.hazard.ratio.firstBucket} vs ${klass.hazard.ratio.lastBucket}: ${klass.hazard.ratio.value} (95% CI ${klass.hazard.ratio.lo}–${klass.hazard.ratio.hi})`);
    }
  }
  lines.push('');
  const risky = report.openItems.filter((row) => row.reading.available && row.reading.probabilityPct < conventions.riskFloorPct);
  lines.push(`Open items below the ${conventions.riskFloorPct}% completion floor over the next ${conventions.horizonDays} day(s): ${risky.length}`);
  for (const row of risky.slice(0, 12)) {
    lines.push(`  · ${row.klass.label} · ${row.item.elapsedDays}d elapsed · ${row.reading.probabilityPct}% · at risk ${row.reading.atRisk}`);
  }
  lines.push('');
  lines.push('Censoring is assumed independent of outcome, which is stated on the page rather than proven; abandonment is modelled as a competing risk precisely because that assumption is doubtful when a leader stops the slowest work first.');
  lines.push('Item titles are omitted. A survival curve is a property of a class of work in a system, not of a person.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 10. Small helpers used by the view and the rules                    */
/* ------------------------------------------------------------------ */

export function itemByKey(items, key) {
  return (Array.isArray(items) ? items : []).find((item) => item.key === key) || null;
}

/** The real, resolvable owner of an item — or nobody. Never invented. */
export function resolveOwner(state, item) {
  const people = (Array.isArray(state?.people) ? state.people : []).filter((person) => person && person.status !== 'archived');
  if (item?.ownerId) {
    const direct = people.find((person) => person.id === item.ownerId);
    if (direct) return direct.id;
  }
  const leaderName = text(state?.settings?.leaderName, 120).trim().toLowerCase();
  if (!leaderName) return null;
  const leader = people.find((person) => text(person.name, 120).trim().toLowerCase() === leaderName);
  return leader ? leader.id : null;
}

export function routeForSource(sourceType, sourceId) {
  switch (sourceType) {
    case 'portfolio': return `#/capital?item=${encodeURIComponent(sourceId)}`;
    case 'case': return `#/cases?id=${encodeURIComponent(sourceId)}`;
    case 'requisition': return `#/hiring/${encodeURIComponent(sourceId)}`;
    case 'change': return `#/changes/${encodeURIComponent(sourceId)}`;
    case 'delegation': return `#/delegations?focus=${encodeURIComponent(sourceId)}`;
    case 'decision': return `#/decisions?focus=${encodeURIComponent(sourceId)}`;
    default: return '';
  }
}

export { addDays, dayKey, daysBetween };
