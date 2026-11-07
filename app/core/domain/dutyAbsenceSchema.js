/**
 * app/core/domain/dutyAbsenceSchema.js — fail-closed normalizers for the
 * Dated Absence Plan (ADR-0122, Schema v115).
 *
 * WHAT IS STORED, AND WHAT MUST NEVER BE
 * --------------------------------------
 * An `absencePlans` row stores exactly the human act and its provenance:
 *   seatId    the seat whose absence is declared (a duty belongs to a
 *             DECLARED SEAT, not to whoever happens to sit in it today);
 *   from/to   the inclusive ISO day window the seat will not be there;
 *   reason    the words the declaring leader wrote (clamped, never summarised);
 *   decisionId the governed decision opened in the same transaction;
 *   status    active | revoked, with the revocation day and reason.
 *
 * What it never stores: a "coverage during the window" verdict, an availability
 * flag, or any copy of another module's record. Availability is a function of
 * two declared windows and is re-derived on read. A stored copy of a derived
 * figure is a number that drifts the moment either window changes.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible-looking absence: an invented absence is an invented unavailability
 * for every cover in the span.
 */

import {
  DUTY_ABSENCE_ENGINE_VERSION,
  DUTY_ABSENCE_LIMITS,
  DUTY_ABSENCE_STATUSES,
} from './dutyAbsenceRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.trim()) ? value.trim() : null;
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

function spanDays(from, to) {
  const a = new Date(`${from}T00:00:00.000Z`);
  const b = new Date(`${to}T00:00:00.000Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/**
 * Validate a window. Both ends must be ISO day keys, `from` must not be after
 * `to`, and the inclusive span must not exceed the declared maximum. A window
 * that fails is refused whole — a partially repaired window would grade the
 * wrong dates and print a confident wrong answer.
 */
export function parseAbsenceWindow(value) {
  if (!isPlainObject(value)) return null;
  const from = day(value.from);
  const to = day(value.to);
  if (!from || !to) return null;
  if (from > to) return null;
  if (spanDays(from, to) > DUTY_ABSENCE_LIMITS.maxSpanDays) return null;
  return { from, to };
}

/** Inclusive overlap of two windows (either direction). */
export function overlaps(a, b) {
  if (!a || !b) return false;
  return a.from <= b.to && b.from <= a.to;
}

/**
 * The absence ledger. Two structural corruptions are refused at load:
 * a malformed row (dropped with a warning) and a SECOND ACTIVE absence for
 * the same seat overlapping an existing one (dropped, because two overlapping
 * absences for one seat grade different dates against the same covers and the
 * register cannot honestly print both). The first well-formed row wins; the
 * rest are dropped with printed warnings, never silently merged.
 */
export function normalizeAbsencePlans(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const activeBySeat = new Map();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Absence plan: dropped a malformed absence row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const seatId = id(raw.seatId);
    const window = parseAbsenceWindow(raw);
    const reason = text(raw.reason, DUTY_ABSENCE_LIMITS.reasonChars);
    const declaredOn = day(raw.declaredOn);
    const declaredAt = stamp(raw.declaredAt);
    const status = DUTY_ABSENCE_STATUSES.includes(raw.status) ? raw.status : null;
    if (!rowId || !seatId || !window || !reason || !declaredOn || !declaredAt || !status) {
      warnings.push('Absence plan: dropped an incomplete absence row; no absence was inferred.');
      continue;
    }
    if (status === 'active') {
      const clash = activeBySeat.get(seatId);
      if (clash && overlaps(clash, window)) {
        warnings.push(`Absence plan: dropped a second active absence for one seat overlapping ${clash.from} → ${clash.to}; the register grades one window per seat at a time.`);
        continue;
      }
      activeBySeat.set(seatId, window);
    }
    if (out.length >= DUTY_ABSENCE_LIMITS.planCap) {
      warnings.push('Absence plan: ledger cap reached; additional rows were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      seatId,
      from: window.from,
      to: window.to,
      reason,
      note: text(raw.note, DUTY_ABSENCE_LIMITS.noteChars),
      decisionId: id(raw.decisionId),
      declaredBySeatId: id(raw.declaredBySeatId),
      declaredOn,
      declaredAt,
      status,
      revokedOn: day(raw.revokedOn),
      revokedAt: stamp(raw.revokedAt),
      revokeReason: text(raw.revokeReason, DUTY_ABSENCE_LIMITS.reasonChars),
      version: versionSafe(raw.version),
    });
  }
  return out;
}

function versionSafe(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : DUTY_ABSENCE_ENGINE_VERSION;
}

/** The active absence plan for one seat, or null. */
export function activeAbsenceFor(plans, seatId) {
  if (!Array.isArray(plans)) return null;
  return plans.find((row) => row && row.seatId === seatId && row.status === 'active') || null;
}
