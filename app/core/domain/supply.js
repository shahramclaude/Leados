/**
 * app/core/domain/supply.js — the Evidence Supply Chain read model (Schema v79).
 *
 * This module is a PURE READ MODEL plus one frozen-commitment builder. Every
 * count it prints is harvested from dated records the workspace already keeps;
 * every rate is measured over the leader's declared window; every prediction is
 * a closed-form Gamma–Poisson posterior predictive; and nothing is stored except
 * a deliberately frozen plan.
 *
 *   harvest      six evidence lines, each an adapter over existing records
 *   rate         λ measured per line (units/week), plus a recent-window rate
 *   fill         P(line reaches its floor by t) — negative binomial, no simulation
 *   verdict      met / filling / starved / unobserved / retire
 *   constraint   the line carrying the most starved demand (Theory of Constraints)
 *   capture      hours to manufacture the shortfall vs weeks to wait for it
 *   plan         a bounded greedy schedule with a printed fractional bound
 *   freeze       one prospective probability, graded once, afterwards, by Brier
 *
 * Refusals are part of the design: a line with no demand is not scheduled, a
 * line with no history prints no rate, an expected wait with no finite mean
 * prints "no finite expected wait" instead of a number, and a plan quote names
 * its independence assumption beside the assumption-free bound.
 */

import {
  SUPPLY_ENGINE_VERSION,
  SUPPLY_LIMITS,
  SUPPLY_LINES,
  SUPPLY_SIGNAL_IDS,
  SUPPLY_VERDICT_LABELS,
  SUPPLY_VERDICT_TEXT,
  SUPPLY_CAPTURE_LABELS,
  supplyLine,
} from './supplyRegistry.js';
import { normalizeSupplySettings } from './supplySchema.js';
import { addDays, dayKey, daysBetween } from '../time.js';
import { harvestReviewObservations } from './reliability.js';

const DAYS_PER_WEEK = 7;
const REPORT_CACHE = new WeakMap();

function round(n, dp = 2) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function todayOf(now) {
  return dayKey(now) || new Date().toISOString().slice(0, 10);
}

function activePeople(state) {
  return (state.people || []).filter((p) => p && p.status !== 'archived');
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

/* ------------------------------------------------------------------ */
/* 1. The closed-form predictive                                      */
/* ------------------------------------------------------------------ */

/**
 * Survival of the time to `k` further arrivals.
 *
 * With `n` arrivals observed across `windowWeeks` and a Jeffreys prior on the
 * rate (Gamma shape ½, rate 0), the posterior rate is Gamma(n + ½, windowWeeks)
 * and the predictive count N(t) is negative binomial:
 *
 *   P(N(t) = j) = C(j + r − 1, j) · p^r · (1 − p)^j,  r = n + ½,  p = W/(W + t)
 *
 * so P(T_k > t) = P(N(t) ≤ k − 1). The sum is evaluated term by term (no
 * factorials, no gamma calls) because r is fixed at a half-integer and the
 * recursion is exact in floating point for the ranges this app can reach.
 */
export function timeToFillSurvival({ n, windowWeeks, k, tWeeks }) {
  if (!Number.isFinite(k) || k <= 0) return 0;
  if (!Number.isFinite(windowWeeks) || windowWeeks <= 0) return 1;
  if (!Number.isFinite(tWeeks) || tWeeks < 0) return 1;
  const r = Math.max(0, Number(n) || 0) + 0.5;
  const p = windowWeeks / (windowWeeks + tWeeks);
  const q = 1 - p;
  let term = Math.exp(r * Math.log(p));
  let cdf = 0;
  for (let j = 0; j <= k - 1; j += 1) {
    if (!Number.isFinite(term) || term === 0) break;
    cdf += term;
    term *= ((j + r) / (j + 1)) * q;
  }
  if (!Number.isFinite(cdf)) return 1;
  return Math.min(1, Math.max(0, cdf));
}

/**
 * The q-quantile of T_k — the t by which the line has filled with probability q.
 * Solved on the survival function (S(t) = 1 − q) by bisection over a bounded
 * bracket; returns null beyond 20 years, which for this app means "not within
 * any horizon a leader could plan against".
 */
export function timeToFillQuantile({ n, windowWeeks, k, q = 0.5 }) {
  const target = Math.min(0.999, Math.max(0.001, 1 - q));
  let lo = 0;
  let hi = 52 * 20; // 20 years — beyond this the honest answer is "not in your lifetime of this record"
  if (timeToFillSurvival({ n, windowWeeks, k, tWeeks: lo }) <= target) return 0;
  if (timeToFillSurvival({ n, windowWeeks, k, tWeeks: hi }) > target) return null;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    if (timeToFillSurvival({ n, windowWeeks, k, tWeeks: mid }) > target) lo = mid;
    else hi = mid;
  }
  return round((lo + hi) / 2, 2);
}

/**
 * E[T_k] for the same predictive. The Beta-Prime mean is W·k/(r − 1), which is
 * infinite when r ≤ 1 — and r = n + ½ is below 1 whenever fewer than one
 * arrival has been observed. Returning null there is not pedantry: an expected
 * wait that does not exist is exactly what a starved line looks like.
 */
export function expectedWeeksToFill({ n, windowWeeks, k }) {
  const r = Math.max(0, Number(n) || 0) + 0.5;
  if (r <= 1 || !Number.isFinite(windowWeeks) || windowWeeks <= 0 || k <= 0) return null;
  return round((windowWeeks * k) / (r - 1), 2);
}

/* ------------------------------------------------------------------ */
/* 2. Harvesters — one per registry line                              */
/* ------------------------------------------------------------------ */

function datedUnit(id, date) {
  return id && date ? { id, date } : null;
}

const HARVESTERS = {
  /** Assumption settlements: conclusive dated outcomes only. */
  'premise-outcome': (state) => {
    const units = asArray(state.premiseOutcomes)
      .filter((row) => (row.verdict === 'held' || row.verdict === 'failed') && row.settledOn)
      .map((row) => datedUnit(row.id, String(row.settledOn).slice(0, 10)))
      .filter(Boolean);
    const settled = new Set(asArray(state.premiseOutcomes)
      .filter((row) => row.verdict === 'held' || row.verdict === 'failed')
      .map((row) => row.premiseId));
    const demand = asArray(state.premises)
      .filter((row) => row.createdAt && !settled.has(row.id))
      .map((row) => ({
        type: 'premise',
        id: row.id,
        label: String(row.title || row.statement || 'Assumption').slice(0, 90),
        openedOn: String(row.createdAt).slice(0, 10),
      }));
    return { units, demand };
  },

  /** Calls with a recorded decision day — the counterfactual's unit. */
  'decision-resolution': (state) => {
    const units = asArray(state.decisions)
      .filter((row) => row.decidedOn)
      .map((row) => datedUnit(row.id, String(row.decidedOn).slice(0, 10)))
      .filter(Boolean);
    const demand = asArray(state.decisions)
      .filter((row) => (row.outcome || 'pending') === 'pending')
      .map((row) => ({
        type: 'decision',
        id: row.id,
        label: String(row.title || 'Decision').slice(0, 90),
        openedOn: String(row.date || row.createdAt || '').slice(0, 10) || null,
      }));
    return { units, demand };
  },

  /** Delegations that closed — delivered or returned, both are outcomes. */
  'delegation-delivery': (state) => {
    const units = asArray(state.delegations)
      .filter((row) => (row.status === 'done' || row.status === 'returned'))
      .map((row) => datedUnit(row.id, String(row.completedOn || row.returnedOn || '').slice(0, 10)))
      .filter(Boolean);
    const demand = asArray(state.delegations)
      .filter((row) => row.status === 'active' && row.dueOn)
      .map((row) => ({
        type: 'delegation',
        id: row.id,
        label: String(row.title || 'Delegation').slice(0, 90),
        openedOn: String(row.delegatedOn || '').slice(0, 10) || null,
      }));
    return { units, demand };
  },

  /**
   * Completed review observations. Units come from the reliability terminal's
   * own harvester so the two surfaces can never disagree about what counts as
   * one observation — that module already resolves duplicates per person-cycle.
   */
  'review-observation': (state) => {
    const harvest = harvestReviewObservations(state, { includeArchived: false });
    const units = harvest.observations
      .map((obs) => datedUnit(obs.reviewId, String(obs.completedOn || obs.occasion).slice(0, 10)))
      .filter(Boolean);
    const reviewed = new Set(harvest.observations.map((obs) => obs.personId));
    const demand = activePeople(state)
      .filter((p) => !reviewed.has(p.id))
      .map((p) => ({
        type: 'person',
        id: p.id,
        label: String(p.name || 'Unnamed').slice(0, 90),
        openedOn: String(p.createdStartOn || p.startDate || p.createdAt || '').slice(0, 10) || null,
      }));
    return { units, demand };
  },

  /** Resolved operational cases — the attribution terminal's unit. */
  'case-resolution': (state) => {
    const units = asArray(state.cases)
      .filter((row) => (row.status === 'resolved' || row.status === 'closed') && row.resolvedOn)
      .map((row) => datedUnit(row.id, String(row.resolvedOn).slice(0, 10)))
      .filter(Boolean);
    const demand = asArray(state.cases)
      .filter((row) => row.status === 'open' || row.status === 'monitoring')
      .map((row) => ({
        type: 'case',
        id: row.id,
        label: String(row.title || 'Case').slice(0, 90),
        openedOn: String(row.openedOn || '').slice(0, 10) || null,
      }));
    return { units, demand };
  },

  /**
   * Graded forecasts across every frozen-commitment ledger. One unit is one
   * forecast that has been graded out of sample — the only kind that teaches
   * the leader anything about their own calibration.
   */
  'forecast-grade': (state) => {
    const ledgers = [
      'confidenceCertificates',
      'credibilityFrames',
      'reliabilityReadings',
      'couplingReviews',
      'deferralFrames',
      'deferralPortfolioReadings',
      'survivalReadings',
    ];
    const units = [];
    for (const key of ledgers) {
      for (const row of asArray(state[key])) {
        const graded = row.graded && typeof row.graded === 'object' ? row.graded : null;
        const at = graded ? (graded.gradedAt || graded.at || '') : '';
        const unit = datedUnit(row.id, String(at).slice(0, 10));
        if (unit) units.push(unit);
      }
    }
    const demand = asArray(state.decisions)
      .filter((row) => (row.outcome || 'pending') === 'pending'
        && (row.forecastProbability === null || row.forecastProbability === undefined || row.forecastProbability === ''))
      .map((row) => ({
        type: 'decision',
        id: row.id,
        label: String(row.title || 'Decision').slice(0, 90),
        openedOn: String(row.date || row.createdAt || '').slice(0, 10) || null,
      }));
    return { units, demand };
  },
};

/**
 * One line's production and demand. `n` counts units inside the declared
 * window; `nAllTime` is kept beside it so a silent window change cannot look
 * like a collapse in production.
 */
export function harvestLine(key, state, today, conventions) {
  const harvester = HARVESTERS[key];
  const meta = supplyLine(key);
  if (!harvester || !meta) return null;
  const { units, demand } = harvester(state);
  const windowStart = addDays(today, -conventions.supplyWindowDays);
  const inWindow = units.filter((u) => u.date && u.date > windowStart && u.date <= today);
  const recentStart = addDays(today, -42);
  const recent = inWindow.filter((u) => u.date > recentStart);
  const windowWeeks = conventions.supplyWindowDays / DAYS_PER_WEEK;
  const demandRows = (demand || []).filter((row) => row.id);
  const oldest = demandRows.reduce((best, row) => {
    if (!row.openedOn) return best;
    const age = daysBetween(row.openedOn, today);
    if (age === null || age < 0) return best;
    return best === null || age > best ? age : best;
  }, null);
  return {
    key,
    meta,
    n: inWindow.length,
    nAllTime: units.length,
    nRecent: recent.length,
    firstAt: units.map((u) => u.date).sort()[0] || null,
    lastAt: units.map((u) => u.date).sort().slice(-1)[0] || null,
    windowWeeks,
    arrivalPerWeek: round(inWindow.length / windowWeeks, 3) || 0,
    recentPerWeek: round(recent.length / 6, 3) || 0,
    demand: demandRows,
    demandCount: demandRows.length,
    oldestDemandDays: oldest,
  };
}

/* ------------------------------------------------------------------ */
/* 3. One line's verdict                                              */
/* ------------------------------------------------------------------ */

function verdictFor({ n, shortfall, pClearPct, demandCount, oldestDemandDays }, conventions) {
  if (shortfall <= 0) return 'met';
  if (n <= 0) return 'unobserved';
  const starved = pClearPct < conventions.supplyStarvePct;
  if (!starved) return 'filling';
  const aged = oldestDemandDays !== null
    && oldestDemandDays >= conventions.supplyAbandonDays
    && demandCount > 0;
  return aged ? 'retire' : 'starved';
}

/** Build the full report for one line. */
export function buildLine(key, state, today, conventions) {
  const harvest = harvestLine(key, state, today, conventions);
  if (!harvest) return null;
  const required = conventions.supplyRequired[key] ?? harvest.meta.defaultRequired;
  const shortfall = Math.max(0, required - harvest.n);
  const k = Math.max(1, shortfall);
  const horizonWeeks = conventions.supplyHorizonDays / DAYS_PER_WEEK;
  const survivalAtHorizon = shortfall > 0
    ? timeToFillSurvival({ n: harvest.n, windowWeeks: harvest.windowWeeks, k, tWeeks: horizonWeeks })
    : 0;
  const pClearPct = shortfall > 0 ? round((1 - survivalAtHorizon) * 100, 1) : 100;
  // A line that has never produced a unit gets no quantile at all. The model
  // can quote one (the Jeffreys prior is proper, so the wait is finite), but a
  // number in the hundreds of weeks would read like a schedule rather than like
  // what it is: there is no arrival process to extrapolate from.
  const canQuote = shortfall > 0 && harvest.n > 0;
  const medianEtaWeeks = canQuote
    ? timeToFillQuantile({ n: harvest.n, windowWeeks: harvest.windowWeeks, k, q: 0.5 })
    : shortfall > 0 ? null : 0;
  const etaLoWeeks = canQuote
    ? timeToFillQuantile({ n: harvest.n, windowWeeks: harvest.windowWeeks, k, q: 0.1 })
    : shortfall > 0 ? null : 0;
  const etaHiWeeks = canQuote
    ? timeToFillQuantile({ n: harvest.n, windowWeeks: harvest.windowWeeks, k, q: 0.9 })
    : shortfall > 0 ? null : 0;
  const expectedWeeks = shortfall > 0
    ? expectedWeeksToFill({ n: harvest.n, windowWeeks: harvest.windowWeeks, k })
    : 0;
  const verdict = verdictFor({
    n: harvest.n,
    shortfall,
    pClearPct,
    demandCount: harvest.demandCount,
    oldestDemandDays: harvest.oldestDemandDays,
  }, conventions);
  const minutesPerUnit = conventions.supplyMinutesPerUnit[key] ?? harvest.meta.defaultMinutes;
  const captureHours = shortfall > 0 ? round((shortfall * minutesPerUnit) / 60, 2) : 0;
  const waitWeeks = medianEtaWeeks === null ? null : medianEtaWeeks;
  // Weeks of waiting saved per hour of deliberate capture. A declared ratio,
  // printed, so the leader can disagree with the exchange rate rather than with
  // a hidden assumption.
  const weeksSavedPerHour = captureHours > 0 && waitWeeks !== null
    ? round(waitWeeks / captureHours, 2)
    : null;
  const captureVerdict = shortfall <= 0 || captureHours === 0
    ? 'either'
    : weeksSavedPerHour === null
      ? 'capture'
      : weeksSavedPerHour >= conventions.supplyCaptureRatio ? 'capture' : 'wait';
  return {
    key,
    label: harvest.meta.label,
    unitLabel: harvest.meta.unitLabel,
    consumerLabel: harvest.meta.consumerLabel,
    consumerRoute: harvest.meta.consumerRoute,
    demandLabel: harvest.meta.demandLabel,
    question: harvest.meta.question,
    n: harvest.n,
    nAllTime: harvest.nAllTime,
    nRecent: harvest.nRecent,
    required,
    shortfall,
    arrivalPerWeek: harvest.arrivalPerWeek,
    recentPerWeek: harvest.recentPerWeek,
    windowWeeks: round(harvest.windowWeeks, 1),
    firstAt: harvest.firstAt,
    lastAt: harvest.lastAt,
    medianEtaWeeks,
    etaLoWeeks,
    etaHiWeeks,
    expectedWeeks,
    pClearBeforeHorizonPct: pClearPct,
    horizonDays: conventions.supplyHorizonDays,
    verdict,
    verdictLabel: SUPPLY_VERDICT_LABELS[verdict],
    verdictText: SUPPLY_VERDICT_TEXT[verdict],
    minutesPerUnit,
    captureHours,
    weeksSavedPerHour,
    captureVerdict,
    captureVerdictLabel: SUPPLY_CAPTURE_LABELS[captureVerdict],
    demandCount: harvest.demandCount,
    oldestDemandDays: harvest.oldestDemandDays,
    demandItems: harvest.demand.slice(0, SUPPLY_LIMITS.maxDemandItems).map((row) => ({
      type: row.type,
      id: row.id,
      label: row.label,
      ageDays: row.openedOn ? daysBetween(row.openedOn, today) : null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 4. The constraint, the queue and the plan preview                  */
/* ------------------------------------------------------------------ */

const STARVED_VERDICTS = new Set(['starved', 'retire', 'unobserved']);

function findBottleneck(lines, conventions) {
  const demanding = lines.filter((line) => line.demandCount > 0);
  const totalDemand = demanding.reduce((sum, line) => sum + line.demandCount, 0);
  if (!totalDemand) return null;
  const scored = demanding
    .map((line) => {
      const starved = STARVED_VERDICTS.has(line.verdict);
      // Pressure = open demand × the probability the line does not fill in the
      // horizon. A met line carries no pressure at all.
      const pressure = line.shortfall > 0
        ? line.demandCount * (1 - line.pClearBeforeHorizonPct / 100)
        : 0;
      return {
        line,
        pressure: round(pressure, 2),
        demandSharePct: round((line.demandCount / totalDemand) * 100, 1),
        starved,
      };
    })
    .sort((a, b) => (b.pressure - a.pressure) || (b.line.demandCount - a.line.demandCount));
  const lead = scored[0];
  const starvedDemand = scored.filter((row) => row.starved).reduce((sum, row) => sum + row.line.demandCount, 0);
  const starvedSharePct = round((starvedDemand / totalDemand) * 100, 1);
  if (!lead || lead.pressure <= 0) return null;
  return {
    key: lead.line.key,
    label: lead.line.label,
    consumerLabel: lead.line.consumerLabel,
    verdict: lead.line.verdict,
    pressure: lead.pressure,
    demandCount: lead.line.demandCount,
    demandSharePct: lead.demandSharePct,
    starvedSharePct,
    isBinding: starvedSharePct >= conventions.supplyBottleneckPct,
    reason: lead.line.verdict === 'met'
      ? 'the largest open queue sits on a line that is already full — the wait is judgement, not evidence'
      : `${lead.line.demandCount} open item(s) wait on a line that clears at ${lead.line.arrivalPerWeek}/week with a ${lead.line.pClearBeforeHorizonPct}% chance of filling inside ${conventions.supplyHorizonDays} days`,
    ranked: scored.map((row) => ({
      key: row.line.key,
      label: row.line.label,
      pressure: row.pressure,
      demandCount: row.line.demandCount,
      demandSharePct: row.demandSharePct,
      starved: row.starved,
    })),
  };
}

/**
 * Greedy schedule under the declared weekly evidence hours, with the fractional
 * (LP-relaxation) value as a printed upper bound. Greedy is not optimal and the
 * gap says so rather than hiding it: this module already refused to dress a
 * prediction as a known quantity, and it will not dress a heuristic as a proof.
 */
export function planPreview(lines, conventions) {
  const budget = conventions.supplyWeeklyHours;
  const candidates = lines
    .filter((line) => line.shortfall > 0 && line.demandCount > 0)
    .map((line) => ({
      key: line.key,
      label: line.label,
      verdict: line.verdict,
      captureHours: line.captureHours,
      demandCount: line.demandCount,
      pressure: round(line.demandCount * (1 - line.pClearBeforeHorizonPct / 100), 2),
      efficiency: line.captureHours > 0
        ? round((line.demandCount * (1 - line.pClearBeforeHorizonPct / 100)) / line.captureHours, 3)
        : 0,
    }))
    .filter((row) => row.captureHours > 0)
    .sort((a, b) => (b.efficiency - a.efficiency) || (b.pressure - a.pressure));
  const chosen = [];
  const leftOut = [];
  let hoursUsed = 0;
  for (const row of candidates) {
    if (hoursUsed + row.captureHours <= budget + 1e-9) {
      chosen.push(row);
      hoursUsed += row.captureHours;
    } else {
      leftOut.push(row);
    }
  }
  // Fractional bound: the same greedy order, but the first item that does not
  // fit may be taken fractionally. This is the LP optimum of a one-constraint
  // knapsack, so it bounds the integer optimum from above.
  let fractional = 0;
  let remaining = budget;
  for (const row of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(1, remaining / row.captureHours);
    fractional += take * row.pressure;
    remaining -= take * row.captureHours;
  }
  const integerValue = chosen.reduce((sum, row) => sum + row.pressure, 0);
  return {
    budgetHours: budget,
    hoursUsed: round(hoursUsed, 2),
    hoursRemaining: round(Math.max(0, budget - hoursUsed), 2),
    chosen,
    leftOut,
    integerPressure: round(integerValue, 2),
    fractionalBound: round(fractional, 2),
    gap: round(Math.max(0, fractional - integerValue), 2),
    exclusions: lines
      .filter((line) => line.shortfall > 0 && line.demandCount === 0)
      .map((line) => ({
        key: line.key,
        reason: 'nothing open needs this line — gathering it now would be evidence nobody is waiting for',
      }))
      .concat(lines
        .filter((line) => line.shortfall <= 0)
        .map((line) => ({ key: line.key, reason: 'already at its floor — read the answer instead of feeding the line' }))),
  };
}

/* ------------------------------------------------------------------ */
/* 5. The report                                                      */
/* ------------------------------------------------------------------ */

export function supplyConventions(settings) {
  return normalizeSupplySettings(settings);
}

export function supplyReport(state, now = new Date(), settings = null) {
  const today = todayOf(now);
  const rawSettings = settings || (state && state.settings) || {};
  const conventions = normalizeSupplySettings(rawSettings);
  const cacheKey = `${SUPPLY_ENGINE_VERSION}|${today}|${JSON.stringify({
    w: conventions.supplyWindowDays,
    h: conventions.supplyHorizonDays,
    s: conventions.supplyStarvePct,
    r: conventions.supplyRequired,
    m: conventions.supplyMinutesPerUnit,
    a: conventions.supplyAbandonDays,
    c: conventions.supplyCaptureRatio,
    b: conventions.supplyBottleneckPct,
    u: conventions.supplyWeeklyHours,
  })}`;
  if (state && typeof state === 'object') {
    const hit = REPORT_CACHE.get(state);
    if (hit && hit.key === cacheKey) return hit.report;
  }
  const lines = SUPPLY_LINES
    .map((meta) => buildLine(meta.key, state || {}, today, conventions))
    .filter(Boolean);
  const bottleneck = findBottleneck(lines, conventions);
  const preview = planPreview(lines, conventions);
  const totalDemand = lines.reduce((sum, line) => sum + line.demandCount, 0);
  const totalArrival = lines.reduce((sum, line) => sum + line.arrivalPerWeek, 0);
  // Little's Law (L = λW) rearranged: at the record's own output rate, how long
  // is the open-questions queue? Assumptions printed with the figure, because a
  // queueing identity is not a forecast.
  const queueWeeks = totalArrival > 0 ? round(totalDemand / totalArrival, 1) : null;
  const counts = {
    lines: lines.length,
    met: lines.filter((l) => l.verdict === 'met').length,
    filling: lines.filter((l) => l.verdict === 'filling').length,
    starved: lines.filter((l) => l.verdict === 'starved').length,
    retire: lines.filter((l) => l.verdict === 'retire').length,
    unobserved: lines.filter((l) => l.verdict === 'unobserved').length,
    openRefusals: lines.filter((l) => l.shortfall > 0).length,
    demand: totalDemand,
    captureHours: round(lines.reduce((sum, l) => sum + (l.captureHours || 0), 0), 2),
  };
  const frozen = Array.isArray(state?.supplyPlans) ? state.supplyPlans : [];
  const plans = frozen.map((plan) => {
    const members = (plan.members || []).map((member) => {
      const live = lines.find((line) => line.key === member.line);
      return {
        ...member,
        nowN: live ? live.n : null,
        reached: live ? live.n >= member.required : null,
      };
    });
    const anyReached = members.some((m) => m.reached === true);
    const due = plan.reviewOn <= today;
    return {
      ...plan,
      members,
      liveAnyReached: anyReached,
      liveClearedLines: members.filter((m) => m.reached).map((m) => m.line),
      due,
      gradeable: due && !plan.graded,
      windowOpen: !due,
    };
  });
  const report = {
    version: SUPPLY_ENGINE_VERSION,
    today,
    conventions,
    lines,
    counts,
    bottleneck,
    preview,
    queueWeeks,
    totalDemand,
    totalArrivalPerWeek: round(totalArrival, 3),
    plans,
    ungradedDue: plans.filter((p) => p.gradeable).length,
    method: {
      windowDays: conventions.supplyWindowDays,
      horizonDays: conventions.supplyHorizonDays,
      starvePct: conventions.supplyStarvePct,
      bottleneckPct: conventions.supplyBottleneckPct,
      weeklyHours: conventions.supplyWeeklyHours,
      abandonDays: conventions.supplyAbandonDays,
      captureRatio: conventions.supplyCaptureRatio,
      daysPerWeek: DAYS_PER_WEEK,
    },
  };
  if (state && typeof state === 'object') REPORT_CACHE.set(state, { key: cacheKey, report });
  return report;
}

/* ------------------------------------------------------------------ */
/* 6. Freeze, grade, brief and signals                                */
/* ------------------------------------------------------------------ */

/**
 * Freeze one plan. Exactly one prospective probability, computed from the
 * members' own per-line fill probabilities, and printed in two forms:
 *
 *   headline  the Fréchet lower bound max(p_i) — TRUE with no independence
 *             assumption whatsoever, so it can never be optimistic
 *   beside it the independence value 1 − Π(1 − p_i), which is what a naive
 *             combination would report and is therefore labelled as an
 *             assumption rather than a finding
 *
 * `reservePct` is the share of the independence value given up to buy the
 * assumption-free property; it is printed so the gap is visible.
 */
export function buildSupplyPlan(report, state, now, planId, options = {}) {
  const reviewDays = Number.isFinite(Number(options.reviewDays))
    ? Math.min(365, Math.max(7, Math.round(Number(options.reviewDays))))
    : report.conventions.supplyReviewHorizonDays;
  const pool = options.lines === 'all'
    ? report.lines.filter((line) => line.shortfall > 0)
    : report.lines.filter((line) => line.shortfall > 0
      && report.preview.chosen.some((row) => row.key === line.key));
  const members = pool.slice(0, SUPPLY_LIMITS.maxMembers);
  if (!members.length) {
    return {
      ok: false,
      reason: 'Nothing to plan: every evidence line is either already at its floor or has no open work waiting on it. A plan with no members would be a quote with no claim.',
    };
  }
  const perMember = members.map((line) => Math.max(0, Math.min(1, line.pClearBeforeHorizonPct / 100)));
  const independence = 1 - perMember.reduce((product, p) => product * (1 - p), 1);
  const frechetLow = Math.max(...perMember);
  const frechetHigh = Math.min(1, perMember.reduce((sum, p) => sum + p, 0));
  const today = todayOf(now);
  const record = {
    id: planId,
    frozenAt: now.toISOString(),
    reviewOn: addDays(today, reviewDays),
    windowDays: report.conventions.supplyWindowDays,
    horizonDays: report.conventions.supplyHorizonDays,
    budgetHours: report.conventions.supplyWeeklyHours,
    hoursCommitted: round(members.reduce((sum, line) => sum + line.captureHours, 0), 2),
    bottleneckLine: report.bottleneck ? report.bottleneck.key : null,
    members: members.map((line) => ({
      line: line.key,
      label: line.label,
      verdict: line.verdict,
      required: line.required,
      observedN: line.n,
      shortfall: line.shortfall,
      captureHours: line.captureHours,
      medianEtaWeeks: line.medianEtaWeeks,
      pClearBeforeHorizonPct: line.pClearBeforeHorizonPct,
      demandCount: line.demandCount,
      // The open records this line's output is for, so RULE-SUP-01 can write a
      // real `unblocks-judgement` edge instead of asserting one from a count.
      demandIds: (line.demandItems || []).slice(0, 3).map((item) => ({ type: item.type, id: item.id })),
    })),
    predictedAnyClearPct: round(frechetLow * 100, 1),
    predictedAnyClearIndependencePct: round(independence * 100, 1),
    reservePct: round((independence - frechetLow) * 100, 1),
    bounds: {
      lowPct: round(frechetLow * 100, 1),
      highPct: round(frechetHigh * 100, 1),
    },
    graded: null,
    challengeNotes: [],
  };
  return { ok: true, record };
}

/**
 * Grade a frozen plan once, from strictly later evidence. A line "cleared" when
 * its live count reached the required count recorded at freeze time. A plan
 * whose window has not closed cannot be graded; a window that closes with no
 * lines clearing grades Brier but is not credited as a success.
 */
export function gradeSupplyPlan(plan, state, now = new Date()) {
  if (!plan) return { ok: false, reason: 'That plan no longer exists.' };
  if (plan.graded) return { ok: false, reason: 'This plan has already been graded once. A forecast is graded once.' };
  const today = todayOf(now);
  if (!plan.reviewOn || plan.reviewOn > today) {
    return { ok: false, reason: `The review date (${plan.reviewOn}) has not arrived. Grading early would score a claim before its evidence window closed.` };
  }
  const conventions = normalizeSupplySettings(state?.settings || {});
  const cleared = [];
  for (const member of plan.members || []) {
    const live = harvestLine(member.line, state || {}, today, conventions);
    if (!live) continue;
    if (live.n >= member.required) cleared.push(member.line);
  }
  const anyClear = cleared.length > 0;
  const p = Math.max(0, Math.min(1, plan.predictedAnyClearPct / 100));
  const brier = round((p - (anyClear ? 1 : 0)) ** 2, 4);
  return {
    ok: true,
    grade: {
      gradedAt: now.toISOString(),
      anyClear,
      clearedLines: cleared,
      brier,
    },
    result: { anyClear, cleared, brier },
  };
}

export function supplyBrief(report, now = new Date()) {
  const lines = [];
  lines.push(`## Evidence supply chain — ${report.today}`);
  lines.push('');
  lines.push(`${report.counts.openRefusals} of ${report.counts.lines} evidence line(s) are below the count the workspace needs to judge: `
    + `${report.counts.starved} starved, ${report.counts.retire} that should be retired, ${report.counts.unobserved} never observed, ${report.counts.filling} filling on their own.`);
  if (report.bottleneck) {
    lines.push('');
    lines.push(`**Constraint:** ${report.bottleneck.label} — ${report.bottleneck.reason}. `
      + `It carries ${report.bottleneck.demandSharePct}% of open demand; ${report.bottleneck.starvedSharePct}% of all demand sits on starved lines (bar: ${report.conventions.supplyBottleneckPct}%).`);
  }
  if (report.queueWeeks !== null) {
    lines.push(`**Queue:** ${report.totalDemand} open item(s) against ${report.totalArrivalPerWeek} unit(s)/week of measured output implies roughly ${report.queueWeeks} week(s) to clear at the current rate (Little's Law, holding demand constant).`);
  }
  lines.push('');
  for (const line of report.lines) {
    lines.push(`- ${line.label}: ${line.n}/${line.required} · ${line.verdictLabel}`
      + `${line.shortfall > 0 ? ` · ${line.pClearBeforeHorizonPct}% inside ${line.horizonDays}d` : ''}`
      + `${line.captureHours ? ` · ${line.captureHours}h to manufacture` : ''}.`);
  }
  if (report.plans.length) {
    const last = report.plans[report.plans.length - 1];
    lines.push('');
    lines.push(`**Frozen plan ${last.reviewOn}:** ${last.predictedAnyClearPct}% chance at least one planned line clears (assumption-free bound; `
      + `${last.predictedAnyClearIndependencePct}% under independence), ${last.hoursCommitted}h committed.`);
  }
  lines.push('');
  lines.push('Counts only: no person is named, rated or ranked, and no refused judgement is invented to make a line look full.');
  return lines.join('\n');
}

export function supplySignals(state, now = new Date(), settings = null) {
  const report = supplyReport(state, now, settings);
  const signals = [];
  const add = (signal) => signals.push(signal);
  const b = report.bottleneck;
  if (b && b.isBinding && b.verdict !== 'met') {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.BOTTLENECK,
      domain: 'Evidence supply',
      severity: 3,
      confidence: 'high',
      title: `The constraint is ${b.label.toLowerCase()}`,
      detail: `${b.demandCount} open item(s) wait on a line that ${b.verdict === 'unobserved' ? 'has never produced a unit' : `clears at only ${report.lines.find((l) => l.key === b.key)?.arrivalPerWeek ?? 0}/week`}. ${b.starvedSharePct}% of all open demand sits on starved lines, against your ${report.conventions.supplyBottleneckPct}% bar. Improving any other line is motion, not throughput.`,
      action: { label: 'Open the supply chain', route: `#/supply?panel=constraint&line=${encodeURIComponent(b.key)}` },
      evidence: [`pressure ${b.pressure}`, `${b.demandSharePct}% of demand`, `bar ${report.conventions.supplyBottleneckPct}%`],
    });
  }
  for (const line of report.lines.filter((l) => l.verdict === 'retire')) {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.RETIRE,
      domain: 'Evidence supply',
      severity: 3,
      confidence: 'high',
      title: `${line.label} cannot pay for the wait`,
      detail: `${line.n} of ${line.required} units after ${line.nAllTime} lifetime unit(s); the open work this line feeds is already ${line.oldestDemandDays} day(s) old against your ${report.conventions.supplyAbandonDays}-day retirement bar, and the median fill sits at ${line.medianEtaWeeks === null ? 'no finite wait' : `${line.medianEtaWeeks} weeks`}. Keeping the question open is the sunk-cost mistake: the time already spent is unrecoverable.`,
      action: { label: 'Open the supply chain', route: `#/supply?panel=lines&line=${encodeURIComponent(line.key)}` },
      evidence: [`${line.n}/${line.required}`, `oldest demand ${line.oldestDemandDays}d`],
    });
  }
  for (const line of report.lines.filter((l) => l.verdict === 'met' && l.demandCount > 0)) {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.UNLOCKED,
      domain: 'Evidence supply',
      severity: 2,
      confidence: 'medium',
      title: `${line.consumerLabel} can be read now`,
      detail: `The ${line.label.toLowerCase()} line reached its floor (${line.n} of ${line.required}) while ${line.demandCount} open item(s) still wait on it. Nothing further needs gathering — open ${line.consumerLabel} and read the answer.`,
      action: { label: 'Open the supply chain', route: line.consumerRoute },
      evidence: [`${line.n}/${line.required}`, `${line.demandCount} open item(s)`],
    });
  }
  if (report.ungradedDue > 0) {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.UNGRADED,
      domain: 'Evidence supply',
      severity: 2,
      confidence: 'high',
      title: `${report.ungradedDue} frozen supply plan(s) are due for grading`,
      detail: 'A frozen plan that is never graded teaches nothing. Grading is a single click and one Brier score.',
      action: { label: 'Open the supply chain', route: '#/supply?panel=plans' },
      evidence: [`${report.ungradedDue} due`],
    });
  }
  for (const line of report.lines.filter((l) => l.captureVerdict === 'capture' && l.shortfall > 0 && l.demandCount > 0)) {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.CAPTURE,
      domain: 'Evidence supply',
      severity: 2,
      confidence: 'medium',
      title: `Capturing ${line.label.toLowerCase()} beats waiting`,
      detail: `${line.captureHours}h of your time manufactures the ${line.shortfall} missing unit(s); the record's own rate would take ${line.medianEtaWeeks === null ? 'longer than the model will quote' : `${line.medianEtaWeeks} weeks`} to 50% confidence. That is ${line.weeksSavedPerHour === null ? 'unbounded' : `${line.weeksSavedPerHour} week(s) saved per hour`} against your ${report.conventions.supplyCaptureRatio} bar.`,
      action: { label: 'Open the supply chain', route: `#/supply?panel=capture` },
      evidence: [`${line.captureHours}h`, `${line.shortfall} unit(s)`],
    });
  }
  // A workspace with nothing open has no evidence debt — every line is simply
  // unobserved, and calling that a problem would be the setup nudge's job, not
  // this one's.
  if (report.counts.demand > 0
    && report.counts.starved + report.counts.retire + report.counts.unobserved === report.counts.lines) {
    add({
      ruleId: SUPPLY_SIGNAL_IDS.NO_LINE,
      domain: 'Evidence supply',
      severity: 3,
      confidence: 'high',
      title: 'No evidence line is producing',
      detail: 'Every line in the chain is starved or unobserved. Nothing in this workspace can be learned from at the current rate — the next action is not another screen, it is to manufacture one unit on one line deliberately.',
      action: { label: 'Open the supply chain', route: '#/supply?panel=plan' },
      evidence: [`${report.counts.lines} line(s)`],
    });
  }
  return signals;
}

export function supplyAttentionCount(state, now = new Date(), settings = null) {
  return supplySignals(state, now, settings)
    .filter((signal) => signal.severity >= 3)
    .length;
}
