/**
 * app/core/domain/lineExitSchema.js — fail-closed normalizers for the Matrix
 * Line-Exit Obligation Register (ADR-0152, Schema v127).
 *
 * WHAT IS STORED
 * --------------
 * `lineExitRemedies` — one row per dated human act on ONE open obligation left
 * behind by an ended line:
 *
 *   { id, obligationKey, source, personId, lineKey, lineRole, lineKind,
 *     managerId, outcome: 'retire' | 'carry', reason, carryToManagerId,
 *     decidedOn, decidedBySeatId, decidedSource, reviewOn, at }
 *
 * `lineExitMarkers` — the rule's idempotency ledger.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - an obligation row. Every obligation is DERIVED on read from the asks the
 *    workspace already holds plus the dated declarations, so a printed obligation
 *    cannot drift from the record that produced it — and an obligation that was
 *    answered can never keep standing because the module froze a copy of it.
 *  - a state, a window verdict, a day count, a verdict or a total. All derived.
 *  - a re-pointed ask. A carry is a dated STATEMENT about who owes the
 *    obligation; the original ask keeps its addressee and its words. An edited
 *    ask would be an accountability the record never agreed to.
 *  - a retirement without a reason. A row missing its reason is DROPPED with a
 *    printed warning, never repaired: "nothing was owed" is a claim, and a claim
 *    with no reason is indistinguishable from a forgotten obligation.
 *
 * Deliberately EMPTY on upgrade: no ended line in an existing workspace has been
 * adjudicated by this register, so the honest reading is "every open obligation
 * of every ended line is still open" — which is exactly what the panel prints.
 */

import {
  LINE_EXIT_BOUNDS,
  LINE_EXIT_DEFAULTS,
  LINE_EXIT_LIMITS,
  LINE_EXIT_MIN_REASON,
  LINE_EXIT_SOURCE_KEYS,
} from './lineExitRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:._-]{1,200}$/.test(value.trim()) ? value.trim() : null;
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
export function normalizeLineExitSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    lineExitDueDays: clampInt(
      source.lineExitDueDays,
      LINE_EXIT_BOUNDS.dueDays,
      LINE_EXIT_DEFAULTS.dueDays,
    ),
  };
}

export const LINE_EXIT_DEFAULTS_RESOLVED = Object.freeze(normalizeLineExitSettings({}));

const OUTCOMES = new Set(['retire', 'carry']);
const SOURCES = new Set(LINE_EXIT_SOURCE_KEYS);

function normalizeRemedy(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Line exit: dropped a remedy that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const obligationKey = id(raw.obligationKey);
  const source = text(raw.source, 40);
  const personId = id(raw.personId);
  const lineKey = id(raw.lineKey);
  const managerId = id(raw.managerId);
  const outcome = text(raw.outcome, 20);
  const decidedOn = day(raw.decidedOn);
  if (!rowId || !obligationKey || !personId || !lineKey || !managerId || !decidedOn || !OUTCOMES.has(outcome) || !SOURCES.has(source)) {
    warnings.push('Line exit: dropped a remedy missing its obligation, line, person, manager, outcome or date. No retirement or carry was inferred.');
    return null;
  }
  const reason = text(raw.reason, LINE_EXIT_LIMITS.reasonChars);
  if (reason.length < LINE_EXIT_MIN_REASON) {
    warnings.push('Line exit: dropped a remedy with no stated reason. Nothing is retired or carried without one.');
    return null;
  }
  const carryToManagerId = outcome === 'carry' ? id(raw.carryToManagerId) : null;
  if (outcome === 'carry' && !carryToManagerId) {
    warnings.push('Line exit: dropped a carry that names no manager to carry it to. Work carried to nobody is still orphaned.');
    return null;
  }
  return {
    id: rowId,
    obligationKey,
    source,
    personId,
    lineKey,
    lineRole: raw.lineRole === 'primary' ? 'primary' : 'secondary',
    lineKind: text(raw.lineKind, 40),
    managerId,
    outcome,
    reason,
    carryToManagerId,
    decidedOn,
    decidedBySeatId: id(raw.decidedBySeatId),
    decidedSource: raw.decidedSource === 'operator' ? 'operator' : 'leader',
    reviewOn: day(raw.reviewOn) || null,
    at: stamp(raw.at) || `${decidedOn}T00:00:00.000Z`,
  };
}

/**
 * Normalize the remedy ledger.
 *
 * Bounded by `LINE_EXIT_LIMITS.remedies`; the oldest rows are displaced and the
 * displacement is COUNTED with a printed warning, never silent. A duplicate
 * (same obligation, same outcome, same day) is dropped rather than double-counted,
 * so a hand-edited file cannot claim the same retirement twice.
 */
export function normalizeLineExitRemedies(raw, warnings = []) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const row = normalizeRemedy(entry, warnings);
    if (!row) continue;
    const key = `${row.obligationKey}|${row.outcome}|${row.decidedOn}`;
    if (seen.has(key)) {
      warnings.push('Line exit: dropped a duplicate remedy for the same obligation, outcome and day.');
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  if (out.length > LINE_EXIT_LIMITS.remedies) {
    const displaced = out.length - LINE_EXIT_LIMITS.remedies;
    warnings.push(`Line exit: ${displaced} remedy row(s) beyond the retention limit of ${LINE_EXIT_LIMITS.remedies} were displaced from the ledger.`);
    return out.slice(displaced);
  }
  return out;
}

function normalizeMarker(raw) {
  if (!isPlainObject(raw)) return null;
  const key = text(raw.key, 200);
  if (!key) return null;
  return {
    key,
    kind: text(raw.kind, 40),
    summary: text(raw.summary, 280),
    at: stamp(raw.at) || new Date(0).toISOString(),
  };
}

/** RULE-LEX-01's idempotency ledger. Malformed markers are dropped silently: a marker is a guard, not a record. */
export function normalizeLineExitMarkers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const row = normalizeMarker(entry);
    if (!row || seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  if (out.length > LINE_EXIT_LIMITS.markers) return out.slice(out.length - LINE_EXIT_LIMITS.markers);
  return out;
}

/** Re-exported so a caller never has to rebuild the key shape by hand. */
export function lineExitObligationKey(source, recordId, lineKey = null) {
  if (!source || !recordId) return null;
  return lineKey ? `${source}:${recordId}:${lineKey}` : `${source}:${recordId}`;
}
