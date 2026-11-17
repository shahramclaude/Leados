/**
 * app/core/domain/voiceMath.js — the exact integer kernels of the Employee Voice &
 * Collective Consultation Register (ADR-0243).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints about a consultation window, a late advice, a late minute or a
 * reply is a whole number of DAYS computed here from two day keys, so the same
 * fixture gives the same answer in a test, in the browser and in an exported file.
 *
 * WHY WHOLE DAYS AND NOT HOURS. A consultation period is declared, lived and
 * defended in days: "you were given ten days and decided on the fourth" is the
 * sentence a tribunal, a works council or a board can act on. An hour-resolution
 * figure would invite an argument about the clock of the day the item was put,
 * which is exactly the ambiguity a consultation record exists to remove.
 *
 * THE THREE KERNELS:
 *   1. `windowClosesOn` — the last day of the period the body was given.
 *   2. `earlyDays` — how many days BEFORE that close a decision was taken. This
 *      is the breach figure, and it is never negative: a decision on the close day
 *      or later is in time and returns 0.
 *   3. `lateDays` — how many days AFTER a due day an act arrived. Used for late
 *      advice and late minutes, both of which stay printed permanently.
 *
 * The rounding rule is the same one the rest of this workspace uses: a span is
 * floored, so a system never claims a day that has not finished. A lateness of
 * zero is printed as zero rather than as "on time", because the two are different
 * claims and the screen says which.
 */

import { addDays, daysBetween, dayKey } from '../time.js';

/** A stored day key, normalised, or null. Never a partial date. */
export function voiceDay(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const key = dayKey(raw);
  return key === raw ? key : null;
}

/**
 * The last day of the declared period. A window of `n` days opened on day D
 * closes on D + n: the body is entitled to the whole of that day, and a decision
 * taken on it is in time. Nothing here rounds, and an unreadable input returns
 * null so the caller prints a refusal rather than a plausible deadline.
 */
export function windowClosesOn(openedOn, windowDays) {
  const opened = voiceDay(openedOn);
  if (!opened || !Number.isInteger(windowDays) || windowDays < 1) return null;
  return addDays(opened, windowDays);
}

/** Whole days remaining until the window closes; negative once it has passed. */
export function daysToClose(nowDay, closesOn) {
  const now = voiceDay(nowDay);
  const close = voiceDay(closesOn);
  if (!now || !close) return null;
  return daysBetween(now, close);
}

/**
 * How many days EARLY a decision preceded the close of the window, or 0.
 *
 * A decision on the closing day is in time (0). A decision the day before the
 * close is one day early. This is the breach figure the register exists to print,
 * and it is deliberately one-directional: being late to decide is not a breach of
 * the duty to consult, so nothing is returned for it.
 */
export function earlyDays(decidedOn, closesOn) {
  const decided = voiceDay(decidedOn);
  const close = voiceDay(closesOn);
  if (!decided || !close) return null;
  const delta = daysBetween(close, decided);
  return delta !== null && delta < 0 ? -delta : 0;
}

/** How many days AFTER a due day an act arrived, or 0. Never negative. */
export function lateDays(actOn, dueOn) {
  const act = voiceDay(actOn);
  const due = voiceDay(dueOn);
  if (!act || !due) return null;
  const delta = daysBetween(due, act);
  return delta !== null && delta > 0 ? delta : 0;
}

/** The day the minutes of a sitting are due, from the sitting day and the convention. */
export function minutesDueOn(sittingOn, minutesDueDays) {
  const on = voiceDay(sittingOn);
  if (!on || !Number.isInteger(minutesDueDays) || minutesDueDays < 0) return null;
  return addDays(on, minutesDueDays);
}

/** The day the organisation's written reply to advice is due. */
export function replyDueOn(receivedOn, replyDays) {
  const on = voiceDay(receivedOn);
  if (!on || !Number.isInteger(replyDays) || replyDays < 0) return null;
  return addDays(on, replyDays);
}

/**
 * Did an act's day fall inside a declared term? Inclusive at both ends, because a
 * representative's term ends at the close of the day it names — the alternative
 * would silently disenfranchise the body on its last day.
 */
export function withinTerm(day, startOn, endOn) {
  const at = voiceDay(day);
  const start = voiceDay(startOn);
  const end = endOn === null || endOn === undefined ? null : voiceDay(endOn);
  if (!at || !start) return false;
  if (daysBetween(start, at) < 0) return false;
  if (end && daysBetween(at, end) < 0) return false;
  return true;
}

/**
 * How many members a sitting had, counting representatives and the chair but NOT
 * observers. An observer reads; they do not make a body quorate, and counting
 * them would let a sitting transact on people the constitution did not give a say.
 */
export function quorateAttendance(presentIds, members, sittingOn) {
  const present = new Set((Array.isArray(presentIds) ? presentIds : []).map(String));
  const live = (Array.isArray(members) ? members : []).filter((row) => row
    && row.role !== 'observer'
    && withinTerm(sittingOn, row.termStart, row.termEnd));
  const count = live.filter((row) => present.has(String(row.id))).length;
  return { count, liveCount: live.length };
}
