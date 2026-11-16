/**
 * app/core/domain/sourcingSchema.js — fail-closed normalizers and the exact
 * money kernel for ADR-0229 (Capability Sourcing & Firm-Boundary Register).
 *
 * NOTHING IS REPAIRED. A case, an option, a cost line or an act that cannot be
 * read exactly is DROPPED with a counted warning. No horizon, currency, discount
 * rate, specificity, safeguard, cost or mode is invented, defaulted into
 * existence or inferred from prose. The synthetic `leader` seat is never a case
 * owner, a recorder, a decider or a grader.
 *
 * MONEY IS INTEGER ARITHMETIC, TWICE OVER.
 *  - Human input is converted from major units to whole cents exactly once, in
 *    BigInt, and a third decimal place is REFUSED rather than rounded: a third
 *    decimal place is a different amount.
 *  - A stored figure is read as an integer only. A float, a string with a comma,
 *    a negative and an out-of-range value are all refused — never coerced.
 *  - Capitalisation to present value uses a fixed-point kernel so that the same
 *    browser, a different browser and the CSV all print the same cent.
 */

import {
  SRC_COST_LINE_KEYS,
  SRC_COST_LINES,
  SRC_LIMITS as L,
  SRC_MODE_KEYS,
  SRC_MODES,
  SRC_SAFEGUARD_KEYS,
  SRC_SPECIFICITY_KEYS,
  SRC_WEIGHT_KEYS,
  srcCostLine,
  srcCostLinesForMode,
} from './sourcingRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/* --------------------------------------------------------------------- text */

export function srcText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function srcId(value) {
  const candidate = srcText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
}

/**
 * An ACTOR id, which is a seat reference rather than a record id. It may name the
 * reserved workspace apex (`leader`) — the only seat at rank 5 — so it must not go
 * through `srcId`, or every decision the apex makes would be dropped by the very
 * loader that is supposed to prove the write.
 */
export function srcActorId(value) {
  const candidate = srcText(value, L.idMax);
  return ID_RE.test(candidate) ? candidate : null;
}

/** A real calendar day, not merely a string that looks like one. */
export function srcDay(value) {
  if (typeof value !== 'string') return null;
  const day = value.trim();
  if (!DAY_RE.test(day) || day < L.dayMin || day > L.dayMax) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function srcCurrency(value) {
  const raw = srcText(value, 8).toUpperCase();
  return CURRENCY_RE.test(raw) ? raw : null;
}

export function srcInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** A closed-vocabulary member, or null. Never a default. */
export const srcOneOf = (list, value) => (list.includes(value) ? value : null);

/* -------------------------------------------------------------------- money */

/**
 * Read a STORED cents figure. Integers only: a float, a numeric string, a
 * negative or an out-of-range figure is refused rather than coerced. This is the
 * function every reader and every CSV row uses on a stored value, so a
 * hand-edited file cannot smuggle a fractional cent into a total.
 */
export function readStoredCents(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.centsMax) return null;
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/**
 * Convert HUMAN INPUT (major units, e.g. "486000" or "486000.25") to whole
 * cents. Refuses: more than two decimal places (a third place is a different
 * amount), a comma, a sign, an exponent, whitespace inside and emptiness.
 */
export function parseMoneyInputToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] || '').padEnd(2, '0');
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  if (cents > BigInt(L.centsMax)) return null;
  return Number(cents);
}

/** Exact cents as major units, without floating point. 1250 → "12.50". */
export function centsToMajorText(cents) {
  const value = readStoredCents(cents);
  if (value === null) return '';
  const abs = BigInt(value);
  const major = abs / 100n;
  const rest = String(abs % 100n).padStart(2, '0');
  return `${major.toString()}.${rest}`;
}

/** Exact cents with thousands separators, for a printed figure. */
export function centsToDisplay(cents) {
  const text = centsToMajorText(cents);
  if (!text) return '';
  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction}`;
}

export const SRC_MAX_CENTS = BigInt(L.centsMax);

/**
 * Exact sum of stored cents, in BigInt, refusing anything unreadable.
 * Returns `{ cents, refused }` — a refused row is COUNTED, never silently
 * treated as zero, because a zero would understate a total.
 */
export function srcSumCents(rows, pick = (row) => row) {
  let cents = 0n;
  let refused = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = readStoredCents(pick(row));
    if (value === null) { refused += 1; continue; }
    cents += BigInt(value);
  }
  return { cents, refused };
}

/* ---------------------------------------------- present-value fixed point */

/**
 * Capitalise a recurring annual figure over `horizonDays` at `discountBp`
 * basis points, at Actual/365 Fixed, in EXACT fixed point.
 *
 * The convention is the one a spreadsheet's XNPV uses and the one ADR-0208
 * already declared for this workspace, so two registers cannot disagree about
 * what a discounted sum means. Each year's instalment is discounted at the
 * mid-period point of the year it falls in, which is the standard annuity
 * approximation for a figure that accrues evenly rather than in one lump.
 *
 * Arithmetic: every term is computed as an integer number of 1e-12 cents
 * (SCALE) using BigInt, then the whole sum is rounded half away from zero to
 * whole cents ONCE — so the printed figure depends only on the inputs, never on
 * the order the terms were added.
 */
export const SRC_PV_SCALE = 1_000_000_000_000n; // 1e12: one trillionth of a cent
const DAYS_PER_YEAR = 365;

/**
 * (1 + rate)^(-t) in 1e12 fixed point, where t = numerator / denominator years.
 *
 * The declared convention is ANNUAL DISCOUNTING AT YEAR BOUNDARIES WITH LINEAR
 * INTERPOLATION INSIDE THE YEAR, evaluated in exact BigInt arithmetic:
 *
 *   factor(y)  = Π [ den / (den + rate) ]            y whole years, computed as a
 *                                                    single exact integer power
 *   factor(t)  = factor(⌊t⌋) − share · (factor(⌊t⌋) − factor(⌊t⌋+1))
 *
 * Every intermediate is an integer, so the factor depends only on its inputs and
 * not on the order the years were multiplied — and no engine's floating point can
 * change a printed cent.
 */
function discountFactorScaled(discountBp, numerator, denominator) {
  if (discountBp === 0) return SRC_PV_SCALE;
  const rateNum = BigInt(discountBp);
  const rateDen = 10_000n;
  // t = numerator / denominator years. Both are integers by construction.
  const wholeYears = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  const oneYear = (factor) => (factor * rateDen) / (rateDen + rateNum);
  // factor(wholeYears), exact: den^y · SCALE / (den+rate)^y
  let factorAt = (rateDen ** BigInt(wholeYears)) * SRC_PV_SCALE / ((rateDen + rateNum) ** BigInt(wholeYears));
  if (remainder === 0) return factorAt;
  const nextFactor = oneYear(factorAt);
  const share = (BigInt(remainder) * SRC_PV_SCALE) / BigInt(denominator);
  // Interpolate DOWN toward the next year boundary: t = wholeYears + remainder/denominator.
  return factorAt - ((factorAt - nextFactor) * share) / SRC_PV_SCALE;
}

/**
 * Outlay timing, and the declared convention it uses.
 *
 *  - ONE-TIME costs are assumed to land at stand-up, so their present-value
 *    factor is exactly 1. That is the conservative choice: it never flatters the
 *    option that spends later, and it never lets a build case hide half its
 *    outlay in a future year.
 *  - RECURRING costs are capitalised as an annuity over the declared horizon,
 *    each year instalment discounted at the MID-POINT of the year it accrues in
 *    — the standard treatment for a cost that lands evenly rather than in one
 *    lump. The final partial year is weighted by its share of 365 days.
 *
 * Arithmetic: every term is an exact integer number of 1e-12 cents, summed in
 * BigInt, and rounded half away from zero to whole cents ONCE at the end. So the
 * printed total is the computed total, and reordering the cost lines cannot move
 * it by a cent.
 */
export function srcPresentValueCents({ oneTimeCents = 0, recurringCents = 0, horizonDays = 0, discountBp = 0 } = {}) {
  const oneTime = readStoredCents(oneTimeCents);
  const recurring = readStoredCents(recurringCents);
  if (oneTime === null || recurring === null) return null;
  if (!Number.isInteger(horizonDays) || horizonDays < L.horizonMinDays || horizonDays > L.horizonMaxDays) return null;
  if (!Number.isInteger(discountBp) || discountBp < 0 || discountBp > 10_000) return null;

  // Exponent denominators are 2 × 365 so a mid-year point is an exact integer.
  const HALF_YEAR_DEN = BigInt(DAYS_PER_YEAR * 2);
  const wholeYears = Math.floor(horizonDays / DAYS_PER_YEAR);
  const remainderDays = horizonDays % DAYS_PER_YEAR;

  let annuityScaled = 0n;
  for (let year = 0; year < wholeYears; year += 1) {
    // Mid-point of `year`, as 2·days from today: 2·(year·365) + 365.
    const midTimes2 = year * DAYS_PER_YEAR * 2 + DAYS_PER_YEAR;
    const factor = discountFactorScaled(discountBp, midTimes2, Number(HALF_YEAR_DEN));
    annuityScaled += BigInt(recurring) * factor;
  }
  if (remainderDays > 0) {
    // The partial year, weighted by its share of 365 days, discounted at its own
    // mid-point: 2·(wholeYears·365) + remainderDays, over 730.
    const midTimes2 = wholeYears * DAYS_PER_YEAR * 2 + remainderDays;
    const factor = discountFactorScaled(discountBp, midTimes2, Number(HALF_YEAR_DEN));
    const weight = (BigInt(remainderDays) * SRC_PV_SCALE) / BigInt(DAYS_PER_YEAR);
    annuityScaled += (BigInt(recurring) * factor * weight) / SRC_PV_SCALE;
  }

  const totalScaled = BigInt(oneTime) * SRC_PV_SCALE + annuityScaled;
  // Round half away from zero, once, at the end.
  const rounded = (totalScaled + SRC_PV_SCALE / 2n) / SRC_PV_SCALE;
  if (rounded > SRC_MAX_CENTS) return null;
  return Number(rounded);
}

/* ------------------------------------------------------------ normalizers */

/**
 * A capability case: one declared boundary question. Immutable once declared —
 * a changed capability is a NEW case, so a frozen assumption can never be
 * re-described after the fact.
 */
export function normalizeSourcingCases(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.cases || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = srcId(raw.id);
    const title = srcText(raw.title, L.titleMax);
    const ownerId = srcId(raw.ownerId);
    const lineIds = Array.isArray(raw.lineIds)
      ? [...new Set(raw.lineIds.map(srcId).filter(Boolean))].sort()
      : [];
    const currency = srcCurrency(raw.currency);
    const horizonDays = srcInt(raw.horizonDays, L.horizonMinDays, L.horizonMaxDays);
    const discountBp = srcInt(raw.discountBp, 0, 10_000);
    const specificity = srcOneOf(SRC_SPECIFICITY_KEYS, raw.specificity);
    const weight = srcOneOf(SRC_WEIGHT_KEYS, raw.weight);
    const declaredOn = srcDay(raw.declaredOn);
    const reviewOn = raw.reviewOn ? srcDay(raw.reviewOn) : null;
    const withdrawnOn = raw.withdrawnOn ? srcDay(raw.withdrawnOn) : null;
    const reason = srcText(raw.reason, L.reasonMax);
    if (!id || seen.has(id) || title.length < L.titleMin || !ownerId || !currency
      || horizonDays === null || discountBp === null || !specificity || !weight
      || !declaredOn || reason.length < L.reasonMin) { dropped += 1; continue; }
    if (reviewOn && reviewOn < declaredOn) { dropped += 1; continue; }
    if (withdrawnOn && withdrawnOn < declaredOn) { dropped += 1; continue; }
    seen.add(id);
    kept.push({
      id, title, ownerId, lineIds, currency, horizonDays, discountBp,
      specificity, weight, declaredOn, reviewOn, withdrawnOn,
      reason,
    });
  }
  if (dropped) {
    warnings.push(`Capability sourcing: refused ${dropped} unreadable, duplicate, or over-cap case row(s); no currency, horizon, discount rate, specificity or owner was repaired.`);
  }
  return kept;
}

/**
 * One option: a mode, its declared safeguards and its exact cost lines.
 *
 * Refusals at this layer are structural (a line that cannot belong to the mode,
 * a duplicated line, a malformed figure). The COMPARABILITY refusals —
 * currency, horizon and discount-rate mismatch — are decided later, by the
 * reader, because they are a statement about a PAIR rather than about one row.
 */
export function normalizeSourcingOptions(value, cases, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownCases = new Set((Array.isArray(cases) ? cases : []).map((row) => row.id));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.options || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = srcId(raw.id);
    const caseId = srcId(raw.caseId);
    const mode = srcOneOf(SRC_MODE_KEYS, raw.mode);
    const recordedById = srcId(raw.recordedById);
    const recordedOn = srcDay(raw.recordedOn);
    const currency = srcCurrency(raw.currency);
    const horizonDays = srcInt(raw.horizonDays, L.horizonMinDays, L.horizonMaxDays);
    const discountBp = srcInt(raw.discountBp, 0, 10_000);
    const note = srcText(raw.note, L.textMax);
    if (!id || seen.has(id) || !caseId || !knownCases.has(caseId) || !mode
      || !recordedById || !recordedOn || !currency || horizonDays === null
      || discountBp === null || note.length < L.textMin) { dropped += 1; continue; }

    const safeguards = Array.isArray(raw.safeguards)
      ? [...new Set(raw.safeguards.filter((key) => SRC_SAFEGUARD_KEYS.includes(key)))].sort()
      : [];

    const lines = [];
    const lineKeys = new Set();
    let lineDropped = 0;
    const allowed = new Set(srcCostLinesForMode(mode).map((key) => key));
    for (const entry of Array.isArray(raw.lines) ? raw.lines : []) {
      if (!isPlainObject(entry)) { lineDropped += 1; continue; }
      const key = srcOneOf(SRC_COST_LINE_KEYS, entry.key);
      const cents = readStoredCents(entry.cents);
      if (!key || cents === null || !allowed.has(key) || lineKeys.has(key)) { lineDropped += 1; continue; }
      const line = srcCostLine(key);
      lineKeys.add(key);
      lines.push({ key, bucket: line.bucket, cents });
    }
    if (lineDropped) {
      warnings.push(`Capability sourcing: refused ${lineDropped} cost line(s) on one option — an unreadable figure, a line that does not belong to its mode, or a duplicated line. Nothing was repaired.`);
    }
    // An option with no cost at all is not a priced option. Drop it and count it.
    if (!lines.length) { dropped += 1; continue; }

    seen.add(id);
    kept.push({ id, caseId, mode, recordedById, recordedOn, currency, horizonDays, discountBp, note, safeguards, lines });
  }
  if (dropped) {
    warnings.push(`Capability sourcing: refused ${dropped} unreadable, duplicate, orphaned, over-cap or unpriced option row(s); no mode, currency or cost was repaired.`);
  }
  return kept;
}

/**
 * Acts: `decide` (the boundary decision) and `grade` (the independent review of
 * the frozen assumptions). An act pointing at a case that did not survive is an
 * orphan and is dropped, counted.
 */
export function normalizeSourcingActs(value, cases, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownCases = new Set((Array.isArray(cases) ? cases : []).map((row) => row.id));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = srcId(raw.id);
    const caseId = srcId(raw.caseId);
    // `actorId` is NOT a record id: the workspace apex acts under the reserved
    // literal `leader`, which `srcId` deliberately refuses for entity ids. Read
    // the actor with the same bounded text rule and accept the reserved name.
    const actorId = srcActorId(raw.actorId);
    const at = srcDay(raw.at);
    const kind = raw.kind === 'decide' || raw.kind === 'grade' ? raw.kind : null;
    if (!id || seen.has(id) || !caseId || !knownCases.has(caseId) || !actorId || !at || !kind) { dropped += 1; continue; }

    if (kind === 'decide') {
      const mode = srcOneOf(SRC_MODE_KEYS, raw.mode);
      const optionId = srcId(raw.optionId);
      const rationale = srcText(raw.rationale, L.reasonMax);
      if (!mode || !optionId || rationale.length < L.reasonMin) { dropped += 1; continue; }
      const safeguards = Array.isArray(raw.safeguards)
        ? [...new Set(raw.safeguards.filter((key) => SRC_SAFEGUARD_KEYS.includes(key)))].sort()
        : [];
      seen.add(id);
      kept.push({ id, caseId, actorId, at, kind, mode, optionId, rationale, safeguards });
      continue;
    }

    // grade: what the delivered cost actually turned out to be, per side, as an
    // exact cents figure on the SAME basis the case declared.
    const actualMakeCents = raw.actualMakeCents === null || raw.actualMakeCents === undefined
      ? null : readStoredCents(raw.actualMakeCents);
    const actualBuyCents = raw.actualBuyCents === null || raw.actualBuyCents === undefined
      ? null : readStoredCents(raw.actualBuyCents);
    const lesson = srcText(raw.lesson, L.reasonMax);
    if ((actualMakeCents === null && actualBuyCents === null) || lesson.length < L.reasonMin) { dropped += 1; continue; }
    if ((raw.actualMakeCents !== null && raw.actualMakeCents !== undefined && actualMakeCents === null)
      || (raw.actualBuyCents !== null && raw.actualBuyCents !== undefined && actualBuyCents === null)) { dropped += 1; continue; }
    seen.add(id);
    kept.push({ id, caseId, actorId, at, kind, actualMakeCents, actualBuyCents, lesson });
  }
  if (dropped) {
    warnings.push(`Capability sourcing acts: refused ${dropped} unreadable, duplicate, orphaned, or over-cap row(s); no decision and no grade was repaired.`);
  }
  return kept;
}

/** Identity-free markers. A marker that cannot be read exactly is dropped. */
export function normalizeSrcMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = srcText(raw.key, 200);
    const at = srcText(raw.at, 40);
    if (!key || !at || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: srcText(raw.ruleId, 40), kind: srcText(raw.kind, 40), detail: srcText(raw.detail, 300) });
  }
  if (dropped) warnings.push(`Capability sourcing markers: dropped ${dropped} unreadable or duplicate observation(s).`);
  return kept;
}

/** Bounded daily helper shared by the reader, the rule and the tests. */
export const srcAddDays = (day, n) => {
  const parsed = srcDay(day);
  if (!parsed) return null;
  const ms = Date.parse(`${parsed}T00:00:00.000Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};

export const srcDaysBetween = (from, to) => {
  const a = srcDay(from);
  const b = srcDay(to);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000);
};

/** Exported for the reader so it never re-declares the mode list. */
export const SRC_MODE_LABELS = Object.freeze(Object.fromEntries(SRC_MODES.map((row) => [row.key, row.label])));
export const SRC_COST_LINE_LABELS = Object.freeze(Object.fromEntries(SRC_COST_LINES.map((row) => [row.key, row.label])));
