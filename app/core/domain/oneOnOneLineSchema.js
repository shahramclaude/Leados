/**
 * app/core/domain/oneOnOneLineSchema.js — normalization for Matrix 1:1 Line
 * Coverage (Schema v132; ADR-0164 is reserved and not yet written).
 *
 * WHAT IS STORED
 *   On every `oneOnOnes` row, three additive fields:
 *     heldById     the roster id (or the workspace-leader id) of the manager who
 *                  HELD the meeting; `null` means "not recorded".
 *     heldByBasis  how that holder came to be on the record (closed vocabulary).
 *     heldByAt     when the attribution was recorded.
 *   A separate bounded marker ledger is reserved for the unfinished reminder
 *   rule; it is not part of Schema v132.
 *
 * WHAT IS NEVER STORED. A line state, a day count, a "masked" verdict, a
 * cadence. Every one is derived on read from the meetings and the live matrix,
 * so a printed figure cannot drift from the record that produced it.
 *
 * FAIL CLOSED. A holder with no valid basis, or a meeting that names the person
 * as their own holder, is CLEARED to "not recorded" with a counted warning. It
 * is never repaired into a guess: an invented holder would credit a line with a
 * conversation nobody attested. A holder id that is merely absent from today's
 * roster is KEPT exactly as stored — people leave, and the reader prints it as
 * a holder who is no longer on the roster rather than rewriting history.
 *
 * Schema v132 wires holder and setting normalization. The reminder marker
 * normalizer remains reserved; no automatic reminder rule is shipped yet.
 */

import {
  ONE_ON_ONE_HOLDER_BASES,
  ONE_ON_ONE_LINE_BOUNDS,
  ONE_ON_ONE_LINE_DEFAULTS,
  ONE_ON_ONE_LINE_LIMITS,
} from './oneOnOneLineRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function clampInt(value, [min, max], fallback) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The four declared conventions, clamped. Spread into settings on every load. */
export function normalizeOneOnOneLineSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    oneOnOneLineCadenceDays: clampInt(src.oneOnOneLineCadenceDays, ONE_ON_ONE_LINE_BOUNDS.lineCadenceDays, ONE_ON_ONE_LINE_DEFAULTS.lineCadenceDays),
    oneOnOneLineMinSharePct: clampInt(src.oneOnOneLineMinSharePct, ONE_ON_ONE_LINE_BOUNDS.minSharePct, ONE_ON_ONE_LINE_DEFAULTS.minSharePct),
    oneOnOneLineAskDueDays: clampInt(src.oneOnOneLineAskDueDays, ONE_ON_ONE_LINE_BOUNDS.askDueDays, ONE_ON_ONE_LINE_DEFAULTS.askDueDays),
    oneOnOneLineAutoPropagate: src.oneOnOneLineAutoPropagate !== false,
  };
}

/**
 * Strict validation for a RE-DECLARED convention. A refused value is better
 * than a silently clamped one: a cadence the leader did not choose would make
 * every state on the page a reading against a number nobody set.
 *
 * Returns `{ ok: true, patch }` holding only the keys that were supplied, or
 * `{ ok: false, error, field }`.
 */
export function validateOneOnOneLineConventions(input = {}) {
  const src = isPlainObject(input) ? input : {};
  const patch = {};
  const whole = (key, [min, max], label) => {
    if (!Object.hasOwn(src, key)) return null;
    const raw = src[key];
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
      return { ok: false, error: `${label} must be a whole number from ${min} to ${max}.`, field: key };
    }
    patch[key] = n;
    return null;
  };
  const refused = whole('oneOnOneLineCadenceDays', ONE_ON_ONE_LINE_BOUNDS.lineCadenceDays, 'The additional-line 1:1 interval (days)')
    || whole('oneOnOneLineMinSharePct', ONE_ON_ONE_LINE_BOUNDS.minSharePct, 'The share floor (percent)')
    || whole('oneOnOneLineAskDueDays', ONE_ON_ONE_LINE_BOUNDS.askDueDays, 'The answer window for a silent-line ask (days)');
  if (refused) return refused;
  if (Object.hasOwn(src, 'oneOnOneLineAutoPropagate')) {
    if (typeof src.oneOnOneLineAutoPropagate !== 'boolean') {
      return { ok: false, error: 'Automatic silent-line asks must be either on or off.', field: 'oneOnOneLineAutoPropagate' };
    }
    patch.oneOnOneLineAutoPropagate = src.oneOnOneLineAutoPropagate;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'Name at least one convention to re-declare.', field: 'conventions' };
  return { ok: true, patch };
}

/**
 * The holder triple of one stored meeting.
 *
 * `counters` (optional) is mutated so the caller can print ONE warning per load
 * instead of one per row: `{ cleared: number }`.
 */
export function normalizeOneOnOneHolder(meeting, counters = null) {
  const none = { heldById: null, heldByBasis: null, heldByAt: null };
  if (!isPlainObject(meeting)) return none;
  const heldById = str(meeting.heldById);
  if (!heldById) {
    if (counters && meeting.heldById !== null && meeting.heldById !== undefined && meeting.heldById !== '') {
      counters.cleared = (counters.cleared || 0) + 1;
    }
    return none;
  }
  const basis = ONE_ON_ONE_HOLDER_BASES.includes(meeting.heldByBasis) ? meeting.heldByBasis : null;
  // Never truncate an id into somebody else's id. Unaccountable, oversized or
  // self-attributed holders are cleared and counted, never guessed.
  if (!basis || heldById.length > ONE_ON_ONE_LINE_LIMITS.holderIdMax || heldById === str(meeting.personId)) {
    if (counters) counters.cleared = (counters.cleared || 0) + 1;
    return none;
  }
  return { heldById, heldByBasis: basis, heldByAt: isoOrNull(meeting.heldByAt) };
}

/** RULE-OOL-01's idempotency ledger. Opaque keys; malformed rows are dropped. */
export function normalizeOneOnOneLineMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 240);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      lineKey: str(item.lineKey).slice(0, 200),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 24),
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = ONE_ON_ONE_LINE_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
