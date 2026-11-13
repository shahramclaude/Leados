/**
 * app/core/domain/chargebackPostingSchema.js — fail-closed normalization for
 * the Chargeback Period Posting & Budget-Envelope Binding ledger (ADR-0194,
 * Schema v154).
 *
 * WHAT IS STORED
 *   `chargebackPostings`        append-only dated ACTS, two kinds:
 *                                 post     a seat (or the operator view) freezes one
 *                                          period × one currency of the complete
 *                                          whole-workspace chargeback statement:
 *                                          per-line integer cents, envelope bindings,
 *                                          totals and the claims in force
 *                                 reverse  a dated reversal with a written reason;
 *                                          the posting stays as history
 *   `chargebackPostingMarkers`  RULE-CBP-01's bounded idempotency / observation ledger
 *   two settings                `chargebackPostingAskDueDays`, `chargebackPostingAutoPropagate`
 *
 * WHAT IS NEVER STORED. A budget line, an envelope figure, a posting state, an
 * audit verdict, a binding state. States and audits are derived on read against
 * the live record, so a printed verdict cannot drift from its evidence.
 *
 * FAIL CLOSED. A malformed posting is DROPPED with a counted warning — never
 * repaired into a period fact nobody signed. In particular the integer
 * identities are re-checked on LOAD: a posting whose rows do not sum to its
 * totals, whose totals do not net to zero, or whose frozen claims do not read
 * `complete` is not a posting — a hand-edited file cannot manufacture a period
 * close. A binding to an envelope that has since vanished or changed is KEPT
 * exactly as signed: decay is the read model's finding, not a load repair.
 */

import {
  CHARGEBACK_POSTING_ACT_KINDS,
  CHARGEBACK_POSTING_BOUNDS,
  CHARGEBACK_POSTING_DEFAULTS,
  CHARGEBACK_POSTING_LIMITS,
  CHARGEBACK_POSTING_VIAS,
} from './chargebackPostingRegistry.js';
import { formatCents, inclusiveDays, transferPriceCurrency, transferPriceDay } from './transferPriceSchema.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const cleanId = (v) => {
  const s = str(v);
  return s && s.length <= CHARGEBACK_POSTING_LIMITS.idMax ? s : null;
};

/** A frozen money figure: a non-negative exact integer number of cents, or null. */
const centsOrNull = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

export function normalizeChargebackPostingSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const [min, max] = CHARGEBACK_POSTING_BOUNDS.askDueDays;
  const n = typeof src.chargebackPostingAskDueDays === 'number' && Number.isFinite(src.chargebackPostingAskDueDays)
    ? Math.min(max, Math.max(min, Math.round(src.chargebackPostingAskDueDays)))
    : CHARGEBACK_POSTING_DEFAULTS.askDueDays;
  return {
    chargebackPostingAskDueDays: n,
    chargebackPostingAutoPropagate: src.chargebackPostingAutoPropagate !== false,
  };
}

/** One frozen posted line, or null. Binding is envelope XOR written no-envelope reason. */
function readPostingRow(item) {
  if (!isPlainObject(item)) return null;
  const accountId = cleanId(item.accountId);
  const chargedCents = centsOrNull(item.chargedCents);
  const creditedCents = centsOrNull(item.creditedCents);
  if (!accountId || chargedCents === null || creditedCents === null) return null;
  // A line with no money on either side is not a statement row; a file carrying
  // one is malformed rather than silently influential.
  if (chargedCents === 0 && creditedCents === 0) return null;
  const envelopeId = item.envelopeId === null || item.envelopeId === undefined || item.envelopeId === '' ? null : cleanId(item.envelopeId);
  if (item.envelopeId !== null && item.envelopeId !== undefined && item.envelopeId !== '' && !envelopeId) return null;
  const noEnvelopeReason = str(item.noEnvelopeReason).slice(0, CHARGEBACK_POSTING_LIMITS.reasonMax);
  if (envelopeId && noEnvelopeReason) return null;
  if (!envelopeId && noEnvelopeReason.length < CHARGEBACK_POSTING_LIMITS.reasonMin) return null;
  return { accountId, chargedCents, creditedCents, envelopeId, noEnvelopeReason: envelopeId ? '' : noEnvelopeReason };
}

/**
 * @param raw       stored acts, in append order
 * @param warnings  load warnings (mutated)
 */
export function normalizeChargebackPostings(raw, warnings = []) {
  const all = Array.isArray(raw) ? raw : [];
  const cap = CHARGEBACK_POSTING_LIMITS.acts;
  // The cap is applied BEFORE validation, so a reversal orphaned by it is
  // dropped and counted below instead of surviving as an answer to nothing.
  const arr = all.length > cap ? all.slice(all.length - cap) : all;
  const out = [];
  const seen = new Set();
  /** postingId → reversed yet? */
  const posts = new Map();
  let malformed = 0;
  let forged = 0;
  let orphaned = 0;

  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = cleanId(item.id);
    const kind = CHARGEBACK_POSTING_ACT_KINDS.includes(item.kind) ? item.kind : null;
    const via = CHARGEBACK_POSTING_VIAS.includes(item.via) ? item.via : null;
    const decidedOn = transferPriceDay(item.decidedOn);
    const at = isoOrNull(item.at);
    if (!id || seen.has(id) || !kind || !via || !decidedOn || !at) { malformed += 1; continue; }
    const decidedBySeatId = via === 'seat' ? cleanId(item.decidedBySeatId) : null;
    if (via === 'seat' && !decidedBySeatId) { malformed += 1; continue; }

    if (kind === 'post') {
      const periodFrom = transferPriceDay(item.periodFrom);
      const periodTo = transferPriceDay(item.periodTo);
      const days = inclusiveDays(periodFrom, periodTo);
      const currency = transferPriceCurrency(item.currency);
      if (!periodFrom || !periodTo || days === null || days < 1 || days > CHARGEBACK_POSTING_LIMITS.periodDaysMax || !currency) { malformed += 1; continue; }
      const rawRows = Array.isArray(item.rows) ? item.rows : null;
      if (!rawRows || rawRows.length < 1 || rawRows.length > CHARGEBACK_POSTING_LIMITS.rowsPerPosting) { malformed += 1; continue; }
      const rows = [];
      const accountSeen = new Set();
      let rowsOk = true;
      let sumCharged = 0;
      let sumCredited = 0;
      for (const rawRow of rawRows) {
        const row = readPostingRow(rawRow);
        if (!row || accountSeen.has(row.accountId)) { rowsOk = false; break; }
        accountSeen.add(row.accountId);
        sumCharged += row.chargedCents;
        sumCredited += row.creditedCents;
        rows.push(row);
      }
      // The integer identities, re-proved on LOAD: rows sum to the totals and
      // the totals net to zero. A posting that cannot prove them is not kept.
      const totalChargedCents = centsOrNull(item.totalChargedCents);
      const totalCreditedCents = centsOrNull(item.totalCreditedCents);
      if (!rowsOk || totalChargedCents === null || totalCreditedCents === null
        || !Number.isSafeInteger(sumCharged) || !Number.isSafeInteger(sumCredited)
        || sumCharged !== totalChargedCents || sumCredited !== totalCreditedCents
        || totalChargedCents !== totalCreditedCents || totalChargedCents === 0) { forged += 1; continue; }
      const claims = isPlainObject(item.claims) ? item.claims : null;
      // A posting is only ever signed off a COMPLETE statement. A frozen claims
      // block saying anything else is a forgery, not a variant.
      if (!claims || claims.statementComplete !== true || claims.zeroSum !== true
        || claims.shareDaysReconcile !== true || claims.arithmeticSafe !== true
        || !(claims.periodLedgerIdentity === true || claims.periodLedgerIdentity === null)) { forged += 1; continue; }
      const entriesN = Number.isSafeInteger(item.entriesN) && item.entriesN >= 0 ? item.entriesN : null;
      const pricedShareDays = Number.isSafeInteger(item.pricedShareDays) && item.pricedShareDays >= 0 ? item.pricedShareDays : null;
      if (entriesN === null || pricedShareDays === null) { malformed += 1; continue; }
      const engineVersion = str(item.engineVersion).slice(0, CHARGEBACK_POSTING_LIMITS.engineVersionMax);
      if (!engineVersion) { malformed += 1; continue; }
      seen.add(id);
      posts.set(id, false);
      out.push({
        id, kind, via, decidedBySeatId, decidedOn, at,
        note: str(item.note).slice(0, CHARGEBACK_POSTING_LIMITS.noteMax),
        periodFrom, periodTo, currency, rows,
        totalChargedCents, totalCreditedCents, entriesN, pricedShareDays,
        claims: {
          statementComplete: true,
          zeroSum: true,
          shareDaysReconcile: true,
          periodLedgerIdentity: claims.periodLedgerIdentity === true ? true : null,
          arithmeticSafe: true,
        },
        engineVersion,
      });
      continue;
    }

    // reverse
    const postingId = cleanId(item.postingId);
    if (!postingId || !posts.has(postingId)) { orphaned += 1; continue; }
    if (posts.get(postingId)) { malformed += 1; continue; }
    const reason = str(item.reason).slice(0, CHARGEBACK_POSTING_LIMITS.reasonMax);
    if (reason.length < CHARGEBACK_POSTING_LIMITS.reasonMin) { malformed += 1; continue; }
    posts.set(postingId, true);
    seen.add(id);
    out.push({ id, kind, via, decidedBySeatId, decidedOn, at, postingId, reason });
  }

  if (malformed) warnings.push(`Chargeback postings: dropped ${malformed} malformed posting act(s); no period fact was repaired or guessed`);
  if (forged) warnings.push(`Chargeback postings: dropped ${forged} posting(s) whose frozen figures or claims failed their own integer identities (rows must sum to the totals, the totals must net to zero and be non-zero, and the frozen statement claims must read complete)`);
  if (orphaned) warnings.push(`Chargeback postings: dropped ${orphaned} reversal(s) answering a posting that is not on the record`);
  return out;
}

export function normalizeChargebackPostingMarkers(raw) {
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
  const cap = CHARGEBACK_POSTING_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export { formatCents };
