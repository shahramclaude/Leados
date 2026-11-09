/**
 * app/core/domain/lineConsentSchema.js — fail-closed normalizers for Matrix Line
 * Consent (ADR-0148, Schema v123).
 *
 * WHAT IS STORED
 * --------------
 * `lineConsents` — one row per dated human act on one declared line:
 *
 *   { id, declarationId, personId, managerId, kind,
 *     side: 'manager' | 'person',
 *     outcome: 'accepted' | 'declined' | 'acknowledged',
 *     decidedOn, decidedBySeatId, expiresOn, basis, reason, at }
 *
 * `lineConsentMarkers` — the rule's idempotency ledger.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a line state, a verdict, a day count or a total. Every one is DERIVED on
 *    read from these acts plus the live matrix, so a printed state cannot drift
 *    from the act that produced it.
 *  - an implied acceptance. A row must name its side and its outcome; a row
 *    missing either is DROPPED with a printed warning, never repaired. An
 *    acceptance invented at load time is consent nobody gave.
 *  - the CURRENT share. What the row stores is the share that was ACCEPTED, on
 *    the day it was accepted — a dated fact, like the window. The current
 *    allocation is read from the declaration on every render, so a retune shows
 *    as `changed` rather than being silently inherited.
 *
 * Deliberately EMPTY on upgrade: no line has been answered by anybody, so the
 * honest reading of an upgraded workspace is "every declared share is still an
 * ask", which is exactly what the panel will print.
 */

import {
  LINE_CONSENT_BOUNDS,
  LINE_CONSENT_DEFAULTS,
  LINE_CONSENT_LIMITS,
  LINE_CONSENT_SIDES,
} from './lineConsentRegistry.js';

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

/** Three declared windows, all printed, all clamped, none fitted to the record. */
export function normalizeLineConsentSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    lineConsentAcceptDays: clampInt(
      source.lineConsentAcceptDays,
      LINE_CONSENT_BOUNDS.acceptDays,
      LINE_CONSENT_DEFAULTS.acceptDays,
    ),
    lineConsentAskDueDays: clampInt(
      source.lineConsentAskDueDays,
      LINE_CONSENT_BOUNDS.askDueDays,
      LINE_CONSENT_DEFAULTS.askDueDays,
    ),
    lineConsentAckDays: clampInt(
      source.lineConsentAckDays,
      LINE_CONSENT_BOUNDS.ackDays,
      LINE_CONSENT_DEFAULTS.ackDays,
    ),
  };
}

export const LINE_CONSENT_DEFAULTS_RESOLVED = Object.freeze(normalizeLineConsentSettings({}));

const MANAGER_OUTCOMES = new Set(['accepted', 'declined']);
const PERSON_OUTCOMES = new Set(['acknowledged']);

function normalizeAct(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Line consent: dropped an act that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const declarationId = id(raw.declarationId);
  const personId = id(raw.personId);
  const managerId = id(raw.managerId);
  const side = raw.side === LINE_CONSENT_SIDES.manager || raw.side === LINE_CONSENT_SIDES.person ? raw.side : null;
  const outcome = text(raw.outcome, 20);
  const decidedOn = day(raw.decidedOn);
  if (!rowId || !declarationId || !personId || !managerId || !side || !decidedOn) {
    warnings.push('Line consent: dropped an act missing its line, person, manager, side or date. No consent was inferred.');
    return null;
  }
  if (side === LINE_CONSENT_SIDES.manager && !MANAGER_OUTCOMES.has(outcome)) {
    warnings.push('Line consent: dropped a manager-side act whose outcome was neither accepted nor declined.');
    return null;
  }
  if (side === LINE_CONSENT_SIDES.person && !PERSON_OUTCOMES.has(outcome)) {
    warnings.push('Line consent: dropped a person-side act whose outcome was not an acknowledgement.');
    return null;
  }
  const reason = text(raw.reason, LINE_CONSENT_LIMITS.reasonChars);
  // A refusal must say why. A bare decline is indistinguishable from a typo, and
  // the row would then read as a considered judgement with no thought in it.
  if (outcome === 'declined' && reason.length < 8) {
    warnings.push('Line consent: dropped a declined line with no stated reason; an unexplained refusal is not a record of judgement.');
    return null;
  }
  const expiresOn = outcome === 'accepted' ? day(raw.expiresOn) : null;
  // THE NUMBER THAT WAS ACCEPTED, stored with the act. The declaration is read on
  // every render, so without this a retune from 40% to 90% would silently inherit
  // the old consent. `null` means the line had no declared allocation when the
  // manager answered — the honest reading of a share that was never stated.
  const rawShare = raw.sharePct;
  const sharePct = outcome === 'accepted' && Number.isInteger(rawShare) && rawShare >= 0 && rawShare <= 100
    ? rawShare
    : null;
  // An acceptance with no expiry cannot be distinguished from one nobody
  // revisited — the exact state this module exists to expose. Dropped, not
  // defaulted, at load: a date invented here would be a window no human set.
  if (outcome === 'accepted' && !expiresOn) {
    warnings.push('Line consent: dropped an acceptance with no expiry date. A consent that can never lapse is not a consent this record can stand behind.');
    return null;
  }
  return {
    id: rowId,
    declarationId,
    personId,
    managerId,
    kind: text(raw.kind, 40) || '',
    side,
    outcome,
    decidedOn,
    decidedBySeatId: id(raw.decidedBySeatId),
    // 'seat' means a seated leader gave the answer; 'operator' means the
    // workspace owner captured somebody else's statement. The two are printed
    // differently and never merged into one reassuring word.
    via: raw.via === 'seat' ? 'seat' : 'operator',
    expiresOn,
    sharePct,
    basis: outcome === 'accepted' ? text(raw.basis, LINE_CONSENT_LIMITS.basisChars) : '',
    reason: outcome === 'declined' ? reason : '',
    at: stamp(raw.at) || `${decidedOn}T00:00:00.000Z`,
  };
}

/**
 * Bounded and deduplicated. Two acts are duplicates only when they say the SAME
 * thing on the same day — a manager who accepts, lapses and accepts again on a
 * later date has a real history, and that history is what makes a re-acceptance
 * legible. Identical repeats are dropped because they carry no new information.
 */
export function normalizeLineConsents(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Line consent: the consent ledger was not an array; it was read as empty.');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const row = normalizeAct(raw, warnings);
    if (!row) continue;
    const key = `${row.declarationId}|${row.side}|${row.outcome}|${row.decidedOn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  if (value.length && !out.length) {
    warnings.push('Line consent: this workspace carried consent acts that could not be read; they were dropped rather than repaired.');
  }
  // Oldest first, and the oldest displaced when the cap is met — displacement is
  // printed by the caller that caused it, never silent.
  const sorted = out.sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.id).localeCompare(String(b.id)));
  return sorted.slice(-LINE_CONSENT_LIMITS.decisions);
}

/** The rule's idempotency markers. Bounded, oldest first. */
export function normalizeLineConsentMarkers(value) {
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
      kind: text(raw.kind, 40) || 'obligation',
      summary: text(raw.summary, 280),
      at: stamp(raw.at) || null,
    });
  }
  return out.slice(-LINE_CONSENT_LIMITS.markers);
}
