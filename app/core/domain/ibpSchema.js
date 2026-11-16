/**
 * app/core/domain/ibpSchema.js — fail-closed normalizers and the exact integer
 * kernel for ADR-0231 (Integrated Business Plan / S&OP Cycle Register).
 *
 * NOTHING IS REPAIRED. A cycle, a demand row, a capacity row, an option, a
 * decision or a grade that cannot be read exactly is DROPPED with a counted
 * warning. No plan unit, capacity figure, month index, currency, cost or
 * residual is invented, defaulted into existence or inferred from prose.
 *
 * INTEGER ARITHMETIC, TWICE OVER.
 *  - Human input in major units is converted to whole cents exactly once, in
 *    BigInt, and a third decimal place is REFUSED rather than rounded — a third
 *    decimal place is a different amount.
 *  - Plan units are whole units. A fractional unit is refused, never rounded:
 *    a rounded plan is a different plan, and the residual computed from it is a
 *    different residual.
 *  - A STORED figure is read as an integer only. A float, a string, a negative
 *    or an out-of-range value is refused — never coerced.
 *
 * THE KEYED ROWS ARE SINGLETONS. One demand row, one capacity row and one grade
 * per (cycle, month); one decision per cycle; one option per (cycle, lever).
 * A duplicate is dropped on load, so a hand-edited file cannot count the same
 * month twice and thereby manufacture a gap that closes.
 */

import {
  IBP_CAPACITY_KIND_KEYS,
  IBP_LIMITS as L,
  IBP_OPTION_KINDS,
  IBP_OPTION_KIND_KEYS,
  IBP_STEP_KEYS,
  ibpOptionKind,
} from './ibpRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/* --------------------------------------------------------------------- text */

export function ibpText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A record id. The reserved apex name is never a record id. */
export function ibpId(value) {
  const candidate = ibpText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
}

/**
 * An ACTOR id, which is a seat reference rather than a record id. It may name
 * the reserved workspace apex (`leader`) — otherwise every act the apex
 * performs would be dropped by the very loader meant to prove the write.
 */
export function ibpActorId(value) {
  const candidate = ibpText(value, L.idMax);
  return ID_RE.test(candidate) ? candidate : null;
}

/** A real calendar day, not merely a string that looks like one. */
export function ibpDay(value) {
  if (typeof value !== 'string') return null;
  const day = value.trim();
  if (!DAY_RE.test(day) || day < L.dayMin || day > L.dayMax) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function ibpCurrency(value) {
  const raw = ibpText(value, 8).toUpperCase();
  return CURRENCY_RE.test(raw) ? raw : null;
}

/** A bounded integer, or null. Never a default. */
export function ibpInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * A STORED plan-quantity figure. Whole units only: a float, a numeric string, a
 * value beyond the declared ceiling or anything that is not a safe integer is
 * refused rather than coerced. Signed is allowed here because a GAP is signed;
 * the sign convention is the reader's, not this function's.
 */
export function readPlanUnits(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < -L.unitsMax || value > L.unitsMax) return null;
  return value;
}

/** A STORED non-negative plan quantity. */
export function readNonNegUnits(value) {
  const units = readPlanUnits(value);
  return units === null || units < 0 ? null : units;
}

/**
 * Parse HUMAN INPUT plan units. Digits only — no comma, sign, exponent, decimal
 * point or surrounding whitespace inside the figure.
 */
export function parsePlanUnitsInput(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const units = Number(raw);
  if (!Number.isSafeInteger(units) || units > L.unitsMax) return null;
  return units;
}

/* -------------------------------------------------------------------- money */

/** Read a STORED cents figure. Integers only; a negative is refused. */
export function readCents(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0 || value > L.centsMax) return null;
  return value;
}

/**
 * Convert HUMAN INPUT (major units) to whole cents. Refuses more than two
 * decimal places, a comma, a sign, an exponent, inner whitespace and emptiness.
 */
export function parseMoneyInputToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  if (cents > BigInt(L.centsMax)) return null;
  return Number(cents);
}

/** Exact cents as major units without floating point. 1250 → "12.50". */
export function centsToMajorText(cents) {
  const value = readCents(cents);
  if (value === null) return '';
  const major = BigInt(value) / 100n;
  const rest = String(BigInt(value) % 100n).padStart(2, '0');
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

/* ---------------------------------------------------------------- date math */

/** Add whole days to a real calendar day, staying in UTC. */
export function ibpAddDays(day, days) {
  const base = ibpDay(day);
  if (!base || !Number.isInteger(days)) return null;
  const stamp = new Date(`${base}T00:00:00.000Z`);
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

/** Inclusive day count between two real days. */
export function ibpDaysBetween(fromDay, toDay) {
  const a = ibpDay(fromDay);
  const b = ibpDay(toDay);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000);
}

/* ------------------------------------------------------------- normalizers */

function dropWith(warnings, kind, index, reason) {
  warnings.push({ kind, index, reason });
  return null;
}

/**
 * Cycles. The terms are frozen at declaration: the currency, the horizon and
 * the two lines that carry demand and supply. No line is inferred from the
 * owner's position, and a cycle whose demand and supply lines are the same line
 * is accepted (a single-line business is not an error) but the reader prints it.
 */
export function normalizeIbpCycles(value, warnings = []) {
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'cycle', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    if (!id) { dropWith(warnings, 'cycle', index, 'no usable id'); continue; }
    if (seen.has(id)) { dropWith(warnings, 'cycle', index, 'duplicate id'); continue; }
    const title = ibpText(entry.title, L.titleMax);
    if (title.length < L.titleMin) { dropWith(warnings, 'cycle', index, 'title too short'); continue; }
    const currency = ibpCurrency(entry.currency);
    if (!currency) { dropWith(warnings, 'cycle', index, 'currency not a three-letter code'); continue; }
    const horizonMonths = ibpInt(entry.horizonMonths, L.horizonMin, L.horizonMax);
    if (horizonMonths === null) { dropWith(warnings, 'cycle', index, 'horizon outside 1–36 months'); continue; }
    const ownerId = ibpId(entry.ownerId);
    if (!ownerId) { dropWith(warnings, 'cycle', index, 'owner is not a roster id'); continue; }
    const demandLineId = ibpId(entry.demandLineId);
    const supplyLineId = ibpId(entry.supplyLineId);
    if (!demandLineId || !supplyLineId) { dropWith(warnings, 'cycle', index, 'demand or supply line missing'); continue; }
    const declaredOn = ibpDay(entry.declaredOn);
    if (!declaredOn) { dropWith(warnings, 'cycle', index, 'declaration day is not a real day'); continue; }
    const reviewOn = ibpDay(entry.reviewOn);
    if (!reviewOn) { dropWith(warnings, 'cycle', index, 'review day is not a real day'); continue; }
    const basis = ibpText(entry.basis, L.reasonMax);
    if (basis.length < L.reasonMin) { dropWith(warnings, 'cycle', index, 'written basis too short'); continue; }
    const withdrawnOn = entry.withdrawnOn === null || entry.withdrawnOn === undefined ? null : ibpDay(entry.withdrawnOn);
    if (entry.withdrawnOn !== null && entry.withdrawnOn !== undefined && !withdrawnOn) {
      dropWith(warnings, 'cycle', index, 'withdrawal day is not a real day');
      continue;
    }
    seen.add(id);
    out.push({
      id, title, currency, horizonMonths, ownerId, demandLineId, supplyLineId,
      declaredOn, reviewOn, withdrawnOn, basis,
    });
    if (out.length >= L.cycles) break;
  }
  return out;
}

/** Resolve a cycle id against the loaded cycles. */
const cycleIndex = (cycles) => new Map((Array.isArray(cycles) ? cycles : []).map((row) => [row.id, row]));

/**
 * Demand rows: one per (cycle, month). The baseline, the commercial target and
 * the consensus are three DIFFERENT figures and are stored apart, because the
 * whole point of the register is that a consensus which is the target in
 * disguise can be printed rather than believed.
 */
export function normalizeIbpDemandRows(value, cycles, warnings = []) {
  const known = cycleIndex(cycles);
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'demand', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    const cycleId = ibpId(entry.cycleId);
    const cycle = known.get(cycleId);
    if (!id) { dropWith(warnings, 'demand', index, 'no usable id'); continue; }
    if (!cycle) { dropWith(warnings, 'demand', index, 'cycle unknown or unreadable'); continue; }
    const monthIndex = ibpInt(entry.monthIndex, L.monthMin, cycle.horizonMonths);
    if (monthIndex === null) { dropWith(warnings, 'demand', index, 'month outside the cycle horizon'); continue; }
    const key = `${cycleId}|${monthIndex}`;
    if (seen.has(key)) { dropWith(warnings, 'demand', index, 'second demand row for the same cycle-month'); continue; }
    const baselineUnits = readNonNegUnits(entry.baselineUnits);
    const targetUnits = readNonNegUnits(entry.targetUnits);
    const consensusUnits = readNonNegUnits(entry.consensusUnits);
    if (baselineUnits === null || targetUnits === null || consensusUnits === null) {
      dropWith(warnings, 'demand', index, 'a plan quantity is not a whole non-negative unit count');
      continue;
    }
    const recordedBy = ibpActorId(entry.recordedBy);
    const recordedOn = ibpDay(entry.recordedOn);
    if (!recordedBy || !recordedOn) { dropWith(warnings, 'demand', index, 'recorder or day missing'); continue; }
    seen.add(key);
    out.push({
      id, cycleId, monthIndex, baselineUnits, targetUnits, consensusUnits,
      recordedBy, recordedOn,
      note: ibpText(entry.note, L.textMax),
    });
    if (out.length >= L.demandRows) break;
  }
  return out;
}

/**
 * Capacity rows: one per (cycle, month). `kind` decides whether the figure is
 * EVIDENCE. A `demonstrated` row must name a window of at least 28 days; a
 * shorter window is an impression and the row is dropped rather than carried as
 * though it had been observed.
 */
export function normalizeIbpCapacityRows(value, cycles, warnings = []) {
  const known = cycleIndex(cycles);
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'capacity', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    const cycleId = ibpId(entry.cycleId);
    const cycle = known.get(cycleId);
    if (!id) { dropWith(warnings, 'capacity', index, 'no usable id'); continue; }
    if (!cycle) { dropWith(warnings, 'capacity', index, 'cycle unknown or unreadable'); continue; }
    const monthIndex = ibpInt(entry.monthIndex, L.monthMin, cycle.horizonMonths);
    if (monthIndex === null) { dropWith(warnings, 'capacity', index, 'month outside the cycle horizon'); continue; }
    const key = `${cycleId}|${monthIndex}`;
    if (seen.has(key)) { dropWith(warnings, 'capacity', index, 'second capacity row for the same cycle-month'); continue; }
    const kind = IBP_CAPACITY_KIND_KEYS.includes(entry.kind) ? entry.kind : null;
    if (!kind) { dropWith(warnings, 'capacity', index, 'capacity kind is not declared'); continue; }
    const units = readNonNegUnits(entry.units);
    if (units === null) { dropWith(warnings, 'capacity', index, 'capacity is not a whole non-negative unit count'); continue; }
    const windowStartDay = entry.windowStartDay === null || entry.windowStartDay === undefined ? null : ibpDay(entry.windowStartDay);
    const windowEndDay = entry.windowEndDay === null || entry.windowEndDay === undefined ? null : ibpDay(entry.windowEndDay);
    if ((entry.windowStartDay !== null && entry.windowStartDay !== undefined && !windowStartDay)
      || (entry.windowEndDay !== null && entry.windowEndDay !== undefined && !windowEndDay)) {
      dropWith(warnings, 'capacity', index, 'observation window is not a real day range');
      continue;
    }
    if (kind === 'demonstrated') {
      const span = windowStartDay && windowEndDay ? ibpDaysBetween(windowStartDay, windowEndDay) : null;
      if (span === null || span < L.demonstratedWindowMinDays - 1) {
        dropWith(warnings, 'capacity', index, 'a demonstrated claim needs a declared window of at least 28 days');
        continue;
      }
    }
    const recordedBy = ibpActorId(entry.recordedBy);
    const recordedOn = ibpDay(entry.recordedOn);
    if (!recordedBy || !recordedOn) { dropWith(warnings, 'capacity', index, 'recorder or day missing'); continue; }
    seen.add(key);
    out.push({
      id, cycleId, monthIndex, kind, units, windowStartDay, windowEndDay,
      recordedBy, recordedOn,
      note: ibpText(entry.note, L.textMax),
    });
    if (out.length >= L.capacityRows) break;
  }
  return out;
}

/**
 * Options (the pre-S&OP levers). One per (cycle, lever) — a second row for the
 * same lever would count its cost and its effect twice. Each carries a whole
 * plan-unit effect and an exact whole-cent cost; a lever with neither is a note,
 * and notes are refused at the door because they have no price.
 */
export function normalizeIbpOptions(value, cycles, warnings = []) {
  const known = cycleIndex(cycles);
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'option', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    const cycleId = ibpId(entry.cycleId);
    const cycle = known.get(cycleId);
    if (!id) { dropWith(warnings, 'option', index, 'no usable id'); continue; }
    if (!cycle) { dropWith(warnings, 'option', index, 'cycle unknown or unreadable'); continue; }
    const kind = IBP_OPTION_KIND_KEYS.includes(entry.kind) ? entry.kind : null;
    if (!kind) { dropWith(warnings, 'option', index, 'option lever is not declared'); continue; }
    const monthIndex = ibpInt(entry.monthIndex, L.monthMin, cycle.horizonMonths);
    if (monthIndex === null) { dropWith(warnings, 'option', index, 'month outside the cycle horizon'); continue; }
    const key = `${cycleId}|${kind}|${monthIndex}`;
    if (seen.has(key)) { dropWith(warnings, 'option', index, 'second row for the same lever and month'); continue; }
    const units = readNonNegUnits(entry.units);
    if (units === null || units === 0) { dropWith(warnings, 'option', index, 'option effect is not a positive whole unit count'); continue; }
    const cents = readCents(entry.cents);
    if (cents === null) { dropWith(warnings, 'option', index, 'option cost is not a whole non-negative cent figure'); continue; }
    const framedBy = ibpActorId(entry.framedBy);
    const framedOn = ibpDay(entry.framedOn);
    if (!framedBy || !framedOn) { dropWith(warnings, 'option', index, 'framer or day missing'); continue; }
    const note = ibpText(entry.note, L.textMax);
    if (note.length < L.textMin) { dropWith(warnings, 'option', index, 'note too short to be a trade-off'); continue; }
    seen.add(key);
    out.push({
      id, cycleId, monthIndex, kind,
      side: ibpOptionKind(kind).moves,
      units, cents, framedBy, framedOn, note,
    });
    if (out.length >= L.options) break;
  }
  return out;
}

/**
 * Executive decisions: one per cycle, and never by the seat that framed the
 * options. The approver states the residual they are accepting; the reader
 * compares that figure with the one the record computes and prints any
 * difference rather than reconciling it.
 */
export function normalizeIbpDecisions(value, cycles, warnings = []) {
  const known = cycleIndex(cycles);
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'decision', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    const cycleId = ibpId(entry.cycleId);
    if (!id) { dropWith(warnings, 'decision', index, 'no usable id'); continue; }
    if (!known.has(cycleId)) { dropWith(warnings, 'decision', index, 'cycle unknown or unreadable'); continue; }
    if (seen.has(cycleId)) { dropWith(warnings, 'decision', index, 'second decision for the same cycle'); continue; }
    const actorId = ibpActorId(entry.actorId);
    const decidedOn = ibpDay(entry.decidedOn);
    if (!actorId || !decidedOn) { dropWith(warnings, 'decision', index, 'approver or day missing'); continue; }
    const acknowledgedResidualUnits = readNonNegUnits(entry.acknowledgedResidualUnits);
    if (acknowledgedResidualUnits === null) {
      dropWith(warnings, 'decision', index, 'acknowledged residual is not a whole non-negative unit count');
      continue;
    }
    const reason = ibpText(entry.reason, L.reasonMax);
    if (reason.length < L.reasonMin) { dropWith(warnings, 'decision', index, 'written reason too short'); continue; }
    const serviceNote = ibpText(entry.serviceNote, L.textMax);
    if (serviceNote.length < L.textMin) { dropWith(warnings, 'decision', index, 'service priority note too short'); continue; }
    seen.add(cycleId);
    out.push({
      id, cycleId, actorId, decidedOn, acknowledgedResidualUnits,
      servedFirst: ibpText(entry.servedFirst, L.textMax) || 'not stated',
      reason, serviceNote,
    });
    if (out.length >= L.decisions) break;
  }
  return out;
}

/**
 * Forecast grades: one per (cycle, month). The actual sold quantity is recorded
 * against the consensus that was frozen, so bias and error are computed from two
 * numbers that were both written down before the outcome was known.
 */
export function normalizeIbpGrades(value, cycles, warnings = []) {
  const known = cycleIndex(cycles);
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'grade', index, 'not an object'); continue; }
    const id = ibpId(entry.id);
    const cycleId = ibpId(entry.cycleId);
    const cycle = known.get(cycleId);
    if (!id) { dropWith(warnings, 'grade', index, 'no usable id'); continue; }
    if (!cycle) { dropWith(warnings, 'grade', index, 'cycle unknown or unreadable'); continue; }
    const monthIndex = ibpInt(entry.monthIndex, L.monthMin, cycle.horizonMonths);
    if (monthIndex === null) { dropWith(warnings, 'grade', index, 'month outside the cycle horizon'); continue; }
    const key = `${cycleId}|${monthIndex}`;
    if (seen.has(key)) { dropWith(warnings, 'grade', index, 'second grade for the same cycle-month'); continue; }
    const actualUnits = readNonNegUnits(entry.actualUnits);
    if (actualUnits === null) { dropWith(warnings, 'grade', index, 'actual is not a whole non-negative unit count'); continue; }
    const gradedBy = ibpActorId(entry.gradedBy);
    const gradedOn = ibpDay(entry.gradedOn);
    if (!gradedBy || !gradedOn) { dropWith(warnings, 'grade', index, 'grader or day missing'); continue; }
    seen.add(key);
    out.push({
      id, cycleId, monthIndex, actualUnits, gradedBy, gradedOn,
      note: ibpText(entry.note, L.textMax),
    });
    if (out.length >= L.grades) break;
  }
  return out;
}

/** Identity-free rule observations. */
export function normalizeIbpMarkers(value, warnings = []) {
  const out = [];
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    if (!isPlainObject(entry)) { dropWith(warnings, 'marker', index, 'not an object'); continue; }
    const key = ibpText(entry.key, 240);
    if (!key) { dropWith(warnings, 'marker', index, 'no key'); continue; }
    out.push({
      key,
      at: ibpText(entry.at, 40),
      ruleId: ibpText(entry.ruleId, 40) || '',
      kind: ibpText(entry.kind, 60) || '',
      detail: ibpText(entry.detail, 300),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* ------------------------------------------------------------- presenting */

export const IBP_STEP_LABELS = Object.freeze(Object.fromEntries(
  IBP_STEP_KEYS.map((key) => [key, key]),
));
export const IBP_OPTION_LABELS = Object.freeze(Object.fromEntries(
  IBP_OPTION_KINDS.map((row) => [row.key, row.label]),
));

/** Whole plan units with thousands separators; never a currency symbol. */
export function unitsToDisplay(units) {
  const value = readPlanUnits(units);
  if (value === null) return '';
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
