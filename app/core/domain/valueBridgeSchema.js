/**
 * app/core/domain/valueBridgeSchema.js — parsing and fail-closed loading for the
 * Enterprise Value Bridge (ADR-0214, Session 287, Schema v168).
 *
 * THE RULE THIS FILE OBEYS. A stored row is read as the numbers it stores, never
 * as text that is parsed again. This is not pedantry: a register that routes a
 * stored `cents` field back through a major-unit parser multiplies every figure
 * by a hundred the first time a workspace reloads, and the corrupted value looks
 * perfectly plausible on the screen. Every field below is checked with
 * `Number.isSafeInteger` against its declared bound; anything else is a row this
 * register will not carry, and it is COUNTED and reported rather than repaired.
 *
 * TYPED INPUT is a different job. `parseValueBridgeMoney` refuses a figure with
 * more decimals than cents can hold instead of rounding it, because rounding a
 * signed figure is inventing a number the signatory did not type.
 *
 * A perimeter claim that cannot be honoured is the one case where a row is kept
 * and its claim is downgraded: a reading that says REPORTED but carries no
 * integer adjustment loads as UNSEPARATED with a warning. The reading's levels
 * are still true; only its perimeter claim is unusable, and an unusable claim
 * must not become a zero adjustment.
 *
 * Pure module: no DOM, no storage, no clock.
 */

import {
  VALUE_BRIDGE_BOUNDS,
  VALUE_BRIDGE_DEFAULTS,
  VALUE_BRIDGE_ENGINE_VERSION,
  VALUE_BRIDGE_LIMITS,
  VALUE_BRIDGE_PERIMETER_KEYS,
  VALUE_BRIDGE_SETTING_KEYS,
} from './valueBridgeRegistry.js';
import { BRIDGE_LEG_KEYS } from './valueBridgeMath.js';

const L = VALUE_BRIDGE_LIMITS;
const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,16})?$/;

/** Three-letter currency code, upper case. Nothing is ever converted. */
export function vbCurrency(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

function realDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  if (value < L.dayMin || value > L.dayMax) return null;
  return value;
}

/** A real calendar day inside the register's window. */
export function vbDay(value) {
  return realDay(typeof value === 'string' ? value : null);
}

/** Days between two day keys, or null. */
export function vbDaysBetween(from, to) {
  if (!realDay(from) || !realDay(to)) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function decimalToScaled(raw, digits) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!text || !DECIMAL.test(text) || text.includes('e') || text.includes('E')) return null;
  const dot = text.indexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? '' : text.slice(dot + 1);
  if (fraction.length > digits) return null;
  const scaled = BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction || '').padEnd(digits, '0') || '0');
  return scaled;
}

/** A typed amount in whole cents; more decimals than cents hold is refused, never rounded. */
export function parseValueBridgeMoney(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') return null;
  // A comma is refused outright: in half of Europe it is the decimal separator,
  // and "1,500" is as likely to mean one-and-a-half as fifteen hundred.
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (!body || !DECIMAL.test(body)) return null;
  const scaled = decimalToScaled(body, 2);
  if (scaled === null) return null;
  const cents = negative ? -scaled : scaled;
  if (cents > BigInt(L.maxCents) || cents < BigInt(-L.maxCents)) return null;
  return Number(cents);
}

/** A typed multiple (a turn, e.g. 8.5) in ten-thousandths; zero, negative and over 100× are refused. */
export function parseValueBridgeMultiple(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().replace(/[,\s]/g, '').replace(/[×x]$/i, '');
  if (!trimmed || !DECIMAL.test(trimmed)) return null;
  const scaled = decimalToScaled(trimmed, 4);
  if (scaled === null || scaled <= 0n) return null;
  if (scaled > BigInt(L.maxMultipleE4)) return null;
  return Number(scaled);
}

/** At least `reasonMin` characters after collapsing whitespace, or null. */
export function vbReason(value, max = L.reasonMax) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < L.reasonMin) return null;
  return text.slice(0, max);
}

export function vbPersonId(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > L.personIdMax) return null;
  return text;
}

/* ---------------------------------------------------------------- settings */

/** A declared convention outside its bounds falls back to the default, never to zero. */
export function normalizeValueBridgeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = VALUE_BRIDGE_SETTING_KEYS.staleDays;
  const [min, max] = VALUE_BRIDGE_BOUNDS.staleDays;
  const candidate = Number(source[key]);
  const staleDays = Number.isInteger(candidate) && candidate >= min && candidate <= max
    ? candidate
    : VALUE_BRIDGE_DEFAULTS.staleDays;
  return { [key]: staleDays };
}

/* ----------------------------------------------------------------- readings */

const LIFECYCLE = (value) => (value === undefined ? null : value);

function optionalDay(value) {
  if (value === null || value === undefined) return null;
  return realDay(value);
}

function optionalCents(value) {
  if (value === null || value === undefined) return null;
  return Number.isSafeInteger(value) && Math.abs(value) <= L.maxCents ? value : null;
}

/**
 * Load stored readings. A row that cannot be read exactly is dropped and the
 * count is reported; a row whose perimeter claim cannot be honoured is kept and
 * downgraded to UNSEPARATED with a warning, because its levels are still true.
 */
export function normalizeValueBridgeReadings(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  let dropped = 0;
  let downgraded = 0;
  for (const row of list) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { dropped += 1; continue; }
    const id = typeof row.id === 'string' && row.id ? row.id : null;
    const day = realDay(row.day);
    const currency = vbCurrency(row.currency);
    const ebitdaCents = Number.isSafeInteger(row.ebitdaCents) && Math.abs(row.ebitdaCents) <= L.maxCents ? row.ebitdaCents : null;
    const multipleE4 = Number.isSafeInteger(row.multipleE4) && row.multipleE4 > 0 && row.multipleE4 <= L.maxMultipleE4 ? row.multipleE4 : null;
    const netDebtCents = Number.isSafeInteger(row.netDebtCents) && Math.abs(row.netDebtCents) <= L.maxCents ? row.netDebtCents : null;
    const declaredPerimeter = VALUE_BRIDGE_PERIMETER_KEYS.includes(row.perimeter) ? row.perimeter : null;
    const adjustment = optionalCents(row.perimeterAdjCents);
    const recordedAt = typeof row.recordedAt === 'string' && !Number.isNaN(Date.parse(row.recordedAt)) ? row.recordedAt : null;
    const recordedOn = realDay(row.recordedOn);
    const recordedById = typeof row.recordedById === 'string' && row.recordedById ? row.recordedById : null;
    const basis = typeof row.basis === 'string' ? row.basis.slice(0, L.basisMax) : '';
    if (!id || !day || !currency || ebitdaCents === null || multipleE4 === null || netDebtCents === null
      || !declaredPerimeter || !recordedAt || !recordedOn || !recordedById || basis.trim().length < L.reasonMin) {
      dropped += 1;
      continue;
    }

    let perimeter = declaredPerimeter;
    let perimeterAdjCents = 0;
    if (declaredPerimeter === 'organic') {
      if (adjustment !== null && adjustment !== 0) {
        // An "organic" reading that stores an adjustment contradicts itself.
        perimeter = 'unseparated';
        downgraded += 1;
        warnings.push(`Reading ${id} declares an organic perimeter but stores a non-zero adjustment. It is loaded as UNSEPARATED: its levels are still true and no adjustment is invented to rescue the claim.`);
      } else {
        perimeterAdjCents = 0;
      }
    } else if (declaredPerimeter === 'reported') {
      if (adjustment === null) {
        perimeter = 'unseparated';
        downgraded += 1;
        warnings.push(`Reading ${id} declares a reported perimeter with no integer adjustment. It is loaded as UNSEPARATED: an absent adjustment is not a zero adjustment.`);
      } else {
        perimeterAdjCents = adjustment;
      }
    } else {
      perimeter = 'unseparated';
    }

    const withdrawnOn = optionalDay(row.withdrawnOn);
    const supersededOn = optionalDay(row.supersededOn);
    const record = {
      id, day, currency, ebitdaCents, multipleE4, netDebtCents,
      perimeter, perimeterAdjCents,
      basis,
      recordedOn,
      recordedAt,
      recordedById,
      supersedesId: typeof row.supersedesId === 'string' && row.supersedesId ? row.supersedesId : null,
      supersededOn: LIFECYCLE(supersededOn),
      supersededById: typeof row.supersededById === 'string' && row.supersededById ? row.supersededById : null,
      withdrawnOn: LIFECYCLE(withdrawnOn),
      withdrawnById: typeof row.withdrawnById === 'string' && row.withdrawnById ? row.withdrawnById : null,
      withdrawReason: typeof row.withdrawReason === 'string' && row.withdrawReason ? row.withdrawReason.slice(0, L.reasonMax) : null,
      engineVersion: typeof row.engineVersion === 'string' && row.engineVersion ? row.engineVersion : VALUE_BRIDGE_ENGINE_VERSION,
    };
    // The stored row IS the loaded row: nothing derived is added and nothing is re-scaled.
    kept.push(record);
  }
  if (dropped) warnings.push(`${dropped} valuation reading(s) could not be read exactly and were not loaded. They are counted, never repaired.`);
  if (downgraded && !dropped) warnings.push(`${downgraded} reading(s) had an unusable perimeter claim and were loaded as UNSEPARATED.`);
  return kept;
}

/* ------------------------------------------------------------------- claims */

/**
 * Load stored lever claims. A claim that names no leg, no person, no real period
 * or no integer promise is dropped and counted.
 */
export function normalizeValueBridgeLeverClaims(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  let dropped = 0;
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { dropped += 1; continue; }
    const id = typeof row.id === 'string' && row.id ? row.id : null;
    const leg = BRIDGE_LEG_KEYS.includes(row.leg) ? row.leg : null;
    const personId = vbPersonId(row.personId);
    const fromDay = realDay(row.fromDay);
    const toDay = realDay(row.toDay);
    const promisedCents = Number.isSafeInteger(row.promisedCents) && Math.abs(row.promisedCents) <= L.maxCents ? row.promisedCents : null;
    const basis = typeof row.basis === 'string' ? row.basis.slice(0, L.basisMax) : '';
    const declaredOn = realDay(row.declaredOn);
    const declaredAt = typeof row.declaredAt === 'string' && !Number.isNaN(Date.parse(row.declaredAt)) ? row.declaredAt : null;
    const declaredById = typeof row.declaredById === 'string' && row.declaredById ? row.declaredById : null;
    const span = fromDay && toDay ? vbDaysBetween(fromDay, toDay) : null;
    if (!id || !leg || !personId || !fromDay || !toDay || span === null || span < 0 || span > L.claimedPeriodMaxDays
      || promisedCents === null || basis.trim().length < L.reasonMin || !declaredOn || !declaredAt || !declaredById) {
      dropped += 1;
      continue;
    }
    const withdrawnOn = optionalDay(row.withdrawnOn);
    const record = {
      id, leg, personId, fromDay, toDay, promisedCents, basis,
      declaredOn, declaredAt, declaredById,
      withdrawnOn: LIFECYCLE(withdrawnOn),
      withdrawnById: typeof row.withdrawnById === 'string' && row.withdrawnById ? row.withdrawnById : null,
      withdrawReason: typeof row.withdrawReason === 'string' && row.withdrawReason ? row.withdrawReason.slice(0, L.reasonMax) : null,
      engineVersion: typeof row.engineVersion === 'string' && row.engineVersion ? row.engineVersion : VALUE_BRIDGE_ENGINE_VERSION,
    };
    const fingerprint = `${record.leg}|${record.personId}|${record.fromDay}|${record.toDay}`;
    if (record.withdrawnOn === null && seen.has(fingerprint)) {
      // Two live claims by one person for the same leg and period is a duplicate,
      // not a second owner: it would print the same person twice as contested.
      dropped += 1;
      continue;
    }
    if (record.withdrawnOn === null) seen.add(fingerprint);
    kept.push(record);
  }
  if (dropped) warnings.push(`${dropped} lever claim(s) could not be read exactly and were not loaded. They are counted, never repaired.`);
  return kept;
}

/** A claim is LIVE when it has not been withdrawn. */
export const claimIsLive = (claim) => Boolean(claim) && claim.withdrawnOn === null;
/** A reading is LIVE when it has not been withdrawn and not been superseded. */
export const readingIsLive = (reading) => Boolean(reading) && reading.withdrawnOn === null && reading.supersededOn === null;
