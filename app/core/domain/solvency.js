/**
 * app/core/domain/solvency.js — the Promise Solvency Terminal read model
 * (Schema v80, ADR-0073).
 *
 * This module is a PURE READ MODEL plus two deliberate writers: one frozen
 * reading and its single later grade. Every promise it prices is a dated record
 * another module already keeps; every probability is read off the leader's own
 * settled history; every correlation is declared by the leader and printed.
 *
 *   harvest    six promise sources, each an adapter over an existing collection
 *   history    settled settlement offsets per source (obligation → settlement)
 *   breach     PD from the conditional survival of that offset distribution
 *   book       the maturity ladder, the latency (Little's law) and the coverage
 *              ratio (a declared analogue of a liquidity coverage ratio)
 *   joint      Fréchet bounds printed beside a one-factor Gaussian copula at the
 *              declared ρ, with marginal contributions that rank a repair queue
 *   repair     expected trust loss of leaving a promise against the cost of
 *              asking for a new date — in declared units, never in money
 *   freeze     one prospective probability, graded once, afterwards, by Brier
 *
 * Refusals are part of the design: a source below its history floor is never
 * priced from its own record, an unpriced promise is never counted as safe, a
 * coverage ratio with no measurable service rate is withheld rather than set to
 * zero, and the joint probability is quoted as the assumption-free Fréchet
 * ceiling so the frozen number can never be optimistic.
 */

import {
  SOLVENCY_ENGINE_VERSION,
  SOLVENCY_LIMITS,
  SOLVENCY_BUCKETS,
  SOLVENCY_SIGNAL_IDS,
  SOLVENCY_SOURCE_VERDICT_LABELS,
  SOLVENCY_SOURCE_VERDICT_TEXT,
  PROMISE_SOURCES,
  PROMISE_REPAIR_LABELS,
  promiseSource,
} from './solvencyRegistry.js';
import { normalizeSolvencySettings } from './solvencySchema.js';
import { addDays, dayKey, daysBetween } from '../time.js';

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

function asArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

function dayOf(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/* ------------------------------------------------------------------ */
/* 1. Small numerical library (no dependencies, pinned by tests)       */
/* ------------------------------------------------------------------ */

/**
 * Error function. Two regimes, both to double precision: a Maclaurin series for
 * |x| < 3 (every term kept until it stops changing the sum) and a Lentz
 * continued fraction for the complementary function beyond it. The whole copula
 * layer rests on this, so it is tested against published anchors rather than
 * trusted.
 */
export function erf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : x < 0 ? -1 : 0;
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a < 3) {
    let term = a;
    let sum = a;
    for (let n = 1; n < 200; n += 1) {
      term *= (-a * a) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-18 * Math.abs(sum)) break;
    }
    return sign * (2 / Math.sqrt(Math.PI)) * sum;
  }
  // erfc(a) = exp(-a²)/√π · 1/(a + 1/(2a + 2/(a + 3/(2a + …))))
  const t = a * a;
  let f = a;
  for (let k = 40; k >= 1; k -= 1) {
    f = a + (k / 2) / f;
  }
  const erfc = Math.exp(-t) / (Math.sqrt(Math.PI) * f);
  return sign * (1 - erfc);
}

/** Standard normal CDF. */
export function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Wilson score interval for a proportion, used for every on-time share. */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    pct: round(p * 100, 1),
    loPct: round(Math.max(0, centre - half) * 100, 1),
    hiPct: round(Math.min(1, centre + half) * 100, 1),
  };
}

/**
 * Quantile of the standard normal (Acklam's rational approximation with one
 * Newton–Halley refinement against `normCdf`, which lands within ~1e-15).
 */
export function normInv(p) {
  if (!Number.isFinite(p)) return NaN;
  const clamped = Math.min(1 - 1e-15, Math.max(1e-15, p));
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x;
  if (clamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (clamped <= pHigh) {
    const q = clamped - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - clamped));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // One Halley step against our own CDF keeps the two functions consistent.
  const e = normCdf(x) - clamped;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/* ------------------------------------------------------------------ */
/* 2. The credit-portfolio layer                                       */
/* ------------------------------------------------------------------ */

/**
 * Joint probability that at least one exposure breaks.
 *
 * One-factor Gaussian copula (Vasicek 1987; Merton 1974):
 *
 *   A_i = √ρ·Z + √(1−ρ)·ε_i,  breach when A_i < Φ⁻¹(PD_i)
 *   PD_i(z) = Φ( (Φ⁻¹(PD_i) − √ρ·z) / √(1−ρ) )
 *   P(any)  = 1 − ∫ Π_i (1 − PD_i(z)) φ(z) dz
 *
 * At ρ = 0 this is exactly the independence value, which is why the two are
 * never allowed to disagree; at ρ → 1 every promise fails together and P(any)
 * collapses to max(PD_i). The integral is Simpson's rule on [−8, 8], where φ is
 * below 1e-15, so the truncation is not measurable at the precision printed.
 *
 * Marginal contribution_i = P(any) − P(any without i), computed in the same
 * pass with prefix/suffix products: this is the Euler/Tasche allocation applied
 * to breach probability, and it is the only sound way to rank a repair queue —
 * an exposure's own PD is not its contribution to the book.
 */
export function jointBreachRisk({ pds, rho }) {
  const list = (Array.isArray(pds) ? pds : [])
    .map((p) => Math.min(1 - 1e-12, Math.max(1e-12, Number(p))))
    .filter((p) => Number.isFinite(p));
  const r = Math.min(0.999, Math.max(0, Number(rho) || 0));
  const n = list.length;
  const independence = 1 - list.reduce((product, p) => product * (1 - p), 1);
  const comonotonic = n ? Math.max(...list) : 0;
  const frechetLow = comonotonic;
  const frechetHigh = Math.min(1, list.reduce((sum, p) => sum + p, 0));
  if (!n) {
    return {
      n: 0, rho: r, pAny: 0, independence: 0, comonotonic: 0,
      frechetLow: 0, frechetHigh: 0, marginal: [],
    };
  }
  if (r === 0) {
    return {
      n, rho: 0, pAny: independence, independence, comonotonic, frechetLow, frechetHigh,
      marginal: list.map((p, i) => {
        const others = list.reduce((product, q, j) => (j === i ? product : product * (1 - q)), 1);
        return others * p;
      }),
    };
  }
  const sq = Math.sqrt(r);
  const den = Math.sqrt(1 - r);
  const a = list.map((p) => normInv(p));
  const Z = 8;
  const steps = Math.max(100, Math.min(1600, SOLVENCY_LIMITS.quadratureNodes));
  const even = steps % 2 === 0 ? steps : steps + 1;
  const h = (2 * Z) / even;
  const marginal = new Array(n).fill(0);
  let productSum = 0;
  for (let k = 0; k <= even; k += 1) {
    const z = -Z + k * h;
    const weight = (k === 0 || k === even) ? 1 : (k % 2 === 0 ? 2 : 4);
    const density = weight * (h / 3) * Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const q = new Array(n);
    for (let i = 0; i < n; i += 1) q[i] = normCdf((a[i] - sq * z) / den);
    // Π(1 − q_i) with prefix/suffix products, so per-exposure terms cost O(n).
    const prefix = new Array(n + 1).fill(1);
    const suffix = new Array(n + 1).fill(1);
    for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] * (1 - q[i]);
    for (let i = n - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] * (1 - q[i]);
    productSum += density * prefix[n];
    for (let i = 0; i < n; i += 1) marginal[i] += density * q[i] * prefix[i] * suffix[i + 1];
  }
  const pAny = Math.min(1, Math.max(0, 1 - productSum));
  return {
    n,
    rho: r,
    pAny,
    independence,
    comonotonic,
    frechetLow,
    frechetHigh,
    marginal: marginal.map((m) => Math.min(1, Math.max(0, m))),
  };
}

/**
 * The distribution of the NUMBER of breaches — the quantity the leader actually
 * signs when they freeze a reading.
 *
 * P(any breach) saturates: for sixteen promises with a 30% average it reads 97.7%
 * every time, so scoring it against a binary outcome teaches almost nothing, and
 * a Fréchet ceiling of 100% scores a perfect zero on any book that has a breach.
 * The count does not saturate, so it is what gets scored.
 *
 * Under the same one-factor model, conditional on the common factor Z = z the
 * promises are independent Bernoullis with probabilities PD_i(z). The mixture
 *
 *   P(N = k) = ∫ [z^k] Π_i ( (1 − PD_i(z)) + PD_i(z)·z ) φ(z) dz
 *
 * is integrated here exactly as P(any) is, by Simpson's rule on [−8, 8]: the
 * coefficient of z^k in the product of the conditional probability generating
 * functions. At ρ = 0 the same convolution is the Poisson-binomial law, computed
 * without quadrature, so the two ends of the model agree by construction.
 */
export function breachCountDistribution({ pds, rho, nodes = null }) {
  const list = (Array.isArray(pds) ? pds : [])
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p))
    .map((p) => Math.min(1 - 1e-12, Math.max(1e-12, p)));
  const r = Math.min(0.999, Math.max(0, Number(rho) || 0));
  const n = list.length;
  const mean = list.reduce((sum, p) => sum + p, 0);
  if (!n) return { n: 0, rho: r, mean: 0, pmf: [1] };

  const convolve = (pmf, q) => {
    const next = new Array(pmf.length + 1).fill(0);
    for (let k = 0; k < pmf.length; k += 1) {
      next[k] += pmf[k] * (1 - q);
      next[k + 1] += pmf[k] * q;
    }
    return next;
  };

  if (r === 0) {
    let pmf = [1];
    for (const p of list) pmf = convolve(pmf, p);
    return { n, rho: 0, mean, pmf };
  }

  const sq = Math.sqrt(r);
  const den = Math.sqrt(1 - r);
  const a = list.map((p) => normInv(p));
  const Z = 8;
  const cap = Number.isFinite(nodes) ? Number(nodes) : Math.min(SOLVENCY_LIMITS.quadratureNodes, 480);
  const steps = Math.max(64, Math.round(cap / 2) * 2);
  const h = (2 * Z) / steps;
  let pmf = new Array(n + 1).fill(0);
  for (let k = 0; k <= steps; k += 1) {
    const z = -Z + k * h;
    const weight = (k === 0 || k === steps) ? 1 : (k % 2 === 0 ? 2 : 4);
    const density = weight * (h / 3) * Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    let conditional = [1];
    for (let i = 0; i < n; i += 1) {
      conditional = convolve(conditional, normCdf((a[i] - sq * z) / den));
    }
    for (let j = 0; j < conditional.length; j += 1) pmf[j] += density * conditional[j];
  }
  const total = pmf.reduce((sum, p) => sum + p, 0);
  if (total > 0) pmf = pmf.map((p) => Math.max(0, p / total));
  return { n, rho: r, mean, pmf };
}

/**
 * Ranked probability score (Epstein 1969) for an ordinal forecast: the squared
 * distance between the forecast and observed cumulative distributions, summed
 * over every cut point below the top category. It is strictly proper, so a
 * model cannot improve it by hedging, and it punishes a forecast that is wrong
 * by three breaches more than one wrong by one.
 */
export function rankedProbabilityScore(pmf, observed) {
  const rows = Array.isArray(pmf) ? pmf : [];
  if (!rows.length) return null;
  const k = Number(observed);
  if (!Number.isFinite(k)) return null;
  let forecastCum = 0;
  let total = 0;
  for (let i = 0; i < rows.length - 1; i += 1) {
    forecastCum += rows[i];
    /* O_i = P(observed ≤ i): a step, not an accumulation. */
    const observedCum = i >= k ? 1 : 0;
    total += (forecastCum - observedCum) ** 2;
  }
  return total;
}

/**
 * Logarithmic score of the observed count, in nats (lower is better). A zero
 * probability on the observed category is an infinite penalty rather than a
 * flattering number, so it is refused as null and printed as a refusal.
 */
export function countLogScore(pmf, observed) {
  const rows = Array.isArray(pmf) ? pmf : [];
  const k = Number(observed);
  if (!rows.length || !Number.isFinite(k) || k < 0 || k >= rows.length) return null;
  const p = rows[k];
  return p > 0 ? Math.max(0, -Math.log(p)) : null;
}

/* ------------------------------------------------------------------ */
/* 3. Harvesters — one per registry source                             */
/* ------------------------------------------------------------------ */

/**
 * A promise is `{ id, label, obligationOn, openedOn, settlementOn, open }`.
 * `settlementOn` is the day the promise was actually kept (or returned); a null
 * settlement on an open promise means it is still outstanding. Nothing is
 * inferred: if a record has no obligation date it is not a promise.
 */
function makePromise(record) {
  if (!record || !record.id || !record.obligationOn) return null;
  return {
    id: record.id,
    label: String(record.label || '').slice(0, 140),
    obligationOn: record.obligationOn,
    openedOn: record.openedOn || null,
    settlementOn: record.settlementOn || null,
    open: record.settlementOn ? false : record.open !== false,
    detail: record.detail || null,
  };
}

const HARVESTERS = {
  /** Delegations: a dated promise to a person; delivered or returned both settle it. */
  delegation: (state) => asArray(state.delegations).map((row) => makePromise({
    id: row.id,
    label: row.title,
    obligationOn: dayOf(row.dueOn),
    openedOn: dayOf(row.delegatedOn),
    settlementOn: dayOf(row.completedOn) || dayOf(row.returnedOn),
    open: row.status === 'active',
  })).filter(Boolean),

  /** Decisions: the promise is the review date — the loop the leader owes. */
  decision: (state) => asArray(state.decisions).map((row) => makePromise({
    id: row.id,
    label: row.title,
    obligationOn: dayOf(row.reviewOn),
    openedOn: dayOf(row.date),
    settlementOn: dayOf(row.reviewedOn),
    open: (row.outcome || 'pending') === 'pending',
  })).filter(Boolean),

  /** Goals: the date the outcome was promised for. */
  goal: (state) => asArray(state.goals).map((row) => makePromise({
    id: row.id,
    label: row.title,
    obligationOn: dayOf(row.dueDate),
    openedOn: dayOf(row.createdAt),
    settlementOn: dayOf(row.completedOn),
    open: (row.status || 'active') === 'active',
  })).filter(Boolean),

  /** Feedback follow-ups: the explicit "I will come back to you" promise. */
  followup: (state) => asArray(state.feedback)
    .filter((row) => row.followUpOn)
    .map((row) => makePromise({
      id: row.id,
      label: row.behavior || row.situation || 'Follow up on feedback',
      obligationOn: dayOf(row.followUpOn),
      openedOn: dayOf(row.date) || dayOf(row.observedOn),
      settlementOn: row.followUpDone === true ? dayOf(row.followUpCompletedOn) : null,
      open: row.followUpDone !== true,
    })).filter(Boolean),

  /**
   * Stakeholder contact dates: a cadence promise to somebody outside the team.
   * The settlement is the first logged contact on or after the promised date —
   * a contact that happened *before* the promise was made does not keep it.
   */
  contact: (state) => asArray(state.stakeholders)
    .filter((row) => (row.status || 'active') === 'active' && row.nextContactOn)
    .map((row) => {
      const promised = dayOf(row.nextContactOn);
      const log = asArray(row.contactLog).map((entry) => dayOf(entry.date) || dayOf(entry.on)).filter(Boolean);
      const after = log.filter((d) => promised && d >= promised).sort();
      const last = dayOf(row.lastContactOn);
      const settled = after[0] || (last && promised && last >= promised ? last : null);
      return makePromise({
        id: row.id,
        label: row.name || 'Stakeholder contact',
        obligationOn: promised,
        openedOn: last,
        settlementOn: settled,
        open: true,
      });
    }).filter(Boolean),

  /** Requisitions: a start date promised to the organisation. */
  requisition: (state) => asArray(state.requisitions).map((row) => makePromise({
    id: row.id,
    label: row.title,
    obligationOn: dayOf(row.targetStartOn),
    openedOn: dayOf(row.openedOn),
    settlementOn: dayOf(row.closedOn),
    open: (row.status || 'open') === 'open',
  })).filter(Boolean),
};

/** Every promise the workspace holds, grouped by source. */
export function harvestPromises(state, sourceKey) {
  const harvester = HARVESTERS[sourceKey];
  return harvester ? harvester(state || {}) : [];
}

/**
 * Settlement offsets for one source: `settledOn − obligationOn` in whole days,
 * positive when the promise settled after its date. Only settled promises with
 * both dates can contribute; an open promise is right-censored and is *not*
 * imputed into the distribution (stated in the method panel).
 */
export function settlementOffsets(state, sourceKey) {
  const offsets = [];
  for (const promise of harvestPromises(state, sourceKey)) {
    if (!promise.settlementOn) continue;
    const offset = daysBetween(promise.obligationOn, promise.settlementOn);
    if (offset === null) continue;
    offsets.push({ id: promise.id, offset });
  }
  return offsets;
}

/**
 * Offsets pooled *within a counterparty class* — used only when a source is
 * unproven. Pooling is an exchangeability claim, so it is kept as narrow as the
 * registry allows: a goal (owed to the organisation) may borrow from decisions
 * and requisitions, a follow-up (owed to a person) from delegations, and a
 * stakeholder contact (owed outside the team) borrows from nothing, because no
 * other source in this workspace records a promise to an outsider. That refusal
 * is a feature: an external cadence nobody has ever measured cannot be made
 * measurable by averaging it with an internal one.
 */
export function classOffsets(state, counterparty) {
  const out = [];
  for (const meta of PROMISE_SOURCES) {
    if (meta.counterparty !== counterparty) continue;
    out.push(...settlementOffsets(state, meta.key).map((row) => row.offset));
  }
  return out;
}

/** Offsets across every source, used only for the method panel's pooled count. */
export function pooledOffsets(state) {
  const out = [];
  for (const meta of PROMISE_SOURCES) out.push(...settlementOffsets(state, meta.key));
  return out;
}

/**
 * Jeffreys-smoothed survival of the settlement offset:
 *
 *   S(t) = ( #{offset ≥ t} + ½ ) / ( n + 1 )
 *
 * The ½ is not decoration. Without it a source whose every promise settled a
 * day early would price the next promise at PD = 0 — a certainty of being kept —
 * and a source whose every promise settled late would price it at PD = 1. With
 * it the estimate can never claim certainty from a finite record, which is the
 * same discipline every other terminal in this app applies.
 */
export function offsetSurvival(offsets) {
  const values = (Array.isArray(offsets) ? offsets : [])
    .map((row) => (typeof row === 'number' ? row : row && row.offset))
    .filter((n) => Number.isFinite(n));
  const n = values.length;
  return (t) => {
    if (!n) return 1;
    const atOrAfter = values.filter((v) => v >= t).length;
    return (atOrAfter + 0.5) / (n + 1);
  };
}

/**
 * P(this promise breaks), from the conditional survival of the source's own
 * settlement offsets.
 *
 *   breach   ⇔ settled after its obligation date  ⇔ offset ≥ 1
 *   open now ⇒ settlement has not happened yet     ⇒ offset ≥ today − obligation
 *   PD       = S(1) / S(today − obligation)
 *
 * A promise two months out is priced near its source's late share; a promise due
 * today is priced near certainty, because conditioning on having outlived every
 * settlement the record contains is what being due today means for a source that
 * has never once settled on the day.
 *
 * DAY-GRID CONTINUITY. Offsets are whole days, so a record can be silent at
 * exactly 0 while holding settlements at ±2 — and then the ratio reads 1/1 = 1
 * for an item due today, which is a certainty an eight-item record has not
 * earned. One virtual on-time settlement is therefore added at offset 0: the
 * smallest prior that makes "on time" representable on the grid. It is printed
 * as a convention, and it can only ever *lower* a probability, never raise one.
 *
 * Returns null — never 0 — when the source is below its history floor, so an
 * unpriced promise cannot masquerade as a safe one.
 */
export function breachProbability({ offsets, obligationOn, today, minHistory = 5 }) {
  const values = (Array.isArray(offsets) ? offsets : [])
    .map((row) => (typeof row === 'number' ? row : row && row.offset))
    .filter((n) => Number.isFinite(n));
  if (values.length < Math.max(1, minHistory)) return null;
  const r = daysBetween(today, obligationOn);
  if (r === null) return null;
  const n = values.length;
  const pseudo = 1;
  const survival = (t) => {
    const atOrAfter = values.filter((v) => v >= t).length + (t <= 0 ? pseudo : 0);
    return Math.min(1, (atOrAfter + 0.5) / (n + pseudo + 1));
  };
  const denominator = survival(-r);
  if (!(denominator > 0)) return null;
  const p = survival(1) / denominator;
  return Math.min(1, Math.max(0, p));
}

/* ------------------------------------------------------------------ */
/* 4. The report                                                       */
/* ------------------------------------------------------------------ */

export function solvencyConventions(settings) {
  return normalizeSolvencySettings(settings);
}

function movesLookup(state) {
  const map = new Map();
  for (const row of asArray(state.solvencyRenegotiations)) {
    const key = `${row.sourceKey}|${row.promiseId}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function bucketFor(daysUntil) {
  for (const bucket of SOLVENCY_BUCKETS) {
    if (daysUntil <= bucket.days) return bucket;
  }
  return SOLVENCY_BUCKETS[SOLVENCY_BUCKETS.length - 1];
}

/** One source's measured reliability, with its own refusals. */
function buildSource(state, meta, today, conventions) {
  const promises = harvestPromises(state, meta.key);
  const offsets = settlementOffsets(state, meta.key).map((row) => row.offset);
  const n = offsets.length;
  const ownPriced = n >= conventions.solvencyMinHistory;
  const classPool = meta.counterparty ? classOffsets(state, meta.counterparty) : [];
  const poolPriced = !ownPriced
    && conventions.solvencyAllowPooling
    && classPool.length >= Math.max(conventions.solvencyMinHistory * 2, 10);
  const usable = ownPriced ? offsets : poolPriced ? classPool : null;
  const onTime = offsets.filter((v) => v <= 0).length;
  const wilson = n ? wilsonInterval(onTime, n) : null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : round((sorted[n / 2 - 1] + sorted[n / 2]) / 2, 1)) : null;
  const classOnTime = classPool.filter((v) => v <= 0).length;
  const classWilson = classPool.length ? wilsonInterval(classOnTime, classPool.length) : null;
  // The verdict is about THIS source's own record. A source with one settled
  // promise is unproven even when its class is well measured — the class is what
  // prices it, never what certifies it.
  const verdict = !ownPriced
    ? 'unproven'
    : (wilson ? wilson.pct : 0) >= conventions.solvencyOnTimeBarPct
      ? 'reliable'
      : (wilson ? wilson.pct : 0) < 50
        ? 'unreliable'
        : 'watch';
  const open = promises.filter((p) => p.open);
  const overdue = open.filter((p) => p.obligationOn < today);
  return {
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    settleLabel: meta.settleLabel,
    counterparty: meta.counterparty,
    route: meta.route,
    weight: meta.weight,
    question: meta.question,
    settledN: n,
    onTimeN: onTime,
    onTimePct: wilson ? wilson.pct : null,
    onTimeInterval: wilson,
    medianOffsetDays: median,
    worstOffsetDays: n ? sorted[n - 1] : null,
    bestOffsetDays: n ? sorted[0] : null,
    pricedBy: ownPriced ? 'own' : poolPriced ? 'pool' : null,
    priced: Boolean(usable),
    classN: classPool.length,
    classOnTimePct: classWilson ? classWilson.pct : null,
    classLabel: meta.counterparty === 'person' ? 'promises owed to people'
      : meta.counterparty === 'org' ? 'promises owed to the organisation'
        : 'promises owed to outsiders',
    verdict,
    verdictLabel: SOLVENCY_SOURCE_VERDICT_LABELS[verdict],
    verdictText: SOLVENCY_SOURCE_VERDICT_TEXT[verdict],
    openCount: open.length,
    overdueCount: overdue.length,
    totalCount: promises.length,
    offsets: ownedClone(usable),
  };
}

function ownedClone(list) {
  return Array.isArray(list) ? [...list] : [];
}

function renegotiationScript({ meta, promise, pdPct, today, moves, maxMoves }) {
  const daysLate = daysBetween(promise.obligationOn, today);
  const when = daysLate === null ? '' : daysLate > 0
    ? `It was due ${daysLate} day(s) ago.`
    : `It is due in ${Math.abs(daysLate)} day(s).`;
  const history = moves > 0
    ? ` This date has already moved ${moves} time(s), and the cap is ${maxMoves}.`
    : ' This date has not moved before.';
  if (moves >= maxMoves) {
    return `Do not move it again.${history} A promise that has moved ${moves} times is not being renegotiated, it is being broken slowly. `
      + `Decide: cut the scope, hand it to someone with capacity, or accept the breach and say so out loud.`;
  }
  return `${meta.unit === 'call' ? 'Close the loop' : 'Renegotiate'} on “${String(promise.label).slice(0, 90)}”. ${when} `
    + `Your own record prices its chance of breaking at ${pdPct === null ? 'an unpriced level' : `${pdPct}%`}.${history} `
    + 'Say the sentence before they discover it: what changed, what the new date is, and what you are giving up to hold it. '
    + 'Renegotiating early costs one unit of trust; a breach discovered late costs several.';
}

export function solvencyReport(state, now = new Date(), settings = null) {
  const today = todayOf(now);
  const rawSettings = settings || (state && state.settings) || {};
  const conventions = normalizeSolvencySettings(rawSettings);
  const cacheKey = `${SOLVENCY_ENGINE_VERSION}|${today}|${JSON.stringify({
    w: conventions.solvencyWindowDays,
    h: conventions.solvencyHorizonDays,
    r: conventions.solvencyRhoPct,
    m: conventions.solvencyMinHistory,
    p: conventions.solvencyAllowPooling,
    t: conventions.solvencyOnTimeBarPct,
    x: conventions.solvencyBreachMultiplier,
    v: conventions.solvencyMaxMoves,
  })}`;
  if (state && typeof state === 'object') {
    const hit = REPORT_CACHE.get(state);
    if (hit && hit.key === cacheKey) return hit.report;
  }

  const pooled = pooledOffsets(state || {});
  const sources = PROMISE_SOURCES.map((meta) => buildSource(state || {}, meta, today, conventions));
  const moves = movesLookup(state || {});
  const horizonDays = conventions.solvencyHorizonDays;

  /* ---- the book: every open promise, classified ---- */
  const book = [];
  for (const source of sources) {
    for (const promise of harvestPromises(state, source.key).filter((p) => p.open)) {
      const daysUntil = daysBetween(today, promise.obligationOn);
      const overdue = daysUntil !== null && daysUntil < 0;
      const withinHorizon = daysUntil !== null && daysUntil >= 0 && daysUntil <= horizonDays;
      const pd = overdue ? 1 : source.priced ? breachProbability({
        offsets: source.offsets, obligationOn: promise.obligationOn, today, minHistory: 1,
      }) : null;
      const moveCount = moves.get(`${source.key}|${promise.id}`) || 0;
      book.push({
        sourceKey: source.key,
        sourceLabel: source.label,
        promiseId: promise.id,
        label: promise.label,
        counterparty: source.counterparty,
        weight: source.weight,
        obligationOn: promise.obligationOn,
        openedOn: promise.openedOn,
        daysUntil,
        overdue,
        withinHorizon,
        state: overdue ? 'overdue' : withinHorizon ? (pd === null ? 'unpriced' : 'imminent') : 'open',
        pdPct: pd === null ? null : round(pd * 100, 1),
        pd,
        pricedBy: source.pricedBy,
        moves: moveCount,
        route: source.route,
        repairScript: renegotiationScript({
          meta: promiseSource(source.key), promise, pdPct: pd === null ? null : round(pd * 100, 1),
          today, moves: moveCount, maxMoves: conventions.solvencyMaxMoves,
        }),
      });
    }
  }
  book.sort((a, b) => (a.obligationOn < b.obligationOn ? -1 : a.obligationOn > b.obligationOn ? 1 : 0));

  const overduePromises = book.filter((p) => p.overdue);
  const exposures = book
    .filter((p) => p.withinHorizon && p.pd !== null)
    .sort((a, b) => (b.pd - a.pd) || (b.weight - a.weight))
    .slice(0, SOLVENCY_LIMITS.maxExposures);
  const unpriced = book.filter((p) => p.pd === null && !p.overdue);

  /* ---- the joint risk of the forward book ---- */
  const rho = conventions.solvencyRhoPct / 100;
  const joint = jointBreachRisk({ pds: exposures.map((p) => p.pd), rho });
  const repair = exposures.map((exposure, index) => {
    const contribution = joint.marginal[index] ?? 0;
    const leaveLoss = exposure.pd * conventions.solvencyBreachMultiplier * exposure.weight;
    const askCost = exposure.weight;
    const structurallyUndeliverable = exposure.moves >= conventions.solvencyMaxMoves;
    const verdict = structurallyUndeliverable
      ? 'decide'
      : leaveLoss > askCost
        ? 'renegotiate'
        : leaveLoss > askCost / 2
          ? 'watch'
          : 'let-run';
    return {
      ...exposure,
      contribution: round(contribution, 4),
      contributionPct: round(contribution * 100, 2),
      leaveLoss: round(leaveLoss, 2),
      askCost: round(askCost, 2),
      expectedSaving: round(Math.max(0, leaveLoss - askCost), 2),
      verdict,
      verdictLabel: PROMISE_REPAIR_LABELS[verdict],
    };
  }).sort((a, b) => (b.expectedSaving - a.expectedSaving) || (b.contribution - a.contribution));

  /* ---- the maturity ladder ---- */
  const ladder = [];
  let lower = 0;
  for (const bucket of SOLVENCY_BUCKETS) {
    const upper = bucket.days;
    const rows = exposures.filter((p) => p.daysUntil > lower && (upper === Infinity || p.daysUntil <= upper));
    const span = upper === Infinity ? null : Math.max(0, upper - Math.min(lower, upper));
    const capacity = span === null ? null : serviceRate(state, today, conventions) * (span / DAYS_PER_WEEK);
    ladder.push({
      key: bucket.key,
      label: bucket.label,
      days: upper === Infinity ? null : upper,
      count: rows.length,
      weightSum: round(rows.reduce((sum, r) => sum + r.weight, 0), 1),
      expectedBreaches: round(rows.reduce((sum, r) => sum + r.pd, 0), 2),
      maxPdPct: rows.length ? round(Math.max(...rows.map((r) => r.pd)) * 100, 1) : null,
      capacity: capacity === null ? null : round(capacity, 2),
      coverage: capacity === null || !rows.length ? null : round(capacity / rows.length, 2),
    });
    lower = bucket.days;
  }

  /* ---- capacity, flow and coverage ---- */
  const service = serviceRate(state, today, conventions);
  const arrivals = arrivalRate(state, today, conventions);
  const openCount = book.length;
  const clearanceWeeks = service > 0 ? round(openCount / service, 1) : null;
  const due28 = book.filter((p) => !p.overdue && p.daysUntil !== null && p.daysUntil <= 28).length;
  const coverageRatio = service > 0 && due28 > 0 ? round((service * 4) / due28, 2) : null;
  const stress = [100, 80, 60, 40].map((pct) => {
    const capacity = service * (pct / 100) * 4;
    return {
      capacityPct: pct,
      capacity: round(capacity, 2),
      due28,
      coverage: due28 > 0 && service > 0 ? round(capacity / due28, 2) : null,
      shortfall: due28 > 0 && service > 0 ? Math.max(0, Math.ceil(due28 - capacity)) : null,
    };
  });

  const counts = {
    promises: book.length + sources.reduce((sum, s) => sum + s.settledN, 0),
    open: openCount,
    overdue: overduePromises.length,
    withinHorizon: exposures.length,
    unpriced: unpriced.length,
    pricedByPool: book.filter((p) => p.pricedBy === 'pool').length,
    repair: repair.filter((r) => r.verdict === 'renegotiate').length,
    decide: repair.filter((r) => r.verdict === 'decide').length,
    structurallyUndeliverable: book.filter((p) => p.moves >= conventions.solvencyMaxMoves).length,
    sources: sources.length,
    pricedSources: sources.filter((s) => s.priced).length,
    settledInWindow: settledInWindow(state, today, conventions).length,
  };

  const readings = (Array.isArray(state?.solvencyReadings) ? state.solvencyReadings : []).map((reading) => {
    const due = reading.reviewOn <= today;
    let breached = 0;
    let considered = 0;
    for (const exposure of reading.exposures) {
      const promise = harvestPromises(state, exposure.sourceKey).find((p) => p.id === exposure.promiseId);
      if (!promise) continue;
      considered += 1;
      if (isBreachedAt(promise, reading.reviewOn)) breached += 1;
    }
    return {
      ...reading,
      due,
      gradeable: due && !reading.graded,
      windowOpen: !due,
      liveAnyBreach: considered ? breached > 0 : null,
      liveBreachedCount: considered ? breached : null,
      liveConsidered: considered,
    };
  });

  const report = {
    version: SOLVENCY_ENGINE_VERSION,
    today,
    conventions,
    sources,
    book,
    exposures,
    unpricedPromises: unpriced.slice(0, 20),
    repair,
    overduePromises: overduePromises.slice(0, 20),
    ladder,
    joint: {
      ...joint,
      anyPct: round(joint.pAny * 100, 1),
      independencePct: round(joint.independence * 100, 1),
      comonotonicPct: round(joint.comonotonic * 100, 1),
      frechetLowPct: round(joint.frechetLow * 100, 1),
      frechetHighPct: round(joint.frechetHigh * 100, 1),
      // Expected breaches is the one figure that needs NO dependence assumption
      // at all — linearity of expectation holds for any copula — and it is the
      // figure a leader can act on. A 28-promise book with a 35% average per-item
      // probability will break *something* almost surely; the question that moves
      // behaviour is how many, and which ones.
      expectedBreaches: round(exposures.reduce((sum, p) => sum + p.pd, 0), 2),
      breachSharePct: exposures.length
        ? round((exposures.reduce((sum, p) => sum + p.pd, 0) / exposures.length) * 100, 1)
        : null,
      stakeWeightedBreaches: round(exposures.reduce((sum, p) => sum + p.pd * p.weight, 0), 2),
    },
    capacity: {
      servicePerWeek: round(service, 3),
      arrivalsPerWeek: round(arrivals, 3),
      utilisation: service > 0 ? round(arrivals / service, 2) : null,
      clearanceWeeks,
      dueNext28: due28,
      coverageRatio,
      stress,
    },
    counts,
    readings,
    ungradedDue: readings.filter((r) => r.gradeable).length,
    alarm: {
      pct: conventions.solvencyAlarmPct,
      // The alarm is on the SHARE of the forward book expected to break, because
      // P(at least one) saturates to ~100% for any book of more than a few
      // promises and would fire permanently, training the leader to ignore it.
      breachSharePct: exposures.length
        ? round((exposures.reduce((sum, p) => sum + p.pd, 0) / exposures.length) * 100, 1)
        : null,
      breached: exposures.length
        ? (exposures.reduce((sum, p) => sum + p.pd, 0) / exposures.length) * 100 >= conventions.solvencyAlarmPct
        : false,
    },
    method: {
      windowDays: conventions.solvencyWindowDays,
      horizonDays: conventions.solvencyHorizonDays,
      rhoPct: conventions.solvencyRhoPct,
      alarmPct: conventions.solvencyAlarmPct,
      onTimeBarPct: conventions.solvencyOnTimeBarPct,
      minHistory: conventions.solvencyMinHistory,
      breachMultiplier: conventions.solvencyBreachMultiplier,
      maxMoves: conventions.solvencyMaxMoves,
      pooling: conventions.solvencyAllowPooling,
      pooledN: pooled.length,
      daysPerWeek: DAYS_PER_WEEK,
    },
  };
  if (state && typeof state === 'object') REPORT_CACHE.set(state, { key: cacheKey, report });
  return report;
}

/** Settled promises across every source whose settlement day lands in the window. */
function settledInWindow(state, today, conventions) {
  const start = addDays(today, -conventions.solvencyWindowDays);
  const out = [];
  for (const meta of PROMISE_SOURCES) {
    for (const promise of harvestPromises(state, meta.key)) {
      if (!promise.settlementOn) continue;
      if (promise.settlementOn > start && promise.settlementOn <= today) {
        out.push({ sourceKey: meta.key, id: promise.id, settledOn: promise.settlementOn });
      }
    }
  }
  return out;
}

/** Promises settled per week, measured over the declared window. */
export function serviceRate(state, today, conventions) {
  const inWindow = settledInWindow(state, today, conventions);
  return inWindow.length / (conventions.solvencyWindowDays / DAYS_PER_WEEK);
}

/** Promises opened per week, measured over the declared window. */
export function arrivalRate(state, today, conventions) {
  const start = addDays(today, -conventions.solvencyWindowDays);
  let count = 0;
  for (const meta of PROMISE_SOURCES) {
    for (const promise of harvestPromises(state, meta.key)) {
      if (promise.openedOn && promise.openedOn > start && promise.openedOn <= today) count += 1;
    }
  }
  return count / (conventions.solvencyWindowDays / DAYS_PER_WEEK);
}

/**
 * Was this promise in breach as of `observedOn`? A promise is breached when it
 * settles after its obligation date, or when the observation date passes its
 * obligation with nothing settled. The day itself is not a breach: a promise due
 * on the observation date still has that day to be kept.
 */
export function isBreachedAt(promise, observedOn) {
  if (!promise || !promise.obligationOn || !observedOn) return false;
  const obligation = promise.obligationOn;
  if (promise.settlementOn) {
    if (promise.settlementOn <= observedOn) return promise.settlementOn > obligation;
    return obligation < observedOn;
  }
  return obligation < observedOn;
}

/* ------------------------------------------------------------------ */
/* 5. Freeze, grade, brief and signals                                 */
/* ------------------------------------------------------------------ */

/**
 * Freeze one reading.
 *
 * The graded claim is the copula value at the leader's own declared ρ — a model,
 * labelled as one. The Fréchet ceiling `min(1, Σ PD)`, the independence value and
 * the comonotonic floor are stored and printed beside it so the correlation
 * assumption is visible at the moment it is made; the ceiling is never scored,
 * because a bound that reads 100% is a constant rather than a forecast. An empty
 * book refuses to freeze: a reading with no exposure would be a quote with no
 * claim.
 */
export function buildSolvencyReading(report, state, now, readingId, options = {}) {
  const exposures = report.exposures.slice(0, SOLVENCY_LIMITS.maxExposures);
  if (!exposures.length) {
    return {
      ok: false,
      reason: 'Nothing to freeze: no promise falls due inside the horizon with a measurable history. A reading with no exposure would be a quote with no claim.',
    };
  }
  const reviewDays = Number.isFinite(Number(options.reviewDays))
    ? Math.min(365, Math.max(7, Math.round(Number(options.reviewDays))))
    : report.conventions.solvencyReviewHorizonDays;
  const today = todayOf(now);
  const joint = report.joint;
  return {
    ok: true,
    record: {
      id: readingId,
      frozenAt: now.toISOString(),
      reviewOn: addDays(today, reviewDays),
      horizonDays: report.conventions.solvencyHorizonDays,
      windowDays: report.conventions.solvencyWindowDays,
      rhoPct: report.conventions.solvencyRhoPct,
      alarmPct: report.conventions.solvencyAlarmPct,
      exposures: exposures.map((exposure, index) => ({
        sourceKey: exposure.sourceKey,
        promiseId: exposure.promiseId,
        label: exposure.label,
        obligationOn: exposure.obligationOn,
        pdPct: round(exposure.pd * 100, 2),
        weight: exposure.weight,
        pricedBy: exposure.pricedBy || 'own',
        contributionPct: round((joint.marginal[index] ?? 0) * 100, 2),
      })),
      // The graded claim is the copula value at the leader's own declared ρ —
      // a model, labelled as one. The assumption-free ceiling is stored beside
      // it as a bound, printed on every panel, and deliberately never scored.
      predictedAnyBreachPct: joint.anyPct,
      predictedCeilingPct: joint.frechetHighPct,
      predictedIndependencePct: joint.independencePct,
      predictedComonotonicPct: joint.comonotonicPct,
      expectedBreaches: joint.expectedBreaches,
      breachSharePct: joint.breachSharePct,
      coverageRatio: report.capacity.coverageRatio,
      dueCount: report.counts.withinHorizon,
      overdueCount: report.counts.overdue,
      unpricedCount: report.counts.unpriced,
      pricedByPoolCount: exposures.filter((e) => e.pricedBy === 'pool').length,
      expectedLossUnits: round(report.repair.reduce((sum, row) => sum + (row.leaveLoss || 0), 0), 2),
      repairCount: report.counts.repair,
      graded: null,
      challengeNotes: [],
    },
  };
}

/**
 * Grade once, from strictly later evidence. A reading whose window has not closed
 * cannot be graded; a window that closes with every frozen promise deleted is
 * *lapsed* rather than excused, and a lapsed reading carries no Brier score
 * because there was nothing left to score.
 */
export function gradeSolvencyReading(reading, state, now = new Date()) {
  if (!reading) return { ok: false, reason: 'That reading no longer exists.' };
  if (reading.graded) return { ok: false, reason: 'This reading has already been graded once. A forecast is graded once.' };
  const today = todayOf(now);
  if (!reading.reviewOn || reading.reviewOn > today) {
    return { ok: false, reason: `The review date (${reading.reviewOn}) has not arrived. Grading early would score a claim before its evidence window closed.` };
  }
  const observedOn = reading.reviewOn;
  let breachedCount = 0;
  let considered = 0;
  const breached = [];
  /* Every priced promise is one forecast-outcome pair. Scoring the exposures
     individually is the whole point: a book whose joint claim is 97.7% either
     way is not a measurement, but sixteen promise-level probabilities against
     sixteen outcomes is. */
  const pairs = [];
  for (const exposure of reading.exposures || []) {
    const promise = harvestPromises(state, exposure.sourceKey).find((p) => p.id === exposure.promiseId);
    if (!promise) continue;
    considered += 1;
    const broke = isBreachedAt(promise, observedOn);
    if (broke) {
      breachedCount += 1;
      breached.push(`${exposure.sourceKey}:${exposure.promiseId}`);
    }
    const pd = Number(exposure.pdPct);
    if (Number.isFinite(pd)) pairs.push({ pd: Math.min(1, Math.max(0, pd / 100)), actual: broke ? 1 : 0 });
  }
  if (!considered) {
    return {
      ok: true,
      grade: {
        gradedAt: now.toISOString(), anyBreach: false, breachedCount: 0, considered: 0, scored: 0,
        baseRatePct: null, brier: null, brierRef: null, skill: null, brierJoint: null,
        countRps: null, countRpsIndependence: null, countLog: null, countLogIndependence: null, lapsed: true,
      },
      result: {
        anyBreach: false, breached: [], considered: 0, scored: 0, brier: null, skill: null, lapsed: true,
      },
    };
  }
  const anyBreach = breachedCount > 0;
  const outcome = anyBreach ? 1 : 0;
  const scored = pairs.length;
  const baseRate = scored ? pairs.reduce((sum, pair) => sum + pair.actual, 0) / scored : null;
  const brier = scored ? pairs.reduce((sum, pair) => sum + (pair.pd - pair.actual) ** 2, 0) / scored : null;
  /* Climatology: always quote the book's own breach rate. Its Brier score has a
     closed form, mean((b - o)^2) = b(1 - b) — computed explicitly so the
     comparison is visible rather than asserted. */
  const brierRef = scored ? pairs.reduce((sum, pair) => sum + (baseRate - pair.actual) ** 2, 0) / scored : null;
  const skill = scored && brierRef > 0 ? 1 - brier / brierRef : null;
  const p = Math.min(1, Math.max(0, reading.predictedAnyBreachPct / 100));
  /* The count is scored against the model the reading declared and against the
     model it explicitly refused. The Fréchet ceiling is not scored: a bound that
     reads 100% is a constant, not a forecast, and scoring it flatters whichever
     book happens to break. */
  const pds = pairs.map((pair) => pair.pd);
  const declaredRho = Number.isFinite(Number(reading.rhoPct)) ? Number(reading.rhoPct) / 100 : 0;
  const declared = breachCountDistribution({ pds, rho: declaredRho });
  const independent = breachCountDistribution({ pds, rho: 0 });
  const countRps = rankedProbabilityScore(declared.pmf, breachedCount);
  const countRpsIndependence = rankedProbabilityScore(independent.pmf, breachedCount);
  const countLog = countLogScore(declared.pmf, breachedCount);
  const countLogIndependence = countLogScore(independent.pmf, breachedCount);
  const grade = {
    gradedAt: now.toISOString(),
    anyBreach,
    breachedCount,
    considered,
    scored,
    baseRatePct: baseRate === null ? null : round(baseRate * 100, 1),
    brier: brier === null ? null : round(brier, 4),
    brierRef: brierRef === null ? null : round(brierRef, 4),
    skill: skill === null ? null : round(skill, 3),
    /* The binary claim the leader signed, scored for completeness. It carries one
       observation per reading and saturates near certainty for any real book, so
       it is never the headline. */
    brierJoint: round((p - outcome) ** 2, 4),
    countRps: countRps === null ? null : round(countRps, 3),
    countRpsIndependence: countRpsIndependence === null ? null : round(countRpsIndependence, 3),
    countLog: countLog === null ? null : round(countLog, 3),
    countLogIndependence: countLogIndependence === null ? null : round(countLogIndependence, 3),
    lapsed: false,
  };
  return {
    ok: true,
    grade,
    result: {
      anyBreach, breached, considered, scored, brier: grade.brier, skill: grade.skill,
      brierJoint: grade.brierJoint, observedBreaches: breachedCount,
      countRps: grade.countRps, countRpsIndependence: grade.countRpsIndependence,
      countLog: grade.countLog, countLogIndependence: grade.countLogIndependence,
    },
  };
}

/**
 * Book-level skill across graded readings.
 *
 * Two scores, weighted differently on purpose. The promise-level Brier is
 * weighted by how many promises each reading scored, because a reading of
 * sixteen promises carries more evidence than one of three. The count scores are
 * averaged per reading, because each reading contributes exactly one observed
 * count — there is no weighting trick that can create more observations than the
 * leader made. Skill is withheld below five readings: a mean of three does not
 * identify a skill.
 */
export function solvencySkill(readings) {
  const graded = (Array.isArray(readings) ? readings : [])
    .filter((r) => r.graded && !r.graded.lapsed && Number.isFinite(r.graded.brier));
  if (!graded.length) {
    return {
      n: 0, scored: 0, brier: null, brierRef: null, skill: null, brierJoint: null,
      countRps: null, countRpsIndependence: null, countGainRps: null,
      countLog: null, countLogIndependence: null, countGainLog: null,
    };
  }
  const weightOf = (r) => (Number.isFinite(r.graded.scored) && r.graded.scored > 0 ? r.graded.scored : 1);
  const weight = graded.reduce((sum, r) => sum + weightOf(r), 0);
  const brier = graded.reduce((sum, r) => sum + r.graded.brier * weightOf(r), 0) / weight;
  const refRows = graded.filter((r) => Number.isFinite(r.graded.brierRef) && r.graded.brierRef > 0);
  const refWeight = refRows.reduce((sum, r) => sum + weightOf(r), 0);
  const brierRef = refWeight ? refRows.reduce((sum, r) => sum + r.graded.brierRef * weightOf(r), 0) / refWeight : null;
  const meanOf = (field) => {
    const rows = graded.filter((r) => Number.isFinite(r.graded[field]));
    return rows.length ? rows.reduce((sum, r) => sum + r.graded[field], 0) / rows.length : null;
  };
  const countRps = meanOf('countRps');
  const countRpsIndependence = meanOf('countRpsIndependence');
  const countLog = meanOf('countLog');
  const countLogIndependence = meanOf('countLogIndependence');
  const jointRows = graded.filter((r) => Number.isFinite(r.graded.brierJoint));
  const brierJoint = jointRows.length ? jointRows.reduce((sum, r) => sum + r.graded.brierJoint, 0) / jointRows.length : null;
  return {
    n: graded.length,
    scored: graded.reduce((sum, r) => sum + (Number.isFinite(r.graded.scored) ? r.graded.scored : 0), 0),
    brier: round(brier, 4),
    brierRef: brierRef === null ? null : round(brierRef, 4),
    skill: graded.length >= 5 && brierRef > 0 ? round(1 - brier / brierRef, 3) : null,
    brierJoint: brierJoint === null ? null : round(brierJoint, 4),
    countRps: countRps === null ? null : round(countRps, 3),
    countRpsIndependence: countRpsIndependence === null ? null : round(countRpsIndependence, 3),
    /* Positive when declaring correlation beat assuming independence. Negative is
       a legitimate outcome and is printed as one. */
    countGainRps: countRps === null || countRpsIndependence === null ? null : round(countRpsIndependence - countRps, 3),
    countLog: countLog === null ? null : round(countLog, 3),
    countLogIndependence: countLogIndependence === null ? null : round(countLogIndependence, 3),
    countGainLog: countLog === null || countLogIndependence === null ? null : round(countLogIndependence - countLog, 3),
  };
}

export function solvencyBrief(report, now = new Date()) {
  const lines = [];
  const j = report.joint;
  lines.push(`## Promise solvency — ${report.today}`);
  lines.push('');
  lines.push(`${report.counts.open} open promise(s): ${report.counts.overdue} already past its date, `
    + `${report.counts.withinHorizon} falling due inside ${report.method.horizonDays} days, `
    + `${report.counts.unpriced} with no measurable history and therefore never priced as safe.`);
  lines.push('');
  lines.push(`**The forward book:** ${j.expectedBreaches} breach(es) expected across ${report.counts.withinHorizon} promise(s) `
    + `(${j.breachSharePct}% of the book), against your ${report.alarm.pct}% alarm. `
    + `Expectation needs no dependence assumption. The chance of at least one breach is ${j.anyPct}% at your declared ρ of `
    + `${report.method.rhoPct}%; independence would read ${j.independencePct}% and the assumption-free interval is `
    + `[${j.frechetLowPct}%, ${j.frechetHighPct}%].`);
  if (report.capacity.coverageRatio !== null) {
    lines.push(`**Coverage:** ${report.capacity.coverageRatio}× — ${report.capacity.dueNext28} promise(s) fall due in the next four weeks `
      + `against a measured settlement rate of ${report.capacity.servicePerWeek}/week. `
      + `${report.capacity.utilisation === null ? '' : `New promises arrive at ${report.capacity.arrivalsPerWeek}/week (utilisation ${report.capacity.utilisation}×). `}`
      + `${report.capacity.clearanceWeeks === null ? '' : `At this rate the whole book clears in ${report.capacity.clearanceWeeks} week(s) (Little's Law, unchanged demand).`}`);
  } else {
    lines.push('**Coverage refused:** no measurable settlement rate, or nothing falling due, so no ratio is quoted.');
  }
  const top = report.repair.find((row) => row.verdict === 'renegotiate');
  if (top) {
    lines.push('');
    lines.push(`**The one move:** renegotiate “${String(top.label).slice(0, 80)}” (${top.sourceLabel.toLowerCase()}). `
      + `Its own chance of breaking is ${top.pdPct}% and it carries ${top.contributionPct} pp of the book's joint breach probability. `
      + `Leaving it costs ${top.leaveLoss} declared trust unit(s); asking now costs ${top.askCost}. The script is on the repair page.`);
  } else if (report.counts.withinHorizon) {
    lines.push('');
    lines.push('**No renegotiation is worth the ask this week:** every priced exposure costs less to leave than to renegotiate at the declared multiplier.');
  }
  if (report.counts.structurallyUndeliverable) {
    lines.push(`**${report.counts.structurallyUndeliverable} promise(s) have already moved to the cap.** A date moved a third time is not a renegotiation — decide, cut or hand over.`);
  }
  const skill = solvencySkill(report.readings);
  if (skill.n) {
    lines.push('');
    lines.push(`**Calibration:** ${skill.n} graded reading(s) scoring ${skill.scored} promise(s) individually — `
      + `Brier ${skill.brier} against ${skill.brierRef} for the book's own breach rate`
      + `${skill.skill === null ? ' (skill withheld below five readings)' : `, skill ${skill.skill}`}. `
      + (skill.countRps === null ? '' : `On the number actually signed — how many promises break — the declared model scores `
        + `RPS ${skill.countRps} and ${skill.countLog} nats, against ${skill.countRpsIndependence} and ${skill.countLogIndependence} `
        + `if every promise were independent`
        + (skill.countGainRps >= 0 ? `; declaring correlation earned ${skill.countGainRps} of RPS.` : `; assuming independence scores ${Math.abs(skill.countGainRps)} better, and the declared ρ is not earning its keep.`)));
  }
  lines.push('');
  lines.push('Aggregate only: no person is named, rated or ranked, and an unpriced promise is counted out loud rather than treated as safe.');
  return lines.join('\n');
}

export function solvencySignals(state, now = new Date(), settings = null) {
  const report = solvencyReport(state, now, settings);
  const signals = [];
  const add = (signal) => signals.push(signal);
  const j = report.joint;

  if (report.capacity.coverageRatio !== null && report.capacity.coverageRatio < 1) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.COVERAGE,
      domain: 'Promise solvency',
      severity: 3,
      confidence: 'high',
      title: `The book is over-sold: coverage ${report.capacity.coverageRatio}×`,
      detail: `${report.capacity.dueNext28} promise(s) fall due in the next four weeks and your own record settles ${report.capacity.servicePerWeek}/week. `
        + `That is ${report.capacity.coverageRatio < 0.5 ? 'less than half' : `${Math.round((1 - report.capacity.coverageRatio) * 100)}% short of`} `
        + 'the capacity the book already assumes. Cutting scope or renegotiating a date is cheaper now than an apology later.',
      action: { label: 'Open the promise book', route: '#/solvency?panel=capacity' },
      evidence: [`coverage ${report.capacity.coverageRatio}×`, `${report.capacity.dueNext28} due in 28d`, `${report.capacity.servicePerWeek}/wk settled`],
    });
  }

  if (report.counts.overdue > 0) {
    const worst = report.overduePromises[0];
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.OVERDUE,
      domain: 'Promise solvency',
      severity: report.counts.overdue >= 3 ? 3 : 2,
      confidence: 'high',
      title: `${report.counts.overdue} promise(s) are already past their date`,
      detail: `The oldest is “${String(worst.label).slice(0, 90)}” (${worst.sourceLabel.toLowerCase()}), ${Math.abs(worst.daysUntil)} day(s) late. `
        + 'A promise nobody has renegotiated is not a small delay — it is a breach the other side already knows about and you have not acknowledged.',
      action: { label: 'Open the repair queue', route: '#/solvency?panel=repair' },
      evidence: [`${report.counts.overdue} overdue`, `oldest ${Math.abs(worst.daysUntil)}d`],
    });
  }

  if (report.alarm.breached) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.JOINT,
      domain: 'Promise solvency',
      severity: 3,
      confidence: 'medium',
      title: `${j.breachSharePct}% of the forward book is expected to break`,
      detail: `${j.expectedBreaches} breach(es) expected across ${report.counts.withinHorizon} promise(s) inside ${report.method.horizonDays} days, `
        + `against your ${report.alarm.pct}% alarm. Expectation is assumption-free. At your declared ρ of ${report.method.rhoPct}% the joint `
        + `probability of at least one breach is ${j.anyPct}% (independence ${j.independencePct}%, assumption-free interval `
        + `${j.frechetLowPct}–${j.frechetHighPct}%).`,
      action: { label: 'Open the breach risk', route: '#/solvency?panel=risk' },
      evidence: [`${j.breachSharePct}% of book`, `${j.expectedBreaches} expected`, `alarm ${report.alarm.pct}%`],
    });
  }

  const marginal = report.repair.find((row) => row.verdict === 'renegotiate' && row.contributionPct > 0);
  if (marginal) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.MARGINAL,
      domain: 'Promise solvency',
      severity: 2,
      confidence: 'medium',
      title: `One renegotiation moves the book by ${marginal.contributionPct} pp`,
      detail: `“${String(marginal.label).slice(0, 90)}” (${marginal.sourceLabel.toLowerCase()}) carries ${marginal.pdPct}% breach risk and `
        + `${marginal.contributionPct} pp of the book's joint probability. Renegotiating it early costs ${marginal.askCost} declared trust unit(s); `
        + 'leaving it costs more. The script is on the page.',
      action: { label: 'Open the repair queue', route: '#/solvency?panel=repair' },
      evidence: [`${marginal.pdPct}% PD`, `${marginal.contributionPct} pp of the book`],
    });
  }

  if (report.counts.unpriced > 0) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.UNPRICED,
      domain: 'Promise solvency',
      severity: 1,
      confidence: 'high',
      title: `${report.counts.unpriced} promise(s) cannot be priced`,
      detail: 'Their source, and every source in its counterparty class, has settled too few promises to measure a settlement curve, '
        + 'so they sit outside the joint probability. They are counted, not assumed safe.',
      action: { label: 'Open the method panel', route: '#/solvency?panel=method' },
      evidence: [`${report.counts.unpriced} unpriced`, `${report.counts.pricedSources}/${report.counts.sources} sources priced`],
    });
  }

  if (report.ungradedDue > 0) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.UNGRADED,
      domain: 'Promise solvency',
      severity: 2,
      confidence: 'high',
      title: `${report.ungradedDue} frozen reading(s) are due for grading`,
      detail: 'A frozen breach probability that is never graded teaches nothing about how well this leader prices their own promises.',
      action: { label: 'Open the frozen readings', route: '#/solvency?panel=frozen' },
      evidence: [`${report.ungradedDue} due`],
    });
  }

  const capped = report.book.find((p) => p.moves >= report.method.maxMoves);
  if (capped) {
    add({
      ruleId: SOLVENCY_SIGNAL_IDS.UNDELIVERABLE,
      domain: 'Promise solvency',
      severity: 3,
      confidence: 'high',
      title: 'A promise has moved to its cap',
      detail: `“${String(capped.label).slice(0, 90)}” (${capped.sourceLabel.toLowerCase()}) has been renegotiated ${capped.moves} time(s), `
        + `against a cap of ${report.method.maxMoves}. A further date is not a plan. Decide: cut the scope, hand it over, or accept the breach out loud.`,
      action: { label: 'Open the repair queue', route: '#/solvency?panel=repair' },
      evidence: [`${capped.moves} moves`, `cap ${report.method.maxMoves}`],
    });
  }

  return signals;
}

export function solvencyAttentionCount(state, now = new Date(), settings = null) {
  return solvencySignals(state, now, settings).filter((signal) => signal.severity >= 3).length;
}

/* ------------------------------------------------------------------ */
/* 6. Renegotiation lookup (used by the rules and the modals)          */
/* ------------------------------------------------------------------ */

/** The live record behind an exposure, or null when it has been deleted. */
export function findPromise(state, sourceKey, promiseId) {
  return harvestPromises(state, sourceKey).find((p) => p.id === promiseId) || null;
}

/** How many times this promise's date has been moved, from the append-only ledger. */
export function promiseMoves(state, sourceKey, promiseId) {
  return asArray(state.solvencyRenegotiations)
    .filter((row) => row.sourceKey === sourceKey && row.promiseId === promiseId).length;
}

export const SOLVENCY_INDEX = Object.freeze({
  version: SOLVENCY_ENGINE_VERSION,
  sources: PROMISE_SOURCES.length,
});
