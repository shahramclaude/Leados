/**
 * app/core/domain/matrixSchema.js — fail-closed normalizers for the Matrix
 * Accountability Ledger (ADR-0140, Schema v119).
 *
 * WHAT IS STORED
 * --------------
 * A `reportingLines` row stores exactly one human act: "this person is also
 * accountable to that manager, on this kind of line, for this share of their
 * capacity, holding these decision rights, from this day until that day."
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a total, a roll-up or an attributed headcount (re-derived on read from the
 *    lines and the roster, so they cannot drift from what they report),
 *  - a share for the PRIMARY line unless a human declares one (the home line is
 *    `person.managerId`; the workspace has never asked what fraction it owns,
 *    and a back-filled 100% would be a number nobody agreed to),
 *  - a rating of either party, or a copy of another module's record.
 *
 * A malformed row is DROPPED with a printed warning, never repaired: a
 * reporting line invented at load time is an accountability somebody did not
 * accept.
 *
 * ALLOCATIONS ARE INTEGERS. A share is declared as 0–100 (hundredths of a
 * person) and stored as that integer. Every sum in the engine is therefore an
 * integer sum that can be reconciled exactly, instead of a floating-point total
 * that rounds into looking correct.
 */

import {
  MATRIX_BOUNDS,
  MATRIX_DEFAULTS,
  MATRIX_LIMITS,
  MATRIX_LINE_KIND_KEYS,
  MATRIX_RIGHT_KEYS,
} from './matrixRegistry.js';

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

function clampInt(value, bounds, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

/**
 * A declared allocation: whole hundredths of a person, 0–100, or `null` when
 * the declaring leader left it blank. Null is honest; zero is a claim.
 */
export function normalizeShareH(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Accept both 0–1 and 0–100: a leader typing "0.4" and one typing "40" mean
  // the same thing, and refusing one of them would be pedantry, not rigour.
  const hundredths = n > 1 ? Math.round(n) : Math.round(n * 100);
  if (hundredths < 0 || hundredths > 100) return null;
  return hundredths;
}

export function shareHToDisplay(hundredths) {
  if (!Number.isInteger(hundredths)) return null;
  return `${Math.trunc(hundredths / 100)}.${String(Math.abs(hundredths) % 100).padStart(2, '0')}`;
}

/** Bounded, oldest-dropped-last in-row history of one line's allocation. */
function normalizeShareHistory(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const at = stamp(raw.at);
    const shareH = normalizeShareH(raw.shareH);
    if (!at) continue;
    out.push({
      at,
      shareH,
      rights: Array.isArray(raw.rights) ? [...new Set(raw.rights.filter((r) => MATRIX_RIGHT_KEYS.includes(r)))] : [],
    });
  }
  return out.slice(-MATRIX_LIMITS.history);
}

export function normalizeReportingLines(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  let activePerPerson = new Map();
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Matrix line: dropped a malformed row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const personId = id(raw.personId);
    const managerId = id(raw.managerId);
    const kind = MATRIX_LINE_KIND_KEYS.includes(raw.kind) ? raw.kind : null;
    const fromISO = day(raw.fromISO);
    const declaredAt = stamp(raw.declaredAt);
    if (!rowId || !personId || !managerId || !kind || !fromISO || !declaredAt) {
      warnings.push('Matrix line: dropped an incomplete reporting line; no reporting line was inferred.');
      continue;
    }
    // A row that is STRUCTURALLY complete but semantically impossible (a person
    // reporting to themselves, a line ending before it starts) is KEPT, not
    // deleted: deleting it at load time is data loss, and it would vanish with
    // only a console warning. `buildMatrix` refuses to wire it and reports it by
    // name on the Review panel, where the leader who wrote it can see it.
    const toISO = day(raw.toISO);
    const key = `${personId}|${managerId}|${kind}`;
    if (seen.has(key)) {
      warnings.push('Matrix line: dropped a duplicate reporting line for one person, manager and kind.');
      continue;
    }
    const status = toISO ? 'ended' : 'active';
    if (status === 'active') {
      const activeN = activePerPerson.get(personId) || 0;
      if (activeN >= MATRIX_LIMITS.linesPerPerson) {
        warnings.push(`Matrix line: “${personId}” already carries its declared maximum of ${MATRIX_LIMITS.linesPerPerson} additional active lines; the extra row was dropped rather than silently widening the person’s accountability.`);
        continue;
      }
      activePerPerson.set(personId, activeN + 1);
    }
    seen.add(key);
    if (out.length >= 2000) {
      warnings.push('Matrix line: ledger cap reached; additional rows were not loaded.');
      break;
    }
    const rights = Array.isArray(raw.rights)
      ? [...new Set(raw.rights.filter((r) => MATRIX_RIGHT_KEYS.includes(r)))]
      : [];
    // An allocation that was typed but does not parse is NOT the same as one
    // that was left blank. Blank is undeclared; unparseable is a defect, and the
    // engine reports it by name instead of letting it decay into "undeclared".
    const rawShareGiven = !(raw.shareH === null || raw.shareH === undefined || raw.shareH === '');
    const shareH = normalizeShareH(raw.shareH);
    out.push({
      id: rowId,
      personId,
      managerId,
      kind,
      shareH,
      shareInvalid: rawShareGiven && shareH === null,
      rights,
      fromISO,
      toISO,
      note: text(raw.note, MATRIX_LIMITS.noteChars),
      declaredAt,
      declaredBySeatId: id(raw.declaredBySeatId),
      endedAt: stamp(raw.endedAt),
      endReason: text(raw.endReason, MATRIX_LIMITS.reasonChars),
      // An allocation that CHANGED is a new act, not a silent overwrite. The
      // previous value stays on the row it replaced, bounded, so the register
      // can answer "what did we agree last quarter" without a second table.
      history: normalizeShareHistory(raw.history),
      status,
    });
  }
  return out;
}

export function normalizeMatrixMarkers(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const key = text(raw.key, 200);
    const at = stamp(raw.at);
    if (!key || !at) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      at,
      ruleId: text(raw.ruleId, 40),
      kind: text(raw.kind, 60),
      detail: text(raw.detail, 300),
    });
    if (out.length >= MATRIX_LIMITS.markers) break;
  }
  return out;
}

export function normalizeMatrixSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    matrixBalanceHundredths: clampInt(
      source.matrixBalanceHundredths, MATRIX_BOUNDS.balanceHundredths, MATRIX_DEFAULTS.balanceHundredths,
    ),
    matrixExpiringDays: clampInt(
      source.matrixExpiringDays, MATRIX_BOUNDS.expiringDays, MATRIX_DEFAULTS.expiringDays,
    ),
    matrixAutoPropagate: source.matrixAutoPropagate !== false,
  };
}

export function matrixMarkerKey(...parts) {
  return parts.map((p) => String(p === null || p === undefined ? '' : p)).join('|');
}
