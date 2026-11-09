/**
 * app/core/domain/structureHistorySchema.js — fail-closed normalizers for Matrix
 * Reorganisation Reconciliation & As-Of Structure Reads (ADR-0149, Schema v124).
 *
 * WHAT IS STORED
 * --------------
 * `structureHistory` — one row per OBSERVED HOME-LINE PERIOD:
 *
 *   { id, personId, managerId, fromISO, toISO, recordedOn, recordedBySeatId,
 *     source: 'moved'|'declared'|'design-evidence', reason, at }
 *
 * The row says: "from `fromISO` until `toISO` (or until further notice), this
 * person's home line was that manager." That is one human act with a valid-time
 * period, and it is the only thing this module stores.
 *
 * WHAT IS NOT STORED
 * ------------------
 *  - a span, a depth, a subtree, a headcount or a comparability verdict. Every
 *    one is derived on read from these periods plus the roster, so a printed
 *    figure cannot drift from the record that produced it.
 *  - a projection. An open period is open; the module never writes a period for
 *    a day nobody recorded, which is what makes the `unknown` verdict possible.
 *  - a corrected history. A back-dated row is a NEW row; the old one is not
 *    edited, because a period that acts were judged against is evidence even
 *    when it turns out to have been wrong.
 *
 * A malformed row is DROPPED with a printed warning, never repaired: a reporting
 * period invented at load time is a past that never happened, and it would be
 * indistinguishable from one that did.
 */

import {
  STRUCTURE_HISTORY_LIMITS,
  STRUCTURE_HISTORY_BOUNDS,
  STRUCTURE_HISTORY_DEFAULTS,
} from './structureHistoryRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value.trim()) ? value.trim() : null;
}

function stamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function clampInt(value, [min, max], fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The one declared window this module prints. Clamped, never fitted. */
export function normalizeStructureHistorySettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    structureHistoryReviewDays: clampInt(
      source.structureHistoryReviewDays,
      STRUCTURE_HISTORY_BOUNDS.reviewDays,
      STRUCTURE_HISTORY_DEFAULTS.reviewDays,
    ),
  };
}

export const STRUCTURE_HISTORY_DEFAULTS_RESOLVED = Object.freeze(normalizeStructureHistorySettings({}));

const SOURCES = new Set(['moved', 'declared', 'design-evidence']);

/**
 * One observed home-line period.
 *
 * Refused, never repaired:
 *  - a row with no person, no manager or no start day;
 *  - a row whose period ends before it starts;
 *  - a row whose RECORDING day precedes the start of the period it records, by
 *    more than nothing — a record made before the fact it records is either a
 *    planned move or a typo, and this module will not guess which. (Planned
 *    moves are a real thing, so the refusal names the reason and the operator
 *    can record it on the day it takes effect.)
 */
function normalizeRecord(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Structure history: dropped a record that was not an object. No past structure was inferred.');
    return null;
  }
  const rowId = id(raw.id);
  const personId = id(raw.personId);
  // `managerId` may legitimately be the workspace leader (`leader`), and a home
  // line ALWAYS resolves to someone: an unattached person reports to the leader.
  const managerId = id(raw.managerId);
  const fromISO = day(raw.fromISO);
  if (!rowId || !personId || !managerId || !fromISO) {
    warnings.push('Structure history: dropped a home-line record missing its person, manager, start day or id. No structure was invented for those days.');
    return null;
  }
  const toISO = day(raw.toISO);
  if (toISO && toISO < fromISO) {
    warnings.push('Structure history: dropped a home-line record whose period ends before it starts. A period that runs backwards describes no day at all.');
    return null;
  }
  const recordedOn = day(raw.recordedOn);
  if (recordedOn && recordedOn < fromISO) {
    warnings.push('Structure history: dropped a home-line record recorded before the period it describes began. A planned move must be recorded on the day it takes effect, so a record cannot silently pre-date its own fact.');
    return null;
  }
  const source = SOURCES.has(raw.source) ? raw.source : 'moved';
  return {
    id: rowId,
    personId,
    managerId,
    fromISO,
    // An OPEN period is null, never a far-future sentinel: a sentinel is a claim
    // about a day nobody has lived through.
    toISO,
    recordedOn,
    recordedBySeatId: id(raw.recordedBySeatId),
    source,
    reason: text(raw.reason, STRUCTURE_HISTORY_LIMITS.reasonChars),
    at: stamp(raw.at) || (recordedOn ? `${recordedOn}T00:00:00.000Z` : `${fromISO}T00:00:00.000Z`),
  };
}

/**
 * Bounded, deduplicated and deterministically ordered.
 *
 * Two records are duplicates only when they describe the SAME period for the
 * same person and manager. A genuine move away and back again is two periods and
 * is preserved: that history is the whole point.
 */
export function normalizeStructureHistory(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Structure history: the home-line ledger was not an array; it was read as empty.');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const row = normalizeRecord(raw, warnings);
    if (!row) continue;
    const key = `${row.personId}|${row.managerId}|${row.fromISO}|${row.toISO || 'open'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  if (value.length && !out.length) {
    warnings.push('Structure history: this workspace carried home-line records that could not be read; they were dropped rather than repaired.');
  }
  out.sort((a, b) => String(a.fromISO).localeCompare(String(b.fromISO))
    || String(a.personId).localeCompare(String(b.personId))
    || String(a.managerId).localeCompare(String(b.managerId)));
  return out.slice(-STRUCTURE_HISTORY_LIMITS.records);
}

/**
 * The rule's idempotency markers — shared, bounded, oldest first, with the
 * displacement printed by the caller that causes it.
 */
export function normalizeStructureHistoryMarkers(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const key = id(raw.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: text(raw.kind, 40) || 'reconciliation',
      summary: text(raw.summary, 280),
      at: stamp(raw.at) || null,
    });
  }
  return out.slice(-STRUCTURE_HISTORY_LIMITS.markers);
}
