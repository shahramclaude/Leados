/**
 * app/core/domain/transferPriceSchema.js — fail-closed normalization and exact
 * integer helpers for the Cross-Line Labour Chargeback & Internal
 * Transfer-Price Ledger (ADR-0177, Schema v142).
 *
 * WHAT IS STORED
 *   `transferPriceActs`     append-only dated ACTS, three kinds:
 *                             propose  one line's manager signs a price for
 *                                      people one home line lends to another
 *                             confirm  the OTHER line's manager signs the same
 *                                      terms — the second key
 *                             retire   a party declines / withdraws a proposal,
 *                                      or voids an agreed price from a named day
 *   `transferPriceMarkers`  RULE-TPL-01's bounded idempotency / observation ledger
 *   two settings            `transferPriceAskDueDays`, `transferPriceAutoPropagate`
 *
 * WHAT IS NEVER STORED. A charge, a credit, a net position, an agreement state,
 * a "priced" flag, a total. Every one is derived on read from the acts, the
 * declared reporting lines and the recorded home-line history, so a printed
 * figure cannot drift from its record.
 *
 * FAIL CLOSED. A malformed act is DROPPED with a counted warning — never
 * repaired into a price nobody agreed. In particular a `confirm` whose terms
 * differ from its proposal, or one signed from the same side as the proposal,
 * is dropped: a hand-edited file cannot manufacture a second key. A manager id
 * absent from today's roster is KEPT exactly as stored — people leave, and the
 * statement prints that line as off the roster instead of rewriting who signed.
 */

import {
  TRANSFER_PRICE_ACT_KINDS,
  TRANSFER_PRICE_BASIS_KEYS,
  TRANSFER_PRICE_BOUNDS,
  TRANSFER_PRICE_DEFAULTS,
  TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_SIDES,
  TRANSFER_PRICE_VIAS,
} from './transferPriceRegistry.js';

const DAY_MS = 86400000;
const CURRENCY_RE = /^[A-Z]{3}$/;

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-31` is not a day. */
export function transferPriceDay(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === s ? s : null;
}

/** Whole days from `fromDay` to `toDay` INCLUSIVE at both ends, or null. */
export function inclusiveDays(fromDay, toDay) {
  const a = transferPriceDay(fromDay);
  const b = transferPriceDay(toDay);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/** The calendar day `n` days after `day` (negative `n` goes back), or null. */
export function shiftDay(day, n) {
  const a = transferPriceDay(day);
  if (!a || !Number.isInteger(n)) return null;
  return new Date(Date.parse(`${a}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** `ABC` for a readable ISO-4217-shaped code, or null. Never defaulted. */
export function transferPriceCurrency(value) {
  const s = str(value).toUpperCase();
  return CURRENCY_RE.test(s) ? s : null;
}

/**
 * The declared rate as an exact integer, or null.
 *
 * The rate is a WHOLE number of currency units per full person-day. One
 * share-day is one hundredth of a person for one day, so it costs exactly that
 * many CENTS — which is why this one integer is both figures and no charge can
 * ever need rounding. A decimal, a negative, a blank or an out-of-bound value
 * is refused (null), never rounded, never zero.
 */
export function transferPriceRate(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  // `600` and `600.00` are the same whole number of units; `600.50` is not one.
  const n = typeof value === 'number' ? value : (typeof value === 'string' && /^\d{1,9}(\.0{1,2})?$/.test(value.trim()) ? Number(value.trim()) : NaN);
  if (!Number.isSafeInteger(n) || n < 0 || n > TRANSFER_PRICE_LIMITS.maxRateCents) return null;
  return n;
}

/**
 * Signed exact integer-cent formatter (`-2208000` → `'-22080.00'`). Integer
 * division and modulo only — no floating-point formatting. Null for anything
 * that is not a safe integer, so a refused figure can never print as `0.00`.
 */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) return null;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${cents < 0 ? '-' : ''}${whole}.${String(frac).padStart(2, '0')}`;
}

export function normalizeTransferPriceSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const [min, max] = TRANSFER_PRICE_BOUNDS.askDueDays;
  const n = typeof src.transferPriceAskDueDays === 'number' && Number.isFinite(src.transferPriceAskDueDays)
    ? Math.min(max, Math.max(min, Math.round(src.transferPriceAskDueDays)))
    : TRANSFER_PRICE_DEFAULTS.askDueDays;
  return {
    transferPriceAskDueDays: n,
    transferPriceAutoPropagate: src.transferPriceAutoPropagate !== false,
  };
}

const cleanId = (v) => {
  const s = str(v);
  return s && s.length <= TRANSFER_PRICE_LIMITS.idMax ? s : null;
};

/** The priced terms of a proposal, or null when any one of them is unreadable. */
export function readTransferPriceTerms(item) {
  if (!isPlainObject(item)) return null;
  const currency = transferPriceCurrency(item.currency);
  const rateCents = Number.isSafeInteger(item.rateCents) ? transferPriceRate(item.rateCents) : null;
  const basis = TRANSFER_PRICE_BASIS_KEYS.includes(item.basis) ? item.basis : null;
  const effectiveFrom = transferPriceDay(item.effectiveFrom);
  const effectiveTo = transferPriceDay(item.effectiveTo);
  if (!currency || rateCents === null || !basis || !effectiveFrom || !effectiveTo) return null;
  const term = inclusiveDays(effectiveFrom, effectiveTo);
  const [minTerm, maxTerm] = TRANSFER_PRICE_BOUNDS.termDays;
  if (term === null || term < minTerm || term > maxTerm) return null;
  return { currency, rateCents, basis, effectiveFrom, effectiveTo };
}

const sameTerms = (a, b) => a.currency === b.currency && a.rateCents === b.rateCents && a.basis === b.basis
  && a.effectiveFrom === b.effectiveFrom && a.effectiveTo === b.effectiveTo;

/**
 * @param raw       stored acts, in append order
 * @param warnings  load warnings (mutated)
 */
export function normalizeTransferPriceActs(raw, warnings = []) {
  const all = Array.isArray(raw) ? raw : [];
  const cap = TRANSFER_PRICE_LIMITS.acts;
  // The cap is applied BEFORE validation, so an act orphaned by it is dropped
  // and counted below instead of surviving as a key to nothing.
  const arr = all.length > cap ? all.slice(all.length - cap) : all;
  const out = [];
  const seen = new Set();
  /** agreementId → { lenderId, borrowerId, side, terms, confirmed, retired } */
  const agreements = new Map();
  let malformed = 0;
  let orphaned = 0;
  let forged = 0;

  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = cleanId(item.id);
    const kind = TRANSFER_PRICE_ACT_KINDS.includes(item.kind) ? item.kind : null;
    const agreementId = cleanId(item.agreementId);
    const lenderId = cleanId(item.lenderId);
    const borrowerId = cleanId(item.borrowerId);
    const side = TRANSFER_PRICE_SIDES.includes(item.side) ? item.side : null;
    const via = TRANSFER_PRICE_VIAS.includes(item.via) ? item.via : null;
    const decidedOn = transferPriceDay(item.decidedOn);
    const at = isoOrNull(item.at);
    if (!id || seen.has(id) || !kind || !agreementId || !lenderId || !borrowerId || lenderId === borrowerId
      || !side || !via || !decidedOn || !at) { malformed += 1; continue; }
    // A seat-signed key is the signer's OWN side: the lender key by the lending
    // manager, the borrower key by the borrowing manager. Anything else is not
    // a key at all.
    const sideHolder = side === 'lender' ? lenderId : borrowerId;
    const decidedBySeatId = via === 'seat' ? cleanId(item.decidedBySeatId) : null;
    if (via === 'seat' && decidedBySeatId !== sideHolder) { forged += 1; continue; }
    const note = str(item.note).slice(0, TRANSFER_PRICE_LIMITS.noteMax);

    const base = { id, kind, agreementId, lenderId, borrowerId, side, via, decidedBySeatId, decidedOn, at, note };
    const known = agreements.get(agreementId) || null;

    if (kind === 'propose') {
      const terms = readTransferPriceTerms(item);
      if (!terms || known) { malformed += 1; continue; }
      agreements.set(agreementId, { lenderId, borrowerId, side, terms, confirmed: false, retired: false });
      seen.add(id);
      out.push({ ...base, ...terms, voidFrom: null });
      continue;
    }

    if (!known) { orphaned += 1; continue; }
    if (known.lenderId !== lenderId || known.borrowerId !== borrowerId || known.retired) { malformed += 1; continue; }

    if (kind === 'confirm') {
      const terms = readTransferPriceTerms(item);
      // The second key must be the OTHER side, signing the SAME terms, once.
      if (!terms || known.confirmed || side === known.side || !sameTerms(terms, known.terms)) { forged += 1; continue; }
      known.confirmed = true;
      seen.add(id);
      out.push({ ...base, ...terms, voidFrom: null });
      continue;
    }

    // retire
    if (note.length < TRANSFER_PRICE_LIMITS.reasonMin) { malformed += 1; continue; }
    let voidFrom = null;
    if (known.confirmed) {
      voidFrom = transferPriceDay(item.voidFrom);
      if (!voidFrom || voidFrom < known.terms.effectiveFrom || voidFrom > known.terms.effectiveTo) { malformed += 1; continue; }
    }
    known.retired = true;
    seen.add(id);
    out.push({ ...base, ...known.terms, voidFrom });
  }

  if (malformed) warnings.push(`Transfer prices: dropped ${malformed} malformed price act(s); no price was repaired or guessed`);
  if (forged) warnings.push(`Transfer prices: dropped ${forged} act(s) that were not a valid key (signed from the wrong seat or side, a second confirmation, or terms differing from the proposal)`);
  if (orphaned) warnings.push(`Transfer prices: dropped ${orphaned} act(s) answering a proposal that is not on the record`);
  return out;
}

export function normalizeTransferPriceMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 320);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      subjectKey: str(item.subjectKey).slice(0, 280),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 32),
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = TRANSFER_PRICE_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
