/**
 * app/core/domain/dutyStandbySchema.js — fail-closed normalizers for Cover
 * acknowledgement (ADR-0127, Schema v116).
 *
 * WHAT IS STORED, AND WHAT MUST NEVER BE
 * --------------------------------------
 * A `dutyStandbyAnswers` row stores exactly the human act and its provenance:
 *   coverId        the declared cover row this answer is about
 *   dutyId         the duty line the cover is declared for (`<seatId>|<key>`)
 *   seatId         the seat that HOLDS the duty (so a stale answer can never be
 *                  attached to a re-declaration of the same duty by someone else)
 *   answeredBySeatId the seat that gave the answer — a cover answers for itself,
 *                  so this must equal the cover's own seat
 *   answer         accepted | declined
 *   windowFrom/To  the bounded standby window the answer was given for
 *   note           the answerer's own words (clamped, never summarised)
 *   decisionId     the governed decision opened when the answer was a REFUSAL
 *   status         active | revoked, with the revocation day and reason
 *
 * What it never stores: an "acknowledged" boolean, a derived standby state, a
 * count of overdue answers, a reminder that was sent, or a copy of another
 * module's record. The state is re-derived on read from the answer, the declared
 * window, the declared response deadline and today — a stored state would drift
 * from all four the moment any one of them moved.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible-looking consent: an invented answer is consent nobody gave.
 */

import {
  DUTY_STANDBY_ANSWERS,
  DUTY_STANDBY_ENGINE_VERSION,
  DUTY_STANDBY_LIMITS,
} from './dutyStandbyRegistry.js';

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

/** `<seatId>|<dutyKey>` — kept local so this module never reaches into ADR-0121's parser. */
function parseDutyIdLocal(dutyId) {
  const raw = typeof dutyId === 'string' ? dutyId.trim() : '';
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  const seatId = id(parts[0]);
  const dutyKey = typeof parts[1] === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(parts[1]) ? parts[1] : null;
  if (!seatId || !dutyKey) return null;
  return { seatId, dutyKey, dutyId: `${seatId}|${dutyKey}` };
}

/**
 * The standby window an answer covers. Inclusive ISO day keys, bounded by the
 * declared maximum. An unbounded answer is refused here as well as at the action,
 * because an imported workspace must not be able to widen consent by editing a
 * JSON file — consent is bounded in the schema or it is not bounded at all.
 */
export function parseStandbyWindow(value, { maxDays = DUTY_STANDBY_LIMITS.maxStandbyDays } = {}) {
  if (!isPlainObject(value)) return null;
  const from = day(value.from);
  const to = day(value.to);
  if (!from || !to || from > to) return null;
  const span = Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000) + 1;
  if (!Number.isFinite(span) || span < 1 || span > maxDays) return null;
  return { from, to, days: span };
}

/**
 * The answer ledger. Three structural corruptions are refused at load:
 *   - a malformed row (dropped with a warning);
 *   - a second ACTIVE answer from the same seat about the same cover row
 *     (dropped — an acknowledgement is replaced by revoking and re-answering, so
 *     the record of the first answer is never silently overwritten);
 *   - an answer whose own `answeredBySeatId` is not the declared cover's person
 *     (dropped — a third party cannot consent on someone else's behalf).
 *
 * The third check needs the cover ledger, so it is applied where both are known
 * (`normalizeStandbyAnswers(answers, covers, warnings)`): the schema is the one
 * place that can see both, and a check that lived only in the action would let a
 * hand-edited file record consent nobody gave.
 */
export function normalizeStandbyAnswers(value, covers = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const coverById = new Map(
    (Array.isArray(covers) ? covers : [])
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => [c.id, c]),
  );
  const activeKey = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Cover acknowledgement: dropped a malformed answer row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const coverId = id(raw.coverId);
    const parsed = parseDutyIdLocal(raw.dutyId);
    const seatId = id(raw.seatId);
    const answeredBySeatId = id(raw.answeredBySeatId);
    const answer = DUTY_STANDBY_ANSWERS.includes(raw.answer) ? raw.answer : null;
    // The row stores `windowFrom`/`windowTo`; `parseStandbyWindow` reads the
    // canonical `from`/`to`. Passing the raw row here silently dropped every
    // well-formed answer on reload — found by this module's own suite, which is
    // exactly the class of bug the schema is supposed to make impossible.
    const window = parseStandbyWindow({ from: raw.windowFrom, to: raw.windowTo });
    const answeredOn = day(raw.answeredOn);
    const answeredAt = stamp(raw.answeredAt);
    const status = raw.status === 'active' || raw.status === 'revoked' ? raw.status : null;
    if (!rowId || !coverId || !parsed || !seatId || !answeredBySeatId || !answer
      || !window || !answeredOn || !answeredAt || !status) {
      warnings.push('Cover acknowledgement: dropped an incomplete answer row; no consent was inferred.');
      continue;
    }
    if (parsed.seatId !== seatId) {
      warnings.push('Cover acknowledgement: dropped an answer whose duty line and holder seat disagree.');
      continue;
    }
    const cover = coverById.get(coverId);
    if (cover) {
      // The person named as cover is the only person who can answer for it.
      if (cover.coverId !== answeredBySeatId) {
        warnings.push('Cover acknowledgement: dropped an answer given by someone other than the declared cover. One person cannot consent on another’s behalf.');
        continue;
      }
      if (cover.dutyId !== parsed.dutyId || cover.seatId !== seatId) {
        warnings.push('Cover acknowledgement: dropped an answer pointing at a different duty line than its cover row.');
        continue;
      }
    }
    if (status === 'active') {
      const key = `${coverId}|${answeredBySeatId}`;
      if (activeKey.has(key)) {
        warnings.push('Cover acknowledgement: dropped a second active answer for one cover; the latest consent is not stacked on the first. Revoke and re-answer instead.');
        continue;
      }
      activeKey.add(key);
    }
    if (out.length >= DUTY_STANDBY_LIMITS.answerCap) {
      warnings.push('Cover acknowledgement: answer ledger cap reached; additional rows were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      coverId,
      dutyId: parsed.dutyId,
      seatId,
      answeredBySeatId,
      answer,
      windowFrom: window.from,
      windowTo: window.to,
      note: text(raw.note, DUTY_STANDBY_LIMITS.noteChars),
      decisionId: id(raw.decisionId),
      answeredOn,
      answeredAt,
      status,
      revokedOn: day(raw.revokedOn),
      revokedAt: stamp(raw.revokedAt),
      revokeReason: text(raw.revokeReason, DUTY_STANDBY_LIMITS.reasonChars),
      version: typeof raw.version === 'string' && raw.version.trim()
        ? raw.version.trim().slice(0, 60)
        : DUTY_STANDBY_ENGINE_VERSION,
    });
  }
  return out;
}

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Declared conventions. A value that is present but out of range CLAMPS to the
 * boundary; a value that is not a number falls back to the printed default.
 * Never "the most permissive reading".
 */
export function normalizeDutyStandbySettings(settings = {}, bounds = null, defaults = null) {
  const s = isPlainObject(settings) ? settings : {};
  const b = bounds || { dutyStandbyResponseDays: [1, 30], dutyStandbyWindowDays: [3, 90] };
  const d = defaults || { dutyStandbyResponseDays: 3, dutyStandbyWindowDays: 14 };
  return {
    dutyStandbyResponseDays: clampInt(s.dutyStandbyResponseDays, ...b.dutyStandbyResponseDays, d.dutyStandbyResponseDays),
    dutyStandbyWindowDays: clampInt(s.dutyStandbyWindowDays, ...b.dutyStandbyWindowDays, d.dutyStandbyWindowDays),
  };
}

/** The active answer for one cover row, or null. Latest wins by answered instant. */
export function activeAnswerFor(answers, coverId) {
  if (!Array.isArray(answers)) return null;
  const rows = answers.filter((r) => r && r.coverId === coverId && r.status === 'active');
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : a.answeredAt > b.answeredAt ? -1 : 0))[0];
}
