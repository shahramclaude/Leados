/**
 * app/core/domain/lineReaffirmationSchema.js — fail-closed normalizers for the
 * Matrix Line Re-Affirmation Register (ADR-0157, Schema v129).
 *
 * WHAT IS STORED
 * --------------
 * `lineReaffirmations` — one row per dated human act on one declared line:
 *
 *   { id, declarationId, personId, managerId, kind,
 *     side: 'manager' | 'person',
 *     outcome: 'reaffirm' | 'release' | 'accept' | 'object',
 *     decidedOn, decidedBySeatId, via,
 *     termEndsOn,        // manager reassign only: the term this answer sets
 *     sharePct,          // manager reassign only: the share this answer was for
 *     basis,             // manager reassign only: what the line is on the hook for
 *     reason,            // release / object only: the stated words
 *     at }
 *
 * `lineReaffirmationMarkers` — RULE-LRF-01's idempotency ledger.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a line state, a verdict, a day count, a warning flag or a total. Every one
 *    is DERIVED on read from these acts plus the live matrix, so a printed state
 *    cannot drift from the act that produced it.
 *  - an implied renewal. A row must name its side, its outcome and its day; one
 *    that does not is DROPPED with a printed warning, never repaired. A renewal
 *    invented at load time is an agreement nobody gave — the exact failure this
 *    module exists to name.
 *  - the CURRENT share. What the row holds is the share that was ANSWERED, on the
 *    day it was answered. The live declaration is read on every render, so a
 *    retune afterwards shows as `changed-share` instead of silently inheriting
 *    the older answer.
 *
 * Deliberately EMPTY on upgrade: no line has been re-affirmed by anybody, so the
 * honest reading of an upgraded workspace is `no-term` on every line in force —
 * which is exactly what the panel prints, and never a fabricated in-term.
 */

import {
  LINE_REAFFIRMATION_BOUNDS,
  LINE_REAFFIRMATION_DEFAULTS,
  LINE_REAFFIRMATION_LIMITS,
  LINE_REAFFIRMATION_MANAGER_OUTCOMES,
  LINE_REAFFIRMATION_PERSON_OUTCOMES,
  LINE_REAFFIRMATION_SIDES,
} from './lineReaffirmationRegistry.js';

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
export function normalizeLineReaffirmationSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    lineReaffirmTermDays: clampInt(
      source.lineReaffirmTermDays,
      LINE_REAFFIRMATION_BOUNDS.termDays,
      LINE_REAFFIRMATION_DEFAULTS.termDays,
    ),
    lineReaffirmWarnDays: clampInt(
      source.lineReaffirmWarnDays,
      LINE_REAFFIRMATION_BOUNDS.warnDays,
      LINE_REAFFIRMATION_DEFAULTS.warnDays,
    ),
    lineReaffirmAskDueDays: clampInt(
      source.lineReaffirmAskDueDays,
      LINE_REAFFIRMATION_BOUNDS.askDueDays,
      LINE_REAFFIRMATION_DEFAULTS.askDueDays,
    ),
  };
}

export const LINE_REAFFIRMATION_DEFAULTS_RESOLVED = Object.freeze(normalizeLineReaffirmationSettings({}));

const MANAGER_OUTCOMES = new Set(LINE_REAFFIRMATION_MANAGER_OUTCOMES);
const PERSON_OUTCOMES = new Set(LINE_REAFFIRMATION_PERSON_OUTCOMES);

function normalizeAct(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Line re-affirmation: dropped an answer that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const declarationId = id(raw.declarationId);
  const personId = id(raw.personId);
  const managerId = id(raw.managerId);
  const side = raw.side === LINE_REAFFIRMATION_SIDES.manager || raw.side === LINE_REAFFIRMATION_SIDES.person ? raw.side : null;
  const outcome = text(raw.outcome, 20);
  const decidedOn = day(raw.decidedOn);
  if (!rowId || !declarationId || !personId || !managerId || !side || !decidedOn) {
    warnings.push('Line re-affirmation: dropped an answer missing its line, person, manager, side or date. No renewal was inferred.');
    return null;
  }
  if (side === LINE_REAFFIRMATION_SIDES.manager && !MANAGER_OUTCOMES.has(outcome)) {
    warnings.push('Line re-affirmation: dropped a line-side answer whose outcome was neither a re-affirmation nor a release.');
    return null;
  }
  if (side === LINE_REAFFIRMATION_SIDES.person && !PERSON_OUTCOMES.has(outcome)) {
    warnings.push('Line re-affirmation: dropped a person-side answer whose outcome was neither an acceptance nor an objection.');
    return null;
  }

  const reason = text(raw.reason, LINE_REAFFIRMATION_LIMITS.reasonChars);
  // A release or an objection must say why. A bare one is indistinguishable from
  // a typo, and the row would then read as a considered judgement with no thought
  // in it — the same rule ADR-0148 applies to a declined line.
  if ((outcome === 'release' || outcome === 'object') && reason.length < LINE_REAFFIRMATION_LIMITS.minReason) {
    warnings.push('Line re-affirmation: dropped a refusal with no stated reason; an unexplained release or objection is not a record of judgement.');
    return null;
  }

  // THE TERM THIS ANSWER SETS, stored with the act. Only a re-affirmation sets
  // one. `null` means the answer sets no term — the honest reading of a release
  // or of a person's answer, neither of which grants anything.
  const termEndsOn = outcome === 'reaffirm' ? day(raw.termEndsOn) : null;
  if (outcome === 'reaffirm' && !termEndsOn) {
    warnings.push('Line re-affirmation: dropped a re-affirmation with no term end. A renewal with no end date cannot be distinguished from one nobody revisited — the state this module exists to expose.');
    return null;
  }
  if (outcome === 'reaffirm' && termEndsOn < decidedOn) {
    warnings.push('Line re-affirmation: dropped a re-affirmation whose term ends before the day it was given.');
    return null;
  }

  // THE SHARE THAT WAS ANSWERED. Stored so a later retune shows as
  // `changed-share` rather than inheriting agreement nobody restated.
  const rawShare = raw.sharePct;
  const sharePct = outcome === 'reaffirm' && Number.isInteger(rawShare) && rawShare >= 0 && rawShare <= 100
    ? rawShare
    : null;

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
    termEndsOn,
    sharePct,
    basis: outcome === 'reaffirm' ? text(raw.basis, LINE_REAFFIRMATION_LIMITS.basisChars) : '',
    reason: (outcome === 'release' || outcome === 'object') ? reason : '',
    at: stamp(raw.at) || `${decidedOn}T00:00:00.000Z`,
  };
}

/**
 * Bounded and deduplicated. Two answers are duplicates only when they say the
 * SAME thing on the same day — a line that lapsed, was re-affirmed and lapsed
 * again has a real history, and that history is what makes an inheritance
 * legible. Identical repeats are dropped because they carry no new information.
 */
export function normalizeLineReaffirmations(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Line re-affirmation: the answer ledger was not an array; it was read as empty.');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const row = normalizeAct(raw, warnings);
    if (!row) continue;
    const key = `${row.declarationId}|${row.side}|${row.outcome}|${row.decidedOn}|${row.termEndsOn || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  if (value.length && !out.length) {
    warnings.push('Line re-affirmation: this workspace carried answers that could not be read; they were dropped rather than repaired.');
  }
  const sorted = out.sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.id).localeCompare(String(b.id)));
  return sorted.slice(-LINE_REAFFIRMATION_LIMITS.acts);
}

/** The rule's idempotency markers. Bounded, oldest first. */
export function normalizeLineReaffirmationMarkers(value) {
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
  return out.slice(-LINE_REAFFIRMATION_LIMITS.markers);
}
