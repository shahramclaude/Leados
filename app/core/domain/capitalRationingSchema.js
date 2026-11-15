/**
 * app/core/domain/capitalRationingSchema.js — the fail-closed storage contract of
 * the Capital Rationing & Funded-Set Register (ADR-0211, Schema v165).
 *
 * THREE append-only ledgers and nothing else:
 *
 *   1. `capitalCeilings` — a dated statement by a seat at the enterprise
 *      altitude of how much money may be committed in one currency over one
 *      period, with a written basis. Immutable once declared; retiring one is a
 *      retirement act with its own reason and day, never an edit.
 *
 *   2. `capitalRelations` — a dated declaration that two investment CASES stand
 *      in one of three relations (`exclusive`, `requires`, `overlap`), with a
 *      written reason. Immutable; retiring one preserves the declaration.
 *
 *   3. `capitalRationingMarkers` — the rule's bounded ledger of identity-free
 *      observations where no roster seat can be asked.
 *
 * NOTHING DERIVED IS STORED. No funded set, no optimal value, no shadow price,
 * no node count, no rank-order gap and no verdict. Each is re-derived on every
 * read by the exact kernel in `capitalRationingMath.js`, so a hand-edited file
 * cannot carry a funded set that its own ceilings and candidates do not imply,
 * and a replayed workspace cannot carry a stale plan.
 *
 * WHAT THE LOADER REFUSES (never repairs):
 *   - a ceiling with no readable id, currency, period, amount or written basis;
 *     an amount that is not a whole non-negative number of cents; a period that
 *     does not end on or after it starts, or runs past two years; a currency
 *     that is not three upper-case letters;
 *   - a relation naming the same case twice, naming a case that is not on the
 *     register, of an undeclared kind, or of `overlap` with a share outside the
 *     open interval (0, 10000) basis points — because a full overlap IS an
 *     `exclusive` declaration and a zero overlap is not a relation at all. A
 *     relation recorded as something weaker than it is would ration the fund
 *     wrongly, which is exactly the failure this register exists to stop;
 *   - a retirement naming an unknown row, or a second retirement of one row.
 *
 * A row that cannot be read exactly is DROPPED with a counted warning. Nothing
 * is repaired into a constraint, because a constraint the record does not
 * support is a ceiling nobody declared or a link nobody agreed to.
 */

import {
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RELATION_KIND_KEYS,
} from './capitalRationingRegistry.js';

const L = CAPITAL_RATIONING_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const AMOUNT_RE = /^(\d{1,15})(?:\.(\d{1,2}))?$/;
const SIGNATURE_RE = /^fnd1:[0-9a-f]{1,8}:[0-9a-f]{16}$/;
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function capitalDay(value) {
  const candidate = text(value, 10);
  if (!DAY_RE.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/** Whole days from one real day to another (positive when `to` is later), or null. */
export function capitalDaysBetween(from, to) {
  if (!capitalDay(from) || !capitalDay(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function boundedInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function capitalCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/** A written basis, or null when it is below the declared minimum. */
export function capitalReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

/**
 * A typed amount in major units → exact whole cents, with no floating point in
 * between. `40000000`, `1500.5` and `0.25` are read; `1e6`, `1,000` and anything
 * past two decimals is refused (null). Refusing is the point: a ceiling the
 * register cannot read exactly is not rounded into one it can.
 */
export function parseCapitalAmount(value) {
  let raw;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    raw = String(value);
  } else if (typeof value === 'string') {
    raw = value.trim().replace(/\s/g, '');
  } else {
    return null;
  }
  if (!raw) return null;
  const match = AMOUNT_RE.exec(raw);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

/**
 * A STORED amount is already whole cents. It is read by an exact integer test and
 * NEVER routed through the major-unit parser: `cents: 950000000` is 9,500,000.00,
 * and re-parsing it as though it were typed would multiply the ceiling by a
 * hundred on every reload. A value that is not a whole non-negative safe integer
 * is not repaired into one — it is refused.
 */
export function readStoredCapitalCents(value) {
  if (typeof value !== 'number') return null;
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeCapitalRationingSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    capitalRationingAskDueDays: boundedInt(src.capitalRationingAskDueDays, [1, 60], 14),
    capitalRationingAutoPropagate: src.capitalRationingAutoPropagate !== false,
  };
}

/* ----------------------------------------------------------------- ceilings */

/**
 * Every declared ceiling, read exactly or dropped. Order: period start, then
 * currency, then id — a stable order the reader and the CSV both inherit.
 */
export function normalizeCapitalCeilings(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Capital rationing: the ceiling ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.ceilings) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const ceilingId = row && id(row.id);
    const currency = row && capitalCurrency(row.currency);
    const periodFrom = row && capitalDay(row.periodFrom);
    const periodTo = row && capitalDay(row.periodTo);
    const cents = row ? readStoredCapitalCents(row.cents) : null;
    const basis = row && capitalReason(row.basis);
    const declaredOn = row && capitalDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const span = periodFrom && periodTo ? capitalDaysBetween(periodFrom, periodTo) : null;
    const valid = Boolean(ceilingId && !seen.has(ceilingId) && currency && periodFrom && periodTo
      && span !== null && span >= 0 && span <= L.periodMaxDays
      && cents !== null && cents >= 0 && basis && declaredOn && declaredAt && declaredById);
    if (!valid) { dropped += 1; continue; }
    seen.add(ceilingId);
    out.push({
      id: ceilingId, currency, periodFrom, periodTo, cents, basis,
      declaredOn, declaredAt, declaredById,
      retiredOn: capitalDay(row.retiredOn), retiredById: row.retiredById && id(row.retiredById),
      retireReason: row.retireReason ? capitalReason(row.retireReason) : null,
    });
  }
  if (dropped) warnings.push(`${dropped} capital ceiling row(s) could not be read exactly — an unreadable id, currency, period, amount or written basis, a period ending before it starts or running past ${L.periodMaxDays} days, or a duplicate id — and were dropped. No constraint was invented in their place.`);
  out.sort((a, b) => a.periodFrom.localeCompare(b.periodFrom) || a.currency.localeCompare(b.currency) || a.id.localeCompare(b.id));
  return out;
}

/* ---------------------------------------------------------------- relations */

/**
 * Every declared relation, read exactly or dropped. Order: declared day, then
 * id. Two ends must be distinct, on the register, and of a declared kind.
 */
export function normalizeCapitalRelations(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Capital rationing: the relation ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.relations) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const relationId = row && id(row.id);
    const aCaseId = row && id(row.aCaseId);
    const bCaseId = row && id(row.bCaseId);
    const kind = row && CAPITAL_RELATION_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const reason = row && capitalReason(row.reason);
    const declaredOn = row && capitalDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const overlapBp = kind === 'overlap' && row
      ? (Number.isInteger(row.overlapBp) && row.overlapBp >= L.overlapBpMin && row.overlapBp <= L.overlapBpMax ? row.overlapBp : null)
      : null;
    const valid = Boolean(relationId && !seen.has(relationId) && aCaseId && bCaseId && aCaseId !== bCaseId
      && kind && reason && declaredOn && declaredAt && declaredById
      && (kind !== 'overlap' || overlapBp !== null));
    if (!valid) { dropped += 1; continue; }
    seen.add(relationId);
    out.push({
      id: relationId, aCaseId, bCaseId, kind, overlapBp, reason,
      declaredOn, declaredAt, declaredById,
      retiredOn: capitalDay(row.retiredOn), retiredById: row.retiredById && id(row.retiredById),
      retireReason: row.retireReason ? capitalReason(row.retireReason) : null,
    });
  }
  if (dropped) warnings.push(`${dropped} capital relation row(s) could not be read exactly — an unreadable id, a case named twice, an undeclared kind, a shared-benefit share outside the open interval (${L.overlapBpMin}, ${L.overlapBpMax}) basis points, or no written reason — and were dropped. Nothing was repaired into a constraint. A full overlap is an “alternatives” declaration, not a shared benefit.`);
  out.sort((a, b) => a.declaredOn.localeCompare(b.declaredOn) || a.id.localeCompare(b.id));
  return out;
}

/* ------------------------------------------------------------------ markers */

/** The rule's bounded, identity-free observation ledger. */
export function normalizeCapitalRationingMarkers(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Capital rationing: the observation markers were not an array; they were read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const key = row ? text(row.key, 240) : '';
    if (!key || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    out.push({ key, at: stamp(row.at), ruleId: text(row.ruleId, 40), kind: text(row.kind, 40), detail: text(row.detail, 300) });
  }
  if (dropped) warnings.push(`${dropped} capital-rationing marker row(s) were unreadable or duplicated and were dropped.`);
  return out.slice(-L.markers);
}

/* --------------------------------------------------------------- signatures */

/**
 * The signature of an ASK, not of a funded set: a condition that has not been
 * settled. It names the currency, the condition and the exact subject, so a
 * settled condition closes its ask and a new one is filed only for a new fact.
 */
export function capitalRationingSignature({ key, currency, subject }) {
  const joined = `key:${key || ''}\ncur:${currency || ''}\nsub:${subject || ''}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `crs1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function capitalRationingAskSummary(signature) {
  return `Capital rationing: ${String(signature || '').trim()}`;
}

export function parseCapitalRationingAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  const prefix = 'Capital rationing: ';
  if (!trimmed.startsWith(prefix)) return null;
  const candidate = trimmed.slice(prefix.length).trim();
  return /^crs1:[0-9a-f]{16}$/.test(candidate) ? { signature: candidate } : null;
}

/** A ceiling or relation id is never a signature; this keeps the two apart. */
export const CAPITAL_SIGNATURE_RE = SIGNATURE_RE;
