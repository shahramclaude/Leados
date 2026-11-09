/**
 * app/core/domain/reviewStewardshipSchema.js — fail-closed normalizers for Matrix
 * Multi-Line Review Stewardship (ADR-0147, Schema v122).
 *
 * WHAT IS STORED, AND WHERE
 * -------------------------
 * Nothing new at the top level. Two arrays live on the EXISTING review row under
 * `stewardship`, because a request and an answer are about one review and must
 * freeze with it at completion:
 *
 *   stewardship.requests[]  { id, lineKey, lineRole, lineKind, managerId,
 *                             askedOn, askedBySeatId, dueOn, note }
 *   stewardship.answers[]   { id, lineKey, lineManagerId, outcome, answeredOn,
 *                             answeredBySeatId, text, reason }
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a line state, a verdict, an overdue flag or a count. Every one is DERIVED
 *    on read from the declarations, the stored asks and the stored answers, so a
 *    printed state cannot drift from the record that produced it.
 *  - an assessor. Who holds `performance` is read from the matrix lines every
 *    time; copying it onto the review would let a later re-declaration go
 *    unnoticed by an already-completed packet.
 *  - a contribution share, a rating, or a copy of another module's record.
 *
 * A malformed row is DROPPED with a printed warning, never repaired: an answer
 * invented at load time is words nobody said, and a request invented at load time
 * would print as a promise somebody made.
 */

import {
  REVIEW_STEWARDSHIP_BOUNDS,
  REVIEW_STEWARDSHIP_DEFAULTS,
  REVIEW_STEWARDSHIP_LIMITS,
} from './reviewStewardshipRegistry.js';

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
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The declared conventions. Both printed, both clamped, neither fitted. */
export function normalizeReviewStewardshipSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    reviewStewardshipAnswerDays: clampInt(
      source.reviewStewardshipAnswerDays,
      REVIEW_STEWARDSHIP_BOUNDS.answerDays,
      REVIEW_STEWARDSHIP_DEFAULTS.answerDays,
    ),
    reviewStewardshipBoardFirst: source.reviewStewardshipBoardFirst !== false,
  };
}

export const REVIEW_STEWARDSHIP_DEFAULTS_RESOLVED = Object.freeze(normalizeReviewStewardshipSettings({}));

function normalizeRequest(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Review stewardship: dropped an ask that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const lineKey = id(raw.lineKey);
  const managerId = id(raw.managerId);
  const askedOn = day(raw.askedOn);
  if (!rowId || !lineKey || !managerId || !askedOn) {
    warnings.push('Review stewardship: dropped an ask missing its line, manager or date. No request was inferred.');
    return null;
  }
  return {
    id: rowId,
    lineKey,
    lineRole: raw.lineRole === 'primary' ? 'primary' : 'secondary',
    lineKind: text(raw.lineKind, 40) || '',
    managerId,
    askedOn,
    askedBySeatId: id(raw.askedBySeatId),
    dueOn: day(raw.dueOn) || null,
    note: text(raw.note, REVIEW_STEWARDSHIP_LIMITS.noteChars),
  };
}

function normalizeAnswer(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Review stewardship: dropped an answer that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const lineKey = id(raw.lineKey);
  const outcome = raw.outcome === 'declined' ? 'declined' : raw.outcome === 'input' ? 'input' : null;
  const answeredOn = day(raw.answeredOn);
  if (!rowId || !lineKey || !outcome || !answeredOn) {
    warnings.push('Review stewardship: dropped an answer missing its line, outcome or date. No answer was inferred.');
    return null;
  }
  const body = text(raw.text, REVIEW_STEWARDSHIP_LIMITS.answerChars);
  const reason = text(raw.reason, REVIEW_STEWARDSHIP_LIMITS.reasonChars);
  // A line holder may decline, but must say why — a bare refusal is indistinguishable
  // from a bug, and the record would then read as "considered and dismissed" with
  // no thought behind it. The action refuses this too; here it is dropped at load.
  if (outcome === 'declined' && reason.length < 8) {
    warnings.push('Review stewardship: dropped a decline with no stated reason; an unexplained refusal is not a record of judgement.');
    return null;
  }
  if (outcome === 'input' && body.length < 8) {
    warnings.push('Review stewardship: dropped line input shorter than a sentence.');
    return null;
  }
  return {
    id: rowId,
    lineKey,
    lineManagerId: id(raw.lineManagerId),
    outcome,
    answeredOn,
    answeredBySeatId: id(raw.answeredBySeatId),
    text: body,
    reason,
  };
}

/** Bounded, deduplicated by (lineKey, first-wins) so a hand-edited file cannot double a line. */
export function normalizeReviewStewardship(value, warnings = []) {
  const source = isPlainObject(value) ? value : {};
  const requests = [];
  const reqSeen = new Set();
  for (const raw of Array.isArray(source.requests) ? source.requests : []) {
    const row = normalizeRequest(raw, warnings);
    if (!row) continue;
    const key = `${row.lineKey}|${row.askedOn}`;
    if (reqSeen.has(key)) continue;
    reqSeen.add(key);
    requests.push(row);
    if (requests.length >= REVIEW_STEWARDSHIP_LIMITS.requests) break;
  }
  const answers = [];
  const answerSeen = new Set();
  for (const raw of Array.isArray(source.answers) ? source.answers : []) {
    const row = normalizeAnswer(raw, warnings);
    if (!row) continue;
    // First answer per line wins. A second would make "who said what"
    // unfalsifiable, and an answer can only be withdrawn through a new ask.
    if (answerSeen.has(row.lineKey)) continue;
    answerSeen.add(row.lineKey);
    answers.push(row);
    if (answers.length >= REVIEW_STEWARDSHIP_LIMITS.answers) break;
  }
  if (Array.isArray(source.requests) && source.requests.length && !requests.length) {
    warnings.push('Review stewardship: this review carried asks that could not be read; they were dropped rather than repaired.');
  }
  return { requests, answers };
}
