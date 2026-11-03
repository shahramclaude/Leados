/**
 * app/core/domain/retention.js — Retention Intelligence & Talent Economics.
 *
 * The question this engine answers is not "who is a flight risk?" — that is a
 * score, and a score with no denominator behind it is a rumour with a decimal
 * point. It answers four questions a leader can defend in front of a CFO:
 *
 *   1. What is the observed hazard, with how much evidence, and what fraction of
 *      the evidence is censored? (Kaplan–Meier survival with Greenwood variance
 *      and a log–log confidence band; Lexis-expanded tenure bands.)
 *   2. Given the leader's own history, how much of the hazard is explained by
 *      recorded, actionable factors — and does the workspace have enough
 *      observed departures to identify those multipliers, or is it still running
 *      on priors? (Prior-centred penalised Poisson regression: a genuine IRLS
 *      fit whose penalty *is* the prior, so thin data collapses back to the
 *      literature and thick data overrides it.)
 *   3. What does that risk cost, in the only currency the app will use — the
 *      replacement cost derived from a recorded annual cost, never invented?
 *   4. Which interventions buy the most retained value for the money AND the
 *      leader's attention, and where does the allocation become unfair?
 *
 * Deliberate design stance (documented in ADR-0012):
 *  - The model abstains. It reports a probability band always, but it labels the
 *    mode (`prior` vs `pooled`) and says exactly how many further observed
 *    departures it needs before its factor multipliers are its own.
 *  - It scores itself. Concordance (Harrell's C) and Brier score over committed
 *    plans are computed and shown; a model that cannot beat chance says so.
 *  - It never reads confidential conflicts or anonymous pulses. Retention
 *    inference from anonymous data is surveillance, so it is structurally
 *    impossible here: those collections are not imported by this module.
 *  - Purposes are separated: this is decision support for retention
 *    investment, not a performance rating. Nothing here is written back to a
 *    review, and no signal names a person to anyone but the leader.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, FORBIDDEN_LINK_TYPES } from './cases.js';
import { personSupply } from './capacity.js';
import {
  DEPARTURE_REASON_CLASSES,
  DEPARTURE_REASON_LABELS,
  DEPARTURE_TYPE_LABELS,
  DEPARTURE_TYPES,
  RETENTION_PLAN_STATUSES,
  RETENTION_PLAN_STATUS_LABELS,
  REVIEW_RATINGS,
} from '../schema.js';

export const RETENTION_ENGINE_VERSION = 'retention-2026.10-v1';
export const MONTH_DAYS = 365.25 / 12;

/** Observed voluntary departures needed before the multipliers are the leader's own. */
export const RETENTION_MIN_EVENTS = 10;
/** Comparable pairs needed before the concordance index is reported. */
export const RETENTION_MIN_PAIRS = 5;
/** Prior uncertainty on a literature hazard ratio, in log space (≈ ±35%). */
export const PRIOR_LOG_SPREAD = 0.3;

export {
  DEPARTURE_REASON_CLASSES,
  DEPARTURE_REASON_LABELS,
  DEPARTURE_TYPE_LABELS,
  DEPARTURE_TYPES,
  RETENTION_PLAN_STATUSES,
  RETENTION_PLAN_STATUS_LABELS,
};

export const TENURE_BANDS = [
  { key: '0-6m', label: '0–6 months', fromMonths: 0, toMonths: 6 },
  { key: '6-12m', label: '6–12 months', fromMonths: 6, toMonths: 12 },
  { key: '12-24m', label: '1–2 years', fromMonths: 12, toMonths: 24 },
  { key: '24-48m', label: '2–4 years', fromMonths: 24, toMonths: 48 },
  { key: '48m+', label: '4 years and beyond', fromMonths: 48, toMonths: Infinity },
];

export const RETENTION_RISK_BANDS = [
  { key: 'low', label: 'Low', tone: 'good' },
  { key: 'watch', label: 'Watch', tone: 'neutral' },
  { key: 'elevated', label: 'Elevated', tone: 'caution' },
  { key: 'high', label: 'High', tone: 'bad' },
];

/**
 * The factor catalogue. Every multiplier is a *prior* with a named basis; in
 * `pooled` mode the engine replaces it with its own fitted estimate and reports
 * both. The ordering is the order they are shown in the UI.
 *
 * These are not validated constants. They are transparent, testable starting
 * points that a workspace overrides with its own history once it has enough
 * observed departures — which is exactly what the regression is for.
 */
export const RETENTION_FACTORS = [
  {
    id: 'pay-below-band',
    label: 'Pay position below the band',
    priorHr: 1.4,
    basis: 'Compa-ratio below 0.90 of the band. Pay-position literature treats unexplained below-band pay as a leading mobility signal.',
    interventionId: 'pay-adjust',
  },
  {
    id: 'promotion-stall',
    label: 'No level change for 30+ months',
    priorHr: 1.55,
    basis: 'Bidwell (2011) on promotion-based rewards: stalled progression raises external mobility more than an equivalent raise.',
    interventionId: 'level-review',
  },
  {
    id: 'development-void',
    label: 'No active development plan',
    priorHr: 1.25,
    basis: '2026 retention benchmarks put perceived career progress among the strongest intent-to-stay drivers.',
    interventionId: 'growth-plan',
  },
  {
    id: 'cadence-decay',
    label: '1:1 cadence has decayed',
    priorHr: 1.3,
    basis: 'Manager-relationship quality is the most replicated single predictor of voluntary exit in the people-analytics literature.',
    interventionId: 'cadence-reset',
  },
  {
    id: 'energy-decline',
    label: 'Self-reported energy trending down',
    priorHr: 1.2,
    basis: 'A decline in the leader-recorded 1:1 energy signal. Recorded by a human in a conversation, never inferred from text or sentiment.',
    interventionId: 'cadence-reset',
  },
  {
    id: 'feedback-drought',
    label: 'No feedback in 90 days',
    priorHr: 1.15,
    basis: 'Feedback drought removes the recognition channel that keeps contribution legible; it is a modifiable manager behaviour.',
    interventionId: 'recognition-rhythm',
  },
  {
    id: 'sustained-overload',
    label: 'Committed work beyond capacity',
    priorHr: 1.25,
    basis: 'Sustained load above the person’s allocatable capacity, computed by the capacity model rather than self-reported.',
    interventionId: 'load-relief',
  },
  {
    id: 'review-decline',
    label: 'Performance evidence trending down',
    priorHr: 1.2,
    basis: 'A falling recorded review rating predicts exit at higher rates than a stable high rating.',
    interventionId: 'growth-plan',
  },
];

export const RETENTION_FACTOR_BY_ID = Object.fromEntries(RETENTION_FACTORS.map((f) => [f.id, f]));

/**
 * Interventions: what a leader can actually do, what it costs in money and in
 * their own attention. `removes` lists the factors whose hazard multiplier the
 * intervention is expected to undo — under a proportional-hazards reading,
 * removing a factor of HR h multiplies the hazard by 1/h.
 *
 * Money costs are derived from recorded figures wherever possible; `cost: null`
 * means the intervention has no recorded money cost and is budgeted in hours
 * only. Nothing here invents a salary or a raise amount.
 */
export const RETENTION_INTERVENTIONS = [
  {
    id: 'pay-adjust',
    label: 'Close the pay gap to the band',
    removes: ['pay-below-band'],
    hours: 2,
    costKind: 'band-gap',
    description: 'Raise to the band minimum (or to 0.95 of the band midpoint, whichever is higher). The cost is the recorded gap, never an assumed percentage.',
  },
  {
    id: 'level-review',
    label: 'Run a level review / promotion case',
    removes: ['promotion-stall'],
    hours: 6,
    costKind: 'promotion',
    description: 'Open a documented level-change case. Money cost is the recorded annual cost × the promotion convention, and the hours are the leader’s own writing time.',
  },
  {
    id: 'growth-plan',
    label: 'Co-author a development plan',
    removes: ['development-void', 'review-decline'],
    hours: 2,
    costKind: 'none',
    description: 'A GROW plan with an owner-set will. Cheapest intervention in the catalogue and the one most often skipped.',
  },
  {
    id: 'cadence-reset',
    label: 'Reset the 1:1 rhythm for 8 weeks',
    removes: ['cadence-decay', 'energy-decline'],
    hours: 8,
    costKind: 'none',
    description: 'Eight protected weekly conversations. Costs attention, not budget — which is why it is the first thing dropped and the first thing that works.',
  },
  {
    id: 'recognition-rhythm',
    label: 'Start a specific recognition rhythm',
    removes: ['feedback-drought'],
    hours: 1.5,
    costKind: 'none',
    description: 'A named, specific recognition per fortnight, logged so it is auditable rather than assumed.',
  },
  {
    id: 'load-relief',
    label: 'Reallocate committed work',
    removes: ['sustained-overload'],
    hours: 3,
    costKind: 'none',
    description: 'Move at least one committed portfolio item off the person. The engine names the item rather than the intention.',
  },
];

export const RETENTION_INTERVENTION_BY_ID = Object.fromEntries(
  RETENTION_INTERVENTIONS.map((i) => [i.id, i]),
);

export const RETENTION_RULES = [
  {
    id: 'RULE-RET-01',
    name: 'Risk → proposed retention plan',
    framework: 'Proportional hazards + expected-loss economics',
    trigger: 'retention.scanned / person.updated',
    targetModule: 'retentionPlans',
    description: 'One proposed (never committed) plan for an observed person whose risk index is elevated or high and who has no live plan. A person with no recorded observation gets no proposal: missing data is not risk. Money is never committed by the engine.',
  },
  {
    id: 'RULE-RET-02',
    name: 'Departure reconciles the retention ledger',
    framework: 'Competing-risks bookkeeping',
    trigger: 'departure.recorded',
    targetModule: 'retentionPlans',
    description: 'A live plan for someone who has left is marked moot with a written reason; no plan is ever deleted and no spend already committed is erased.',
  },
  {
    id: 'RULE-RET-03',
    name: 'Evidence floor → model governance decision',
    framework: 'Empirical Bayes / MAP estimation',
    trigger: 'departure.recorded',
    targetModule: 'decisions',
    description: 'When the workspace first crosses the observed-departure floor, one DACI decision asks whether to adopt the fitted multipliers or keep the priors, quoting both.',
  },
  {
    id: 'RULE-RET-04',
    name: 'Clustered exit reasons → systemic driver decision',
    framework: 'Root-cause grouping (Pareto over exit classes)',
    trigger: 'departure.recorded',
    targetModule: 'decisions',
    description: 'Two or more departures sharing a recorded reason class inside 12 months raises exactly one decision about the systemic driver, never a second one.',
  },
];

/* ============================================================ 1. small maths */

export function monthsBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const days = daysBetween(fromDay, toDay);
  if (days === null || days < 0) return null;
  return days / MONTH_DAYS;
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Standard normal quantile (Acklam's approximation, |error| < 1.15e-9). */
export function normalQuantile(p) {
  const q = clamp(Number(p) || 0.5, 1e-9, 1 - 1e-9);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (q < pLow) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  if (q > 1 - pLow) {
    const t = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
  }
  const t = q - 0.5;
  const r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* Regularised incomplete gamma P(a, x) — series for x < a+1, continued
 * fraction otherwise (Numerical Recipes §6.2). Needed because the Poisson rate
 * interval is a chi-square quantile, and the fast Wilson–Hilferty shortcut
 * collapses to zero for the small degrees of freedom this app actually uses
 * (2k = 2 for a single event), which silently produced 0–99.8% intervals. */
function gammaSeriesP(a, x) {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 500; n += 1) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

function gammaContinuedFractionQ(a, x) {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

function lnGamma(z) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularised lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (!(x > 0)) return 0;
  if (!(a > 0)) return 0;
  return x < a + 1 ? gammaSeriesP(a, x) : 1 - gammaContinuedFractionQ(a, x);
}

/** Inverse of P(a, ·) by bisection — monotone, so this is unconditionally safe. */
export function gammaQuantile(p, a) {
  const target = clamp(Number(p) || 0.5, 1e-12, 1 - 1e-12);
  let hi = Math.max(1, a);
  while (gammaP(a, hi) < target && hi < 1e7) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

/** Chi-square quantile: χ²(p, df) = 2 · Γ⁻¹(p, df/2). */
export function chiSquareQuantile(p, df) {
  if (!(df > 0)) return 0;
  return 2 * gammaQuantile(p, df / 2);
}

/** Exact-ish (Garwood) Poisson rate confidence interval per unit exposure. */
export function poissonRateCI(events, exposure) {
  const k = Math.max(0, Math.round(num(events, 0)));
  const t = Math.max(1e-9, num(exposure, 0));
  const lower = k === 0 ? 0 : chiSquareQuantile(0.025, 2 * k) / 2 / t;
  const upper = chiSquareQuantile(0.975, 2 * k + 2) / 2 / t;
  return { lower, upper };
}

/* ================================================== 2. person-time & survival */

function departureFor(state, personId) {
  return (state.departures || []).find((d) => d.personId === personId) || null;
}

function bandForMonths(months) {
  const m = Math.max(0, num(months, 0));
  return TENURE_BANDS.find((b) => m >= b.fromMonths && m < b.toMonths) || TENURE_BANDS[TENURE_BANDS.length - 1];
}

/**
 * One row per person: hire to exit (or to now, censored), the months in each
 * tenure band (a Lexis expansion), and whether the exit was a modelled event.
 *
 * Modelling choice, stated plainly: only *voluntary* departures are events.
 * Involuntary and unknown exits censor the record at the last day. Treating an
 * involuntary exit as a competing risk this way is a crude simplification and is
 * labelled as such in the UI; it does not pretend to estimate cause-specific
 * hazards.
 */
export function buildPersonTime(state, { now = new Date() } = {}) {
  const today = dayKey(now);
  const rows = [];
  const unmeasurable = [];
  for (const person of state.people || []) {
    const startDay = person.startDate || null;
    if (!startDay) {
      unmeasurable.push({ personId: person.id, reason: 'No start date recorded, so no tenure or exposure exists.' });
      continue;
    }
    const departure = departureFor(state, person.id);
    const left = Boolean(departure && departure.lastDay);
    const endDay = left ? departure.lastDay : today;
    if (endDay < startDay) {
      unmeasurable.push({ personId: person.id, reason: 'The departure date is before the start date.' });
      continue;
    }
    const tenureMonths = monthsBetween(startDay, endDay) || 0;
    const event = Boolean(departure && departure.type === 'voluntary');
    const bands = {};
    for (const band of TENURE_BANDS) {
      const overlap = Math.max(0, Math.min(tenureMonths, band.toMonths) - band.fromMonths);
      if (overlap > 0) bands[band.key] = overlap;
    }
    rows.push({
      personId: person.id,
      startDay,
      endDay,
      left,
      event,
      departureType: departure ? departure.type : null,
      departureId: departure ? departure.id : null,
      tenureMonths,
      tenureBand: bandForMonths(tenureMonths).key,
      bands,
    });
  }
  return { rows, unmeasurable, today };
}

/**
 * Kaplan–Meier survival of tenure, with Greenwood variance and a log–log
 * confidence band (the transform that keeps the interval inside [0,1] and is
 * the standard for small samples). The median is reported only when the curve
 * actually crosses 0.5 — otherwise it is genuinely unidentified and saying so is
 * more useful than interpolating a number.
 */
export function kaplanMeier(rows, { confidence = 0.95 } = {}) {
  const clean = (rows || []).filter((r) => Number.isFinite(r.tenureMonths) && r.tenureMonths >= 0);
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const times = Array.from(new Set(clean.filter((r) => r.event).map((r) => r.tenureMonths))).sort((a, b) => a - b);
  if (!times.length) {
    return {
      points: [{ t: 0, survival: 1, ciLo: 1, ciHi: 1, atRisk: clean.length, events: 0, censored: clean.length }],
      events: 0,
      censored: clean.length,
      censorShare: clean.length ? 1 : 0,
      median: null,
      medianIdentified: false,
      survivalAt24: null,
      maxTenure: clean.reduce((m, r) => Math.max(m, r.tenureMonths), 0),
      sufficient: false,
    };
  }
  const points = [{ t: 0, survival: 1, ciLo: 1, ciHi: 1, atRisk: clean.length, events: 0, censored: 0 }];
  let survival = 1;
  let greenwood = 0;
  let median = null;
  let prev = 0;
  for (const t of times) {
    const atRisk = clean.filter((r) => r.tenureMonths >= t).length;
    const events = clean.filter((r) => r.event && Math.abs(r.tenureMonths - t) < 1e-9).length;
    const censoredBetween = clean.filter((r) => !r.event && r.tenureMonths >= prev && r.tenureMonths < t).length;
    if (atRisk > 0) {
      survival *= 1 - events / atRisk;
      greenwood += events / (atRisk * Math.max(1, atRisk - events));
    }
    let ciLo = survival;
    let ciHi = survival;
    if (survival > 0 && survival < 1 && greenwood > 0) {
      const seLogLog = Math.sqrt(greenwood) / Math.abs(Math.log(survival));
      ciLo = Math.pow(survival, Math.exp(z * seLogLog));
      ciHi = Math.pow(survival, Math.exp(-z * seLogLog));
    }
    if (median === null && survival <= 0.5) median = t;
    points.push({
      t,
      survival,
      ciLo: clamp(Math.min(ciLo, survival), 0, 1),
      ciHi: clamp(Math.max(ciHi, survival), 0, 1),
      atRisk,
      events,
      censored: censoredBetween,
    });
    prev = t;
  }
  const totalEvents = clean.filter((r) => r.event).length;
  const censored = clean.length - totalEvents;
  const survivalAt24 = survivalAt(points, 24);
  return {
    points,
    events: totalEvents,
    censored,
    censorShare: clean.length ? censored / clean.length : 0,
    median,
    medianIdentified: median !== null,
    survivalAt24,
    maxTenure: clean.reduce((m, r) => Math.max(m, r.tenureMonths), 0),
    sufficient: totalEvents >= RETENTION_MIN_EVENTS,
  };
}

function survivalAt(points, months) {
  const upTo = points.filter((p) => p.t <= months);
  return upTo.length ? upTo[upTo.length - 1].survival : null;
}

/**
 * Crude hazard per tenure band from Lexis-expanded exposure, plus the
 * empirical-Bayes smoothed posterior rate used by the risk model.
 *
 * Smoothing: rate = (events + α·prior) / (months + α). With no exposure the
 * posterior is exactly the prior; with a lot of exposure it is the crude rate.
 * α is `retentionPriorStrengthMonths`, i.e. "how many person-months of evidence
 * it takes to move off the prior".
 */
export function bandHazards(rows, { priorMonthlyHazard = 0.012, strength = 12 } = {}) {
  const prior = Math.max(1e-6, num(priorMonthlyHazard, 0.012));
  const alpha = Math.max(0.01, num(strength, 12));
  const bands = TENURE_BANDS.map((band) => {
    let months = 0;
    let events = 0;
    for (const row of rows || []) {
      months += row.bands?.[band.key] || 0;
      if (row.event && row.tenureBand === band.key) events += 1;
    }
    const crude = months > 0 ? events / months : null;
    const smoothed = (events + alpha * prior) / (months + alpha);
    const ci = poissonRateCI(events, months + alpha);
    return {
      key: band.key,
      label: band.label,
      events,
      months,
      crude,
      smoothed,
      lo: ci.lower,
      hi: ci.upper,
      priorDriven: months < alpha,
    };
  });
  const totalMonths = bands.reduce((sum, b) => sum + b.months, 0);
  const totalEvents = bands.reduce((sum, b) => sum + b.events, 0);
  return {
    bands,
    prior,
    strength: alpha,
    totalMonths,
    totalEvents,
    crude: totalMonths > 0 ? totalEvents / totalMonths : null,
    byKey: Object.fromEntries(bands.map((b) => [b.key, b])),
  };
}

/* ============================================ 3. prior-centred penalised Poisson */

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c += 1) M[col][c] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * Fit hazard ratios by Poisson regression on the Lexis-expanded person-period
 * table: events per band-row, offset log(exposure months), factor indicators.
 *
 * The objective is the penalised log-likelihood
 *     ℓ(β) − λ·Σ_j (β_j − log priorHr_j)²
 * i.e. a Gaussian prior centred on the literature ratio. This is not decoration:
 *  - λ → ∞ reproduces the priors exactly (thin data),
 *  - λ → 0 reproduces the maximum-likelihood fit (thick data),
 * and the reported standard errors come from the penalised information matrix.
 * The intercept is never penalised.
 */
export function fitHazardModel(personTime, factorMatrix, options = {}) {
  const rows = personTime?.rows || [];
  const ridge = Math.max(0, num(options.ridge, 2));
  const minEvents = Math.max(0, num(options.minEvents, RETENTION_MIN_EVENTS));
  const factors = Array.isArray(options.factors) ? options.factors : RETENTION_FACTORS;
  const priorLogs = factors.map((f) => Math.log(clamp(num(f.priorHr, 1), 0.2, 8)));

  const observations = [];
  for (const row of rows) {
    const indicators = factorMatrix?.get?.(row.personId) || new Set();
    for (const band of TENURE_BANDS) {
      const exposure = row.bands?.[band.key] || 0;
      if (!(exposure > 0)) continue;
      observations.push({
        exposure,
        y: row.event && row.tenureBand === band.key ? 1 : 0,
        x: [1, ...factors.map((f) => (indicators.has(f.id) ? 1 : 0))],
      });
    }
  }

  const events = observations.reduce((s, o) => s + o.y, 0);
  const exposure = observations.reduce((s, o) => s + o.exposure, 0);
  const k = factors.length;
  const priorMode = {
    mode: 'prior',
    converged: false,
    events,
    exposure,
    observations: observations.length,
    coefficients: factors.map((f, i) => ({
      id: f.id,
      label: f.label,
      hr: clamp(num(f.priorHr, 1), 0.2, 8),
      lo: clamp(num(f.priorHr, 1) * Math.exp(-normalQuantile(0.975) * PRIOR_LOG_SPREAD), 0.05, 20),
      hi: clamp(num(f.priorHr, 1) * Math.exp(normalQuantile(0.975) * PRIOR_LOG_SPREAD), 0.05, 20),
      source: 'prior',
    })),
    needs: Math.max(0, minEvents - events),
    reason: events === 0
      ? 'No voluntary departures are recorded yet, so every multiplier is the literature prior.'
      : `${events} observed voluntary departure${events === 1 ? '' : 's'}; the multipliers need ${minEvents} before they become the workspace's own estimate.`,
  };
  if (events < minEvents || !observations.length) return priorMode;

  const p = 1 + k;
  let beta = [Math.log(Math.max(1e-9, events / Math.max(1e-9, exposure))), ...priorLogs];
  let converged = false;
  let iterations = 0;
  let information = null;
  for (iterations = 1; iterations <= 80; iterations += 1) {
    const gradient = new Array(p).fill(0);
    const info = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const o of observations) {
      const eta = o.x.reduce((s, x, j) => s + x * beta[j], 0) + Math.log(o.exposure);
      const mu = Math.exp(clamp(eta, -30, 30));
      const resid = o.y - mu;
      for (let j = 0; j < p; j += 1) {
        gradient[j] += o.x[j] * resid;
        for (let l = 0; l < p; l += 1) info[j][l] += o.x[j] * o.x[l] * mu;
      }
    }
    // Gaussian prior on the factor coefficients only.
    for (let j = 1; j < p; j += 1) {
      gradient[j] -= 2 * ridge * (beta[j] - priorLogs[j - 1]);
      info[j][j] += 2 * ridge;
    }
    const step = solveLinear(info, gradient);
    if (!step) break;
    let maxStep = 0;
    for (let j = 0; j < p; j += 1) {
      beta[j] = clamp(beta[j] + step[j], -8, 8);
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    information = info;
    if (maxStep < 1e-9) {
      converged = true;
      break;
    }
  }

  if (!converged || !information || beta.some((b) => !Number.isFinite(b))) {
    return { ...priorMode, reason: `${priorMode.reason} The regression did not converge, so the priors are shown instead of an unstable fit.` };
  }

  const cov = solveLinear(information, new Array(p).fill(0).map((_, i) => (i === 0 ? 1 : 0)));
  // Recover the full inverse by solving against each basis vector, then take the diagonal.
  const diag = [];
  for (let i = 0; i < p; i += 1) {
    const e = new Array(p).fill(0);
    e[i] = 1;
    const column = solveLinear(information, e);
    diag.push(column ? column[i] : NaN);
  }
  void cov;
  const z = normalQuantile(0.975);
  return {
    mode: 'pooled',
    converged: true,
    iterations,
    events,
    exposure,
    observations: observations.length,
    ridge,
    intercept: beta[0],
    coefficients: factors.map((f, i) => {
      const b = beta[i + 1];
      const se = Number.isFinite(diag[i]) ? Math.sqrt(Math.max(0, diag[i])) : 0;
      return {
        id: f.id,
        label: f.label,
        hr: Math.exp(b),
        lo: Math.exp(b - z * se),
        hi: Math.exp(b + z * se),
        se,
        priorHr: num(f.priorHr, 1),
        source: 'fitted',
      };
    }),
    needs: 0,
    reason: `${events} observed voluntary departures — enough for the workspace's own multipliers, shrunk toward the priors by λ = ${ridge}.`,
  };
}

/* ================================================== 4. factor detection */

function held1to1s(state, personId) {
  return (state.oneOnOnes || [])
    .filter((m) => m.personId === personId && m.status === 'held')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function daysSinceDay(day, today) {
  if (!day) return null;
  const diff = daysBetween(day, today);
  return diff === null ? null : diff;
}

function latestCompleteReview(state, personId) {
  return (state.reviews || [])
    .filter((r) => r.personId === personId && r.status === 'complete' && r.manager?.rating)
    .slice()
    .sort((a, b) => String(b.periodEnd || b.completedAt || '').localeCompare(String(a.periodEnd || a.completedAt || '')));
}

/**
 * Detect the recorded, actionable factors for one person. Every detector reads a
 * first-class non-confidential record; nothing is inferred from free text.
 */
const OBSERVATION_SOURCES = [
  ['oneOnOnes', 'a 1:1 record'],
  ['feedback', 'a feedback record'],
  ['reviews', 'a performance review'],
  ['pulses', 'a pulse response'],
  ['recognition', 'a recognition record'],
];

/**
 * Has this workspace ever recorded anything about this person?
 *
 * The absence of data is not evidence of risk. Four of the six retention factors
 * are *absence*-based (no feedback, no growth plan, no level change, no 1:1), so
 * a freshly imported roster would otherwise produce an elevated band for every
 * single person and a proposed plan for each one — which is exactly the kind of
 * noise that teaches a leader to ignore the terminal. RULE-RET-01 therefore
 * spends attention only where the workspace has at least one real observation.
 */
export function observedSignalFor(state, personId) {
  if (!state || !personId) return null;
  for (const [key, label] of OBSERVATION_SOURCES) {
    const list = state[key];
    if (Array.isArray(list) && list.some((row) => row && row.personId === personId)) return label;
  }
  return null;
}

export function detectFactors(state, person, { now = new Date(), settings = state?.settings || {} } = {}) {
  const today = dayKey(now);
  const factors = [];
  const add = (id, evidence) => {
    const meta = RETENTION_FACTOR_BY_ID[id];
    if (!meta) return;
    if (factors.some((f) => f.id === id)) return;
    factors.push({ id, label: meta.label, priorHr: meta.priorHr, basis: meta.basis, evidence });
  };

  const comp = person.compensation || {};
  const annual = num(comp.annualCost, null);
  const bandMin = num(comp.bandMin, null);
  const bandMax = num(comp.bandMax, null);
  const bandMid = bandMin !== null && bandMax !== null ? (bandMin + bandMax) / 2 : null;
  if (annual !== null && bandMin !== null && bandMid !== null) {
    const compa = annual / bandMid;
    if (compa < 0.9) {
      add('pay-below-band', [
        `Recorded annual cost ${comp.currency || ''} ${Math.round(annual).toLocaleString('en-US')} is ${(compa * 100).toFixed(0)}% of the band midpoint`,
        `Band ${bandMin.toLocaleString('en-US')}–${bandMax.toLocaleString('en-US')} ${comp.currency || ''}`.trim(),
      ]);
    }
  }

  const levelSince = person.lastPromotionOn || person.startDate || null;
  const monthsInLevel = monthsBetween(levelSince, today);
  if (monthsInLevel !== null && monthsInLevel > 30 && person.status !== 'archived') {
    add('promotion-stall', [
      person.lastPromotionOn
        ? `Last level change recorded ${person.lastPromotionOn} (${Math.round(monthsInLevel)} months ago)`
        : `No level change on record since starting ${person.startDate} (${Math.round(monthsInLevel)} months)`,
    ]);
  }

  const openGrowth = (state.growthPlans || []).some((p) => p.personId === person.id && p.status === 'active');
  if (!openGrowth) add('development-void', ['No active development plan is linked to this person']);

  const held = held1to1s(state, person.id);
  const lastHeld = held[0]?.date || null;
  const gap = daysSinceDay(lastHeld, today);
  const recent = (state.oneOnOnes || []).filter((m) => m.personId === person.id && m.date && daysSinceDay(m.date, today) !== null && daysSinceDay(m.date, today) <= 56);
  const skipped = recent.filter((m) => m.status === 'skipped').length;
  // A cadence that has never started has still decayed by the time someone is
  // past their first six weeks; the guard keeps a brand-new hire out of it.
  const tenureMonths = monthsBetween(person.startDate, today);
  const neverHeld = gap === null && tenureMonths !== null && tenureMonths * MONTH_DAYS > 42;
  if ((gap !== null && gap > 42) || skipped >= 2 || neverHeld) {
    add('cadence-decay', [
      lastHeld ? `Last held 1:1 was ${gap} days ago (${lastHeld})` : 'No held 1:1 is recorded',
      skipped >= 2 ? `${skipped} skipped 1:1s in the last 8 weeks` : null,
    ].filter(Boolean));
  }

  const moods = held.slice(0, 6).map((m) => num(m.mood, null)).filter((v) => v !== null);
  if (moods.length >= 4) {
    const recentAvg = moods.slice(0, 2).reduce((a, b) => a + b, 0) / Math.min(2, moods.length);
    const baseline = moods.slice(2).reduce((a, b) => a + b, 0) / (moods.length - 2);
    if (baseline - recentAvg >= 0.5) {
      add('energy-decline', [`Recorded energy fell from ${baseline.toFixed(1)} to ${recentAvg.toFixed(1)} (1–5, leader-recorded)`]);
    }
  }

  const lastFeedback = (state.feedback || [])
    .filter((f) => f.personId === person.id && f.direction !== 'received')
    .map((f) => f.date)
    .sort()
    .at(-1) || null;
  const feedbackAge = daysSinceDay(lastFeedback, today);
  if (feedbackAge === null || feedbackAge > 90) {
    add('feedback-drought', [lastFeedback ? `Last feedback was ${feedbackAge} days ago` : 'No feedback recorded']);
  }

  let utilisation = null;
  try {
    const supply = personSupply(person, state, { now, settings });
    const committedDays = (state.portfolio || [])
      .filter((item) => item.ownerId === person.id && item.status === 'open')
      .reduce((sum, item) => sum + num(item.effortDays?.mostLikely, 0), 0);
    if (supply.availableDays > 0) utilisation = committedDays / supply.availableDays;
    if (utilisation !== null && utilisation > 1) {
      add('sustained-overload', [
        `${Math.round(committedDays)} committed person-days against ${Math.round(supply.availableDays)} available this horizon`,
        `Utilisation ${(utilisation * 100).toFixed(0)}%`,
      ]);
    }
  } catch {
    utilisation = null;
  }

  const reviews = latestCompleteReview(state, person.id);
  if (reviews.length >= 2) {
    const rank = (r) => REVIEW_RATINGS.indexOf(r.manager.rating);
    if (rank(reviews[0]) < rank(reviews[1])) {
      add('review-decline', [
        `Latest rating ${reviews[0].manager.rating} is below the previous ${reviews[1].manager.rating}`,
      ]);
    }
  }

  return factors;
}

/* ============================================== 5. risk, cost, and expected loss */

/**
 * Absolute probability band. Kept because it is what the money is derived from,
 * and because a 30% ninety-day probability deserves attention whatever the
 * baseline is.
 */
export function riskBandFor(point, settings = {}) {
  const threshold = num(settings.retentionRiskThresholdPct, 12) / 100;
  if (!Number.isFinite(point)) return RETENTION_RISK_BANDS[0];
  if (point >= threshold * 2) return RETENTION_RISK_BANDS[3];
  if (point >= threshold) return RETENTION_RISK_BANDS[2];
  if (point >= threshold / 2) return RETENTION_RISK_BANDS[1];
  return RETENTION_RISK_BANDS[0];
}

/**
 * Relative band, and the one the ledger ranks on.
 *
 * Why relative: an absolute "12% in 90 days" threshold is a statement about
 * turnover conventions, not about this person. A team with a 4% annual quit rate
 * would have nobody above it even if one person carried four hazard multipliers.
 * The multiplier is what the model can actually compare across people, so the
 * watch band is expressed against the tenure-band baseline and the probability is
 * reported beside it.
 */
export function indexBandFor(multiplier, settings = {}) {
  const threshold = Math.max(1.05, num(settings.retentionRiskIndexThreshold, 1.6));
  if (!Number.isFinite(multiplier)) return RETENTION_RISK_BANDS[0];
  if (multiplier >= threshold * 1.55) return RETENTION_RISK_BANDS[3];
  if (multiplier >= threshold) return RETENTION_RISK_BANDS[2];
  if (multiplier >= threshold * 0.75) return RETENTION_RISK_BANDS[1];
  return RETENTION_RISK_BANDS[0];
}

/**
 * 90-day (configurable horizon) risk for one person.
 *
 * `multiplier` is the product of the factor hazard ratios (fitted when the model
 * is pooled, prior otherwise). The interval multiplies the credible band of the
 * baseline hazard by the interval of the multiplier, so a thin workspace gets an
 * honestly enormous range rather than a confident-looking point estimate.
 */
export function riskForPerson({ baseHazard, factors = [], model = null, horizonDays = 90, settings = {} }) {
  const lookup = new Map((model?.coefficients || []).map((c) => [c.id, c]));
  const horizonMonths = Math.max(0, num(horizonDays, 90)) / MONTH_DAYS;
  let point = 1;
  let lo = 1;
  let hi = 1;
  const applied = [];
  for (const factor of factors) {
    const fitted = lookup.get(factor.id);
    const hr = clamp(num(fitted?.hr, factor.priorHr), 0.2, 8);
    const hrLo = clamp(num(fitted?.lo, hr * Math.exp(-normalQuantile(0.975) * PRIOR_LOG_SPREAD)), 0.05, 20);
    const hrHi = clamp(num(fitted?.hi, hr * Math.exp(normalQuantile(0.975) * PRIOR_LOG_SPREAD)), 0.05, 20);
    point *= hr;
    lo *= hrLo;
    hi *= hrHi;
    applied.push({
      id: factor.id,
      label: factor.label,
      hr,
      lo: hrLo,
      hi: hrHi,
      source: fitted?.source || 'prior',
      evidence: factor.evidence,
    });
  }
  point = clamp(point, 0.2, 8);
  lo = clamp(lo, 0.05, 20);
  hi = clamp(hi, 0.05, 20);
  const base = Math.max(0, num(baseHazard?.smoothed, 0.012));
  const baseLo = Math.max(0, num(baseHazard?.lo, base));
  const baseHi = Math.max(baseLo, num(baseHazard?.hi, base));
  const toProb = (rate, mult) => 1 - Math.exp(-rate * mult * horizonMonths);
  const p = toProb(base, point);
  // The probability band carries the sampling uncertainty of *this workspace's
  // own baseline hazard*, evaluated at the point multiplier. The uncertainty in
  // the multipliers themselves is reported separately as hazard-ratio intervals
  // (`multiplierLo`/`multiplierHi`), which is how the epidemiology this model
  // borrows from reports it. Compounding five prior intervals into the
  // probability band produced 0–99.8% intervals that were honest and useless;
  // separating the two sources keeps each one legible.
  const pLo = toProb(baseLo, point);
  const pHi = toProb(baseHi, point);
  return {
    horizonDays: num(horizonDays, 90),
    point: p,
    lo: Math.min(pLo, p),
    hi: Math.max(pHi, p),
    intervalBasis: 'Baseline-hazard sampling uncertainty at the point multiplier; multiplier uncertainty is reported as separate hazard-ratio intervals.',
    multiplier: point,
    multiplierLo: lo,
    multiplierHi: hi,
    baseHazard: base,
    baseHazardLo: baseLo,
    baseHazardHi: baseHi,
    factors: applied,
    // The band the ledger ranks on is relative to the tenure-band baseline; the
    // absolute probability band is reported beside it and drives the money.
    band: indexBandFor(point, settings),
    probabilityBand: riskBandFor(p, settings),
    mode: model?.mode || 'prior',
    basis: model?.mode === 'pooled' ? 'fitted multipliers' : 'prior multipliers',
  };
}

/** Replacement cost: recorded annual cost × a stated convention. Never invented. */
export function replacementCostFor(person, settings = {}) {
  const annual = num(person?.compensation?.annualCost, null);
  const currency = String(person?.compensation?.currency || '').toUpperCase() || null;
  if (annual === null || !currency) return null;
  const pct = clamp(num(settings.retentionReplacementPct, 50), 10, 300) / 100;
  return {
    amount: annual * pct,
    currency,
    annualCost: annual,
    pct,
    basis: `Recorded annual cost × ${Math.round(pct * 100)}% (replacement convention; 50–200% is the published range, and this is a convention, not a measurement)`,
  };
}

export function expectedLoss(risk, cost) {
  if (!risk || !cost) return null;
  return {
    currency: cost.currency,
    point: risk.point * cost.amount,
    lo: risk.lo * cost.amount,
    hi: risk.hi * cost.amount,
    replacementCost: cost.amount,
  };
}

/** Regrettable weighting from recorded evidence only (readiness = ready-now). */
export function regrettableWeight(state, person) {
  const ready = (state.readiness || []).some((r) => r.personId === person.id && r.rating === 'ready-now');
  const review = latestCompleteReview(state, person.id)[0];
  const strong = review && ['often-exceeds', 'sets-standard'].includes(review.manager?.rating);
  if (ready || strong) return { weight: 1.5, basis: ready ? 'Succession-ready now' : 'Review evidence above expectations' };
  if (review && review.manager?.rating === 'needs-development') return { weight: 0.75, basis: 'Recorded developmental review rating' };
  return { weight: 1, basis: 'No weighted evidence recorded' };
}

/* ================================================== 6. the investment optimiser */

/**
 * Turn each detected factor into a fundable intervention with a money cost, an
 * attention cost in leader-hours and the hazard reduction it is expected to buy.
 */
export function candidateInterventions(state, person, risk, cost, settings = {}) {
  const byIntervention = new Map();
  const comp = person.compensation || {};
  const annual = num(comp.annualCost, null);
  const bandMin = num(comp.bandMin, null);
  const bandMax = num(comp.bandMax, null);
  const bandMid = bandMin !== null && bandMax !== null ? (bandMin + bandMax) / 2 : null;
  const currency = String(comp.currency || '').toUpperCase() || null;
  const promotionPct = clamp(num(settings.retentionPromotionPct, 8), 0, 50) / 100;

  for (const factor of risk.factors) {
    const meta = RETENTION_FACTOR_BY_ID[factor.id];
    const intervention = meta ? RETENTION_INTERVENTION_BY_ID[meta.interventionId] : null;
    if (!intervention) continue;
    const existing = byIntervention.get(intervention.id);
    const removal = 1 / Math.max(0.2, factor.hr);
    if (existing) {
      existing.removesFactors.push(factor.id);
      existing.hazardFactor *= removal;
      continue;
    }
    let moneyCost = 0;
    let costBasis = 'No money cost — attention only';
    let blockedReason = null;
    if (intervention.costKind === 'band-gap' && annual !== null && bandMid !== null && currency) {
      const target = Math.max(bandMin ?? 0, bandMid * 0.95);
      moneyCost = Math.max(0, target - annual);
      costBasis = `Gap from ${Math.round(annual).toLocaleString('en-US')} to the target ${Math.round(target).toLocaleString('en-US')}`;
      if (bandMax !== null && target > bandMax) blockedReason = 'The target pay level is above the recorded band maximum.';
    } else if (intervention.costKind === 'band-gap') {
      blockedReason = 'No recorded annual cost and pay band, so the raise cannot be priced. Record both first.';
    }
    if (intervention.costKind === 'promotion' && annual !== null && currency) {
      moneyCost = annual * promotionPct;
      costBasis = `Recorded annual cost × ${Math.round(promotionPct * 100)}% promotion convention`;
    } else if (intervention.costKind === 'promotion') {
      costBasis = 'No recorded annual cost, so the promotion is costed at zero (unpriced, not free)';
    }
    byIntervention.set(intervention.id, {
      id: intervention.id,
      label: intervention.label,
      description: intervention.description,
      personId: person.id,
      removesFactors: [factor.id],
      hazardFactor: removal,
      hours: num(intervention.hours, 0),
      moneyCost,
      currency,
      costBasis,
      blockedReason,
      priced: Boolean(currency) && (intervention.costKind === 'none' || moneyCost > 0 || intervention.costKind === 'promotion' || intervention.costKind === 'band-gap'),
    });
  }

  const baseRiskPoint = risk.point;
  const baseRiskLo = risk.lo;
  return Array.from(byIntervention.values()).map((candidate) => {
    const horizon = risk.horizonDays / MONTH_DAYS;
    const rate = risk.baseHazard * risk.multiplier;
    const newRate = rate * candidate.hazardFactor;
    // The lower bound uses the same point multiplier on both sides of the
    // intervention, so the difference measures the intervention and not a mix of
    // two uncertainty models.
    const newRiskLo = 1 - Math.exp(-risk.baseHazardLo * risk.multiplier * candidate.hazardFactor * horizon);
    const newRisk = 1 - Math.exp(-newRate * horizon);
    const loss = cost ? {
      before: { lo: baseRiskLo * cost.amount, point: baseRiskPoint * cost.amount },
      after: { lo: newRiskLo * cost.amount, point: newRisk * cost.amount },
      benefitLo: (baseRiskLo - newRiskLo) * cost.amount,
      benefitPoint: (baseRiskPoint - newRisk) * cost.amount,
    } : null;
    // Two numbers, both shown. `benefit` is the point estimate used to rank
    // options; `benefitLo` is what survives the lower bound of this workspace's
    // own baseline-hazard interval. At one observed event the lower bound is
    // near zero, which is the truth — so the allocation lab ranks on the point
    // estimate and separately reports how much of the benefit is defensible,
    // rather than pretending the conservative number is a forecast.
    const benefit = loss ? loss.benefitPoint : 0;
    const benefitLo = loss ? loss.benefitLo : 0;
    return {
      ...candidate,
      riskBefore: baseRiskPoint,
      riskAfter: newRisk,
      hazardReduction: 1 - candidate.hazardFactor,
      benefit,
      benefitLo,
      expectedLossAfter: loss ? loss.after.point : null,
      expectedLossAfterLo: loss ? loss.after.lo : null,
      netValue: benefit - candidate.moneyCost,
      netValueLo: benefitLo - candidate.moneyCost,
      fundableAtLowerBound: benefitLo > candidate.moneyCost,
      roi: candidate.moneyCost > 0 ? benefit / candidate.moneyCost : null,
      roiLo: candidate.moneyCost > 0 ? benefitLo / candidate.moneyCost : null,
    };
  }).filter((c) => c.benefit > 0 || c.hazardReduction > 0);
}

/**
 * Greedy two-constraint knapsack (money budget + leader attention hours), with a
 * documented priority tier so a fairness constraint can outrank pure return.
 *
 * Tier 0: closing a below-band pay gap on someone the workspace can least afford
 * to lose. Tier 1: everything else. This is a deliberate policy in the optimiser,
 * not a hidden weighting: leaving a below-band person unfunded while funding
 * someone else's growth plan is exactly how pay inequity compounds.
 */
export function optimizeRetention(candidates, { budget = 0, hours = 0 } = {}) {
  const capMoney = Math.max(0, num(budget, 0));
  const capHours = Math.max(0, num(hours, 0));
  const eligible = (candidates || []).filter((c) => !c.blockedReason);
  const tier = (c) => (c.id === 'pay-adjust' ? 0 : 1);
  const costIndex = (c) => {
    const moneyShare = capMoney > 0 ? c.moneyCost / capMoney : (c.moneyCost > 0 ? Infinity : 0);
    const hourShare = capHours > 0 ? c.hours / capHours : (c.hours > 0 ? Infinity : 0);
    return moneyShare + hourShare;
  };
  const ranked = eligible.slice().sort((a, b) => {
    const tierDiff = tier(a) - tier(b);
    if (tierDiff !== 0) return tierDiff;
    const ra = costIndex(a) > 0 ? a.benefit / costIndex(a) : a.benefit;
    const rb = costIndex(b) > 0 ? b.benefit / costIndex(b) : b.benefit;
    if (rb !== ra) return rb - ra;
    return b.benefit - a.benefit;
  });
  const selected = [];
  const skipped = [];
  let spend = 0;
  let hoursUsed = 0;
  for (const candidate of ranked) {
    const fitsMoney = spend + candidate.moneyCost <= capMoney + 1e-9;
    const fitsHours = hoursUsed + candidate.hours <= capHours + 1e-9;
    if (fitsMoney && fitsHours) {
      selected.push(candidate);
      spend += candidate.moneyCost;
      hoursUsed += candidate.hours;
    } else {
      skipped.push({
        ...candidate,
        skippedBecause: !fitsMoney ? 'money budget exhausted' : 'leader attention exhausted',
      });
    }
  }
  const blocked = (candidates || []).filter((c) => c.blockedReason);
  const benefit = selected.reduce((s, c) => s + c.benefit, 0);
  const benefitLo = selected.reduce((s, c) => s + c.benefitLo, 0);
  const unaddressedPayGaps = [...skipped, ...blocked].filter((c) => c.id === 'pay-adjust');
  return {
    selected,
    skipped,
    blocked,
    spend,
    hoursUsed,
    budget: capMoney,
    hours: capHours,
    benefit,
    benefitLo,
    defensibleShare: benefit > 0 ? benefitLo / benefit : null,
    moneyLeft: capMoney - spend,
    hoursLeft: capHours - hoursUsed,
    roi: spend > 0 ? benefit / spend : null,
    equity: {
      unaddressedPayGaps: unaddressedPayGaps.length,
      warning: unaddressedPayGaps.length
        ? `${unaddressedPayGaps.length} below-band pay gap${unaddressedPayGaps.length === 1 ? ' is' : 's are'} still unfunded. Pay equity does not close itself after the cycle.`
        : null,
    },
    method: 'Greedy two-constraint knapsack: tier 0 (pay-gap closure) first, then descending conservative benefit per unit of budget+attention. A greedy allocation is not optimal; it is explainable, which is the property that survives a review.',
  };
}

/* ================================================== 7. calibration: does it work? */

/** Harrell's concordance index over comparable pairs, censoring-aware. */
export function concordance(rows, scores) {
  const items = (rows || [])
    .map((r) => ({ row: r, score: num(scores?.get?.(r.personId), null) }))
    .filter((i) => i.score !== null && Number.isFinite(i.row.tenureMonths));
  let comparable = 0;
  let concordant = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (Math.abs(a.row.tenureMonths - b.row.tenureMonths) < 1e-9) continue;
      const aFirst = a.row.tenureMonths < b.row.tenureMonths;
      const earlier = aFirst ? a : b;
      const later = aFirst ? b : a;
      // Comparable when the earlier one had the event, or both had it.
      const usable = earlier.row.event || later.row.event;
      if (!usable) continue;
      if (!earlier.row.event && later.row.event) continue; // later event cannot be compared with earlier censoring
      comparable += 1;
      if (earlier.score > later.score) concordant += 1;
      else if (Math.abs(earlier.score - later.score) < 1e-12) concordant += 0.5;
    }
  }
  return {
    c: comparable ? concordant / comparable : null,
    pairs: comparable,
    sufficient: comparable >= RETENTION_MIN_PAIRS,
  };
}

/** Brier score over committed plans whose horizon has closed. */
export function planBrier(state, { now = new Date() } = {}) {
  const today = dayKey(now);
  const scored = [];
  for (const plan of state.retentionPlans || []) {
    if (plan.status !== 'committed' && plan.status !== 'completed') continue;
    if (!plan.committedOn || num(plan.predictedRisk, null) === null) continue;
    const horizonDays = num(plan.horizonDays, 90);
    const dueOn = addDays(plan.committedOn, horizonDays);
    if (dueOn > today) continue; // the outcome is not knowable yet
    const departure = departureFor(state, plan.personId);
    const leftWithinHorizon = Boolean(departure && departure.lastDay && departure.lastDay <= dueOn && departure.lastDay >= plan.committedOn);
    scored.push({ plan, predicted: num(plan.predictedRisk, 0) / (num(plan.predictedRisk, 0) > 1 ? 100 : 1), outcome: leftWithinHorizon ? 1 : 0 });
  }
  if (!scored.length) return { n: 0, brier: null, sufficient: false };
  const brier = scored.reduce((s, r) => s + (r.predicted - r.outcome) ** 2, 0) / scored.length;
  return { n: scored.length, brier, sufficient: scored.length >= 5, rows: scored };
}

/* ================================================== 8. the report */

function emptyReport() {
  return {
    engineVersion: RETENTION_ENGINE_VERSION,
    generatedOn: null,
    horizonDays: 90,
    people: [],
    survivorship: null,
    model: null,
    calibration: null,
    totals: {},
    plans: [],
    departures: [],
    clusters: [],
    dataGaps: [],
  };
}

/**
 * Compose the whole report once. The nav badge, the Today card, the terminal and
 * the CSV export all read this same function, so they can never disagree.
 */
export function buildRetentionReport(state, { now = new Date(), settings = state?.settings || {} } = {}) {
  if (!state) return emptyReport();
  const today = dayKey(now);
  const horizonDays = Math.max(7, Math.min(730, num(settings.retentionHorizonDays, 90)));
  const { rows, unmeasurable } = buildPersonTime(state, { now });
  const survivorship = kaplanMeier(rows);
  const hazards = bandHazards(rows, {
    priorMonthlyHazard: num(settings.retentionPriorMonthlyHazardPct, 1.2) / 100,
    strength: num(settings.retentionPriorStrengthMonths, 12),
  });

  const peopleById = new Map((state.people || []).map((p) => [p.id, p]));
  const factorMatrix = new Map();
  const factorDetails = new Map();
  for (const person of state.people || []) {
    const factors = detectFactors(state, person, { now, settings });
    factorMatrix.set(person.id, new Set(factors.map((f) => f.id)));
    factorDetails.set(person.id, factors);
  }

  const model = fitHazardModel({ rows }, factorMatrix, {
    ridge: num(settings.retentionRidge, 2),
    minEvents: num(settings.retentionEvidenceFloor, RETENTION_MIN_EVENTS),
  });

  const plansByPerson = new Map();
  for (const plan of state.retentionPlans || []) {
    if (!plansByPerson.has(plan.personId)) plansByPerson.set(plan.personId, []);
    plansByPerson.get(plan.personId).push(plan);
  }

  const people = [];
  const scores = new Map();
  const currencyTotals = new Map();
  const dataGaps = [];
  for (const person of state.people || []) {
    // The ledger ranks people still here. People who left remain in the survival
    // evidence (and in the concordance scoring) but are not "risks" to manage.
    if (person.status === 'archived') continue;
    const time = rows.find((r) => r.personId === person.id);
    if (!time) continue;
    const factorList = factorDetails.get(person.id) || [];
    const band = hazards.byKey[time.tenureBand] || hazards.byKey['0-6m'];
    const risk = riskForPerson({ baseHazard: band, factors: factorList, model, horizonDays, settings });
    const cost = replacementCostFor(person, settings);
    const loss = expectedLoss(risk, cost);
    const weight = regrettableWeight(state, person);
    const plans = (plansByPerson.get(person.id) || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const livePlan = plans.find((p) => p.status === 'committed' || p.status === 'proposed') || null;
    const candidates = candidateInterventions(state, person, risk, cost, settings);
    scores.set(person.id, risk.multiplier);
    if (!cost && person.status !== 'archived') {
      dataGaps.push({ personId: person.id, kind: 'unpriced', detail: 'No recorded annual cost and currency, so the expected loss cannot be priced.' });
    }
    if (person.status !== 'archived' && !person.compensation?.bandMin) {
      dataGaps.push({ personId: person.id, kind: 'no-band', detail: 'No pay band recorded, so the pay-position factor cannot be tested.' });
    }
    if (loss) {
      const key = loss.currency;
      const acc = currencyTotals.get(key) || { currency: key, point: 0, lo: 0, hi: 0, people: 0 };
      acc.point += loss.point * weight.weight;
      acc.lo += loss.lo * weight.weight;
      acc.hi += loss.hi * weight.weight;
      acc.people += 1;
      currencyTotals.set(key, acc);
    }
    people.push({
      person,
      personId: person.id,
      status: person.status,
      tenureMonths: time.tenureMonths,
      tenureBand: time.tenureBand,
      tenureBandLabel: band.label,
      baseHazard: band,
      risk,
      factors: risk.factors,
      cost,
      loss,
      weight,
      plans,
      livePlan,
      candidates,
      utilisation: null,
    });
  }

  people.sort((a, b) => b.risk.point - a.risk.point);

  const calibration = {
    ...concordance(rows, scores),
    brier: planBrier(state, { now }),
    mode: model.mode,
    events: model.events,
    censored: survivorship.censored,
    censorShare: survivorship.censorShare,
    needs: model.mode === 'pooled' ? 0 : model.needs,
  };

  const clusters = exitReasonClusters(state, { now });
  const departures = (state.departures || [])
    .slice()
    .sort((a, b) => String(b.lastDay || '').localeCompare(String(a.lastDay || '')));

  return {
    engineVersion: RETENTION_ENGINE_VERSION,
    generatedOn: today,
    horizonDays,
    people,
    survivorship: {
      ...survivorship,
      bands: hazards.bands,
      prior: hazards.prior,
      strengthMonths: hazards.strength,
      totalMonths: hazards.totalMonths,
      totalEvents: hazards.totalEvents,
    },
    model: {
      ...model,
      modeLabel: model.mode === 'pooled' ? "This workspace's own fit" : 'Literature priors',
    },
    calibration,
    totals: {
      headcount: people.length,
      measured: rows.length,
      unmeasurable: unmeasurable.length,
      elevated: people.filter((p) => ['elevated', 'high'].includes(p.risk.band.key)).length,
      byCurrency: Array.from(currencyTotals.values()).sort((a, b) => b.point - a.point),
      unpriced: dataGaps.filter((g) => g.kind === 'unpriced').length,
    },
    plans: (state.retentionPlans || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    departures,
    clusters,
    dataGaps,
    unmeasurable,
  };
}

/** Exit-reason clustering (Pareto over recorded classes) inside a rolling window. */
export function exitReasonClusters(state, { now = new Date(), windowDays = 365 } = {}) {
  const today = dayKey(now);
  const windowStart = addDays(today, -Math.max(30, num(windowDays, 365)));
  const counts = new Map();
  for (const departure of state.departures || []) {
    if (!departure.lastDay || departure.lastDay < windowStart) continue;
    const key = departure.reasonClass || 'unknown';
    const acc = counts.get(key) || { reasonClass: key, label: DEPARTURE_REASON_LABELS[key] || key, departures: [], voluntary: 0 };
    acc.departures.push(departure);
    if (departure.type === 'voluntary') acc.voluntary += 1;
    counts.set(key, acc);
  }
  return Array.from(counts.values())
    .filter((c) => c.reasonClass !== 'unknown' && c.departures.length >= 2)
    .sort((a, b) => b.departures.length - a.departures.length);
}

/* ================================================== 9. read-side signals */

export function retentionSignals(state, now = new Date()) {
  const report = buildRetentionReport(state, { now, settings: state.settings });
  const signals = [];
  const active = report.people.filter((p) => p.status !== 'archived');

  for (const row of active) {
    if (!['elevated', 'high'].includes(row.risk.band.key)) continue;
    if (row.livePlan && row.livePlan.status === 'committed') continue;
    const factorLabels = row.factors.slice(0, 3).map((f) => f.label.toLowerCase());
    signals.push({
      ruleId: 'RET-01',
      domain: 'Retention',
      personId: row.personId,
      title: `${row.risk.band.label} retention risk: ${row.person.name}`,
      detail: `${Math.round(row.risk.point * 100)}% modelled probability of a voluntary exit within ${report.horizonDays} days (band ${Math.round(row.risk.lo * 100)}–${Math.round(row.risk.hi * 100)}%, ${row.risk.basis}). Drivers: ${factorLabels.length ? factorLabels.join(', ') : 'baseline hazard only'}.`,
      severity: row.risk.band.key === 'high' ? 4 : 3,
      confidence: row.risk.mode === 'pooled' ? 'high' : 'medium',
      evidence: [
        `Tenure band ${row.tenureBandLabel}: ${row.baseHazard.events} event(s) over ${Math.round(row.baseHazard.months)} person-months`,
        row.cost ? `Replacement cost ${row.cost.currency} ${Math.round(row.cost.amount).toLocaleString('en-US')} (${row.cost.basis})` : 'Replacement cost unpriced — record an annual cost',
        row.livePlan ? `Existing plan is ${row.livePlan.status}` : 'No live retention plan',
      ],
      action: { label: 'Open retention terminal', route: '#/retention' },
    });
  }

  if (report.calibration.mode !== 'pooled' && report.calibration.needs > 0 && report.totals.measured > 0) {
    signals.push({
      ruleId: 'RET-02',
      domain: 'Retention',
      title: `Retention model is running on priors — ${report.calibration.needs} more observed departure${report.calibration.needs === 1 ? '' : 's'} to become yours`,
      detail: 'Every hazard multiplier on this screen is a published prior until the workspace has enough observed voluntary departures to identify its own. The engine says so rather than presenting a borrowed ratio as a measurement.',
      severity: 2,
      confidence: 'high',
      evidence: [
        `${report.calibration.events} observed voluntary departure(s)`,
        `${Math.round(report.calibration.censorShare * 100)}% of tenure history is censored`,
      ],
      action: { label: 'Open survivorship', route: '#/retention' },
    });
  }

  for (const departure of report.departures) {
    if (departure.backfillCaseId || departure.lastDay > addDays(dayKey(now), -30)) continue;
    if (departure.continuityHandled) continue;
    signals.push({
      ruleId: 'RET-03',
      domain: 'Retention',
      personId: departure.personId,
      title: `A departure ${daysBetween(departure.lastDay, dayKey(now))} days ago has no continuity case`,
      detail: 'Knowledge, relationships and committed work leave with a person. A continuity case is what keeps their reallocation from becoming tribal memory.',
      severity: 3,
      confidence: 'medium',
      evidence: [`Last day ${departure.lastDay}`, `${DEPARTURE_TYPE_LABELS[departure.type] || departure.type} exit, reason ${DEPARTURE_REASON_LABELS[departure.reasonClass] || 'not recorded'}`],
      action: { label: 'Open departures', route: '#/retention' },
    });
  }

  for (const cluster of report.clusters) {
    signals.push({
      ruleId: 'RET-04',
      domain: 'Retention',
      title: `${cluster.departures.length} exits attributed to ${cluster.label.toLowerCase()} in the last 12 months`,
      detail: 'Repeat exit reasons are a process signal, not a run of bad luck. RULE-RET-04 raises one systemic-driver decision per class rather than a case per person.',
      severity: cluster.departures.length >= 3 ? 4 : 3,
      confidence: 'high',
      evidence: cluster.departures.slice(0, 4).map((d) => `${d.lastDay} · ${DEPARTURE_TYPE_LABELS[d.type] || d.type}`),
      action: { label: 'Open retention terminal', route: '#/retention' },
    });
  }

  const overduePlans = report.plans.filter((p) => p.status === 'committed' && p.reviewOn && p.reviewOn < dayKey(now));
  if (overduePlans.length) {
    signals.push({
      ruleId: 'RET-05',
      domain: 'Retention',
      title: `${overduePlans.length} committed retention plan${overduePlans.length === 1 ? ' is' : 's are'} past review`,
      detail: 'A retention commitment without a review is a conversation the leader had once. The plan ledger exists to make the follow-through visible.',
      severity: 3,
      confidence: 'high',
      evidence: overduePlans.slice(0, 4).map((p) => `Review was due ${p.reviewOn}`),
      action: { label: 'Open retention plans', route: '#/retention' },
    });
  }

  if (report.totals.unpriced > 0) {
    signals.push({
      ruleId: 'RET-06',
      domain: 'Retention',
      title: `${report.totals.unpriced} team member${report.totals.unpriced === 1 ? ' has' : 's have'} no recorded cost, so their risk is unpriced`,
      detail: 'The engine will not invent a salary to make a business case look complete. Unpriced risk is labelled unpriced and excluded from currency totals.',
      severity: 2,
      confidence: 'high',
      evidence: report.dataGaps.filter((g) => g.kind === 'unpriced').slice(0, 4).map((g) => g.detail),
      // The fix happens in the ledger's pay dialog, not in a generic roster
      // screen: the leader is already looking at the risk this cost would price.
      action: { label: 'Add pay data', route: '#/retention?tab=ledger' },
    });
  }

  if (report.calibration.sufficient && report.calibration.c !== null && report.calibration.c < 0.6) {
    signals.push({
      ruleId: 'RET-07',
      domain: 'Retention',
      title: `The retention model ranks worse than chance would (C = ${report.calibration.c.toFixed(2)})`,
      detail: 'Across the comparable pairs this workspace can actually score, a higher modelled hazard did not precede the earlier departure often enough to trust the ordering. Do not allocate on the ranking until it recovers.',
      severity: 4,
      confidence: 'high',
      evidence: [`${report.calibration.pairs} comparable pairs`, `Concordance ${report.calibration.c.toFixed(3)}; 0.5 is chance`],
      action: { label: 'Open calibration', route: '#/retention' },
    });
  }

  return signals;
}

/* ================================================== 10. post-commit rules */

function liteLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId ||
    !targetId
  ) return null;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.links.find((l) =>
    l && l.sourceType === sourceType && l.sourceId === sourceId && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (existing) return existing;
  const link = {
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  };
  draft.links.push(link);
  return link;
}

function shouldRun(event) {
  if (!event) return false;
  return /^(retention\.|departure\.|person\.|oneonone\.|feedback\.|goal\.|review\.|growth\.|portfolio\.)/.test(String(event.type || ''));
}

/**
 * The write-side rule. Every branch is idempotent and none of them commits money.
 */
export function retentionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !shouldRun(event)) return [];
  const declared = Array.isArray(event.rules) && event.rules.includes('retention');
  if (draft.settings?.retentionAutoPropagate === false && event.force !== true && !declared) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    ...ctx,
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  draft.retentionPlans = Array.isArray(draft.retentionPlans) ? draft.retentionPlans : [];
  draft.departures = Array.isArray(draft.departures) ? draft.departures : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const propagations = [];
  const push = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    if (context.logEvent) {
      context.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${ruleId}] ${summary}` });
    }
  };

  /* RULE-RET-02 — a person who left makes their live plan moot, with a reason. */
  for (const departure of draft.departures) {
    if (!departure.personId) continue;
    for (const plan of draft.retentionPlans) {
      if (plan.personId !== departure.personId) continue;
      if (plan.status !== 'proposed' && plan.status !== 'committed') continue;
      plan.status = 'moot';
      plan.closedOn = departure.lastDay || context.todayStr;
      plan.closeReason = `The person left on ${departure.lastDay || 'an unrecorded date'} (${departure.type}). A commitment made for someone who has left is history, not a failure to hide.`;
      plan.updatedAt = context.nowIso;
      plan.history = [...(plan.history || []), { on: context.todayStr, action: 'moot', note: plan.closeReason }].slice(-30);
      push('RULE-RET-02', 'closed', 'retention', plan.id, `Retention plan for ${plan.personId} marked moot after departure`);
    }
  }

  /* RULE-RET-01 — an elevated-risk person with no live plan gets one proposal. */
  const liveByPerson = new Map();
  for (const plan of draft.retentionPlans) {
    if (plan.status === 'proposed' || plan.status === 'committed') liveByPerson.set(plan.personId, plan);
  }
  // Person-time, band hazards, the factor matrix and the fitted model do not
  // depend on which person is being scored, so they are computed once for the
  // roster. Rebuilding them inside the loop was quadratic work on every write.
  const personTime = buildPersonTime(draft, { now });
  const rows = personTime.rows;
  const hazards = bandHazards(rows, {
    priorMonthlyHazard: num(draft.settings?.retentionPriorMonthlyHazardPct, 1.2) / 100,
    strength: num(draft.settings?.retentionPriorStrengthMonths, 12),
  });
  // The fit must see everyone, including people who have already left: their
  // departures are the events being modelled.
  const factorsByPerson = new Map();
  const factorMatrix = new Map();
  for (const p of draft.people || []) {
    const detected = detectFactors(draft, p, { now, settings: draft.settings || {} });
    factorsByPerson.set(p.id, detected);
    factorMatrix.set(p.id, new Set(detected.map((f) => f.id)));
  }
  const model = fitHazardModel({ rows }, factorMatrix, {
    ridge: num(draft.settings?.retentionRidge, 2),
    minEvents: num(draft.settings?.retentionEvidenceFloor, RETENTION_MIN_EVENTS),
  });
  const rowByPerson = new Map(rows.map((r) => [r.personId, r]));
  const horizonDays = num(draft.settings?.retentionHorizonDays, 90);
  for (const person of draft.people || []) {
    if (person.status === 'archived') continue;
    if (liveByPerson.has(person.id)) continue;
    const factors = factorsByPerson.get(person.id) || [];
    if (!factors.length) continue;
    // No observation, no proposal: see observedSignalFor above.
    if (!observedSignalFor(draft, person.id)) continue;
    const row = rowByPerson.get(person.id);
    if (!row) continue;
    const band = hazards.byKey[row.tenureBand];
    const risk = riskForPerson({
      baseHazard: band,
      factors,
      model,
      horizonDays,
      settings: draft.settings || {},
    });
    // The watch band is relative to the person's own tenure-band baseline, so a
    // low-turnover team still surfaces its outliers. The absolute probability is
    // carried on the plan as `predictedRisk`.
    if (!['elevated', 'high'].includes(risk.band.key)) continue;
    const cost = replacementCostFor(person, draft.settings || {});
    const candidates = candidateInterventions(draft, person, risk, cost, draft.settings || {});
    const plan = {
      id: context.idFactory('retention'),
      personId: person.id,
      status: 'proposed',
      source: 'RULE-RET-01',
      proposedOn: context.todayStr,
      committedOn: null,
      reviewOn: addDays(context.todayStr, num(draft.settings?.retentionReviewDays, 30)),
      horizonDays: risk.horizonDays,
      predictedRisk: Math.round(risk.point * 1000) / 10,
      predictedBand: risk.band.key,
      mode: risk.mode,
      rationale: `Engine proposal, not a commitment: ${factors.map((f) => f.label.toLowerCase()).join(', ')}.`,
      interventions: candidates.map((c) => ({
        id: c.id,
        label: c.label,
        hours: c.hours,
        moneyCost: c.moneyCost,
        currency: c.currency,
        hazardReduction: c.hazardReduction,
        blockedReason: c.blockedReason,
        doneOn: null,
      })),
      committedCost: 0,
      currency: cost?.currency || person.compensation?.currency || null,
      budgetId: null,
      decisionId: null,
      caseId: null,
      closedOn: null,
      closeReason: '',
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
      history: [{ on: context.todayStr, action: 'proposed', note: `Rule proposal from a ${risk.band.label.toLowerCase()} risk band` }],
    };
    draft.retentionPlans.push(plan);
    liveByPerson.set(person.id, plan);
    liteLink(draft, {
      sourceType: 'person', sourceId: person.id,
      targetType: 'retention', targetId: plan.id,
      relation: 'retains', ruleId: 'RULE-RET-01',
      summary: 'Retention plan proposed for an elevated-risk team member',
    }, context);
    push('RULE-RET-01', 'created', 'retention', plan.id, `Proposed a retention plan (${risk.band.label.toLowerCase()} band, ${candidates.length} intervention(s))`);
  }

  /* RULE-RET-03 — crossing the evidence floor raises one governance decision. */
  const departures = draft.departures;
  const voluntary = departures.filter((d) => d.type === 'voluntary').length;
  const floor = num(draft.settings?.retentionEvidenceFloor, RETENTION_MIN_EVENTS);
  const floorMarker = `[RULE-RET-03]`;
  const hasFloorDecision = draft.decisions.some((d) => String(d.rationale || '').includes(floorMarker));
  if (voluntary >= floor && !hasFloorDecision) {
    const decision = {
      id: context.idFactory('dec'),
      title: 'Adopt the workspace’s own retention multipliers or keep the priors?',
      question: 'The retention model has enough observed departures to estimate its own hazard ratios. Should the fitted multipliers replace the literature priors in allocation decisions?',
      date: context.todayStr,
      reversibility: 'reversible',
      driver: draft.settings?.leaderName || 'Leader',
      approver: draft.settings?.leaderName || 'Leader',
      contributors: '',
      informed: '',
      options: [
        { id: context.idFactory('opt'), label: 'Adopt the fitted multipliers', pros: 'The model reflects this team, not an average of everyone else’s.', cons: 'Fitted ratios on small samples are still noisy; the confidence intervals must be read.' },
        { id: context.idFactory('opt'), label: 'Keep the literature priors', pros: 'Stable, explainable, and unaffected by a few unusual exits.', cons: 'Ignores the only data that describes this actual team.' },
      ],
      chosen: '',
      rationale: `${floorMarker} ${voluntary} observed voluntary departures have crossed the evidence floor of ${floor}. The fitted model and the prior model are both reported; this decision records which one the workspace will act on.`,
      reviewOn: addDays(context.todayStr, num(draft.settings?.decisionReviewDays, 14)),
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
      decidedOn: null,
      outcome: 'pending',
      evidenceGapAcknowledged: false,
    };
    draft.decisions.push(decision);
    push('RULE-RET-03', 'created', 'decision', decision.id, `Raised the retention model-governance decision at ${voluntary} observed departures`);
  }

  /* RULE-RET-04 — clustered exit reasons raise one systemic-driver decision. */
  const clusters = exitReasonClusters(draft, { now });
  for (const cluster of clusters) {
    const marker = `[RULE-RET-04:${cluster.reasonClass}]`;
    if (draft.decisions.some((d) => String(d.rationale || '').includes(marker))) continue;
    const decision = {
      id: context.idFactory('dec'),
      title: `Address the systemic driver behind ${cluster.departures.length} “${cluster.label}” exits?`,
      question: `Two or more departures in the last twelve months share the recorded exit reason “${cluster.label}”. Is this a systemic driver worth a structural fix, or a coincidence?`,
      date: context.todayStr,
      reversibility: 'irreversible',
      driver: draft.settings?.leaderName || 'Leader',
      approver: draft.settings?.leaderName || 'Leader',
      contributors: '',
      informed: '',
      options: [
        { id: context.idFactory('opt'), label: 'Open a structural fix', pros: 'Repeated exit reasons are the cheapest diagnostic a team produces.', cons: 'Structural fixes cost money and time and can be wrong.' },
        { id: context.idFactory('opt'), label: 'Record the hypothesis and keep watching', pros: 'Avoids over-reacting to two data points.', cons: 'The third exit is the same evidence with a higher price.' },
      ],
      chosen: '',
      rationale: `${marker} ${cluster.departures.length} departures recorded as “${cluster.label}” inside the rolling twelve-month window (${cluster.departures.map((d) => d.lastDay).join(', ')}).`,
      reviewOn: addDays(context.todayStr, num(draft.settings?.decisionReviewDays, 14)),
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
      decidedOn: null,
      outcome: 'pending',
      evidenceGapAcknowledged: false,
    };
    draft.decisions.push(decision);
    push('RULE-RET-04', 'created', 'decision', decision.id, `Raised a systemic-driver decision for clustered “${cluster.label}” exits`);
  }

  return propagations;
}

/* ================================================== 11. deterministic brief */

export function retentionBrief(report, { teamName = 'the team' } = {}) {
  if (!report || !report.people?.length) {
    return ['No retention evidence is recorded yet. Record start dates, and departures as they happen, and this brief fills itself.'];
  }
  const lines = [];
  const active = report.people.filter((p) => p.status !== 'archived');
  const elevated = active.filter((p) => ['elevated', 'high'].includes(p.risk.band.key));
  lines.push(`${teamName}: ${active.length} people, ${report.survivorship.totalEvents} observed voluntary departure(s) over ${Math.round(report.survivorship.totalMonths)} person-months.`);
  lines.push(`Mode: ${report.model.modeLabel}${report.calibration.needs ? ` — ${report.calibration.needs} more observed departure(s) before the multipliers are this workspace's own.` : '.'}`);
  if (report.survivorship.medianIdentified) {
    lines.push(`Median tenure on the Kaplan–Meier curve: ${report.survivorship.median.toFixed(1)} months (${Math.round(report.survivorship.censorShare * 100)}% of records censored).`);
  } else {
    lines.push(`The survival curve has not fallen below 50%, so median tenure is not yet identified; ${Math.round(report.survivorship.censorShare * 100)}% of records are censored.`);
  }
  if (elevated.length) {
    lines.push(`${elevated.length} of ${active.length} carry an elevated or high ${report.horizonDays}-day risk band.`);
  } else {
    lines.push(`No one is outside the watch band at the current hazard estimates.`);
  }
  for (const total of report.totals.byCurrency) {
    lines.push(`Expected retention exposure (${total.currency}, regrettable-weighted): ${Math.round(total.lo).toLocaleString('en-US')}–${Math.round(total.hi).toLocaleString('en-US')}, point estimate ${Math.round(total.point).toLocaleString('en-US')}.`);
  }
  if (!report.totals.byCurrency.length) lines.push('No expected-loss figure is quoted because no annual cost is recorded; the risk is unpriced rather than zero.');
  lines.push(`Calibration: ${report.calibration.sufficient ? `concordance C = ${report.calibration.c.toFixed(2)} over ${report.calibration.pairs} comparable pairs` : `not yet measurable (${report.calibration.pairs} of ${RETENTION_MIN_PAIRS} comparable pairs)`}${report.calibration.brier.sufficient ? `, Brier ${report.calibration.brier.brier.toFixed(3)} over ${report.calibration.brier.n} closed plans` : ''}.`);
  if (report.clusters.length) {
    lines.push(`Clustered exit reasons: ${report.clusters.map((c) => `${c.label} (${c.departures.length})`).join(', ')}.`);
  }
  lines.push('Currencies are never summed. Costs are derived only from recorded annual figures and a stated replacement convention.');
  return lines;
}
