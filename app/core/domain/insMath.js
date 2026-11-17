/**
 * app/core/domain/insMath.js — the exact integer kernels of the Insurance
 * Notification & Recovery Register (ADR-0249).
 *
 * PURE. No DOM, no storage, no ambient clock, no network, no floating-point money.
 * Every figure this register prints — a notification deadline, days remaining,
 * days over, a policy period check, a recovered total, the derived net cost — is
 * computed here from dated declarations, so the same fixture gives the same answer
 * in a test, in the browser and in an exported file.
 *
 * WHY THE NOTIFICATION DEADLINE IS COMPUTED IN WHOLE DAYS AND NOT IN MONTHS.
 * A notification window is stated in the policy as a number of days ("within 30
 * days of the occurrence", "as soon as practicable and in any event within 90
 * days of the claim"). Converting that to months would invent a convention nobody
 * declared and drift every leap year. The deadline is therefore computed by
 * advancing the trigger day by whole days on the UTC calendar: trigger day + the
 * declared window. The deadline day itself is the LAST day the insurer may be
 * told — a notification on that day is in time.
 *
 * WHY DAYS ARE COUNTED IN UTC. "Days remaining" is a planning figure a human acts
 * on against a calendar. UTC day boundaries mean no DST shift can move a deadline
 * by an hour and no locale can move it by a day. The whole register reads days
 * this way and prints day counts only.
 *
 * WHY MONEY IS INTEGER MINOR UNITS AND NEVER A FLOAT. 0.1 + 0.2 is not 0.3, and a
 * recovery register that prints a net cost which does not equal the gross less
 * the recovered fails the reliability mandate at the first decimal place. Every
 * amount in this register is an integer number of minor units (pence, cents) with
 * a three-letter currency, summed exactly. A fractional minor unit is refused at
 * the door, never rounded into the record.
 *
 * WHY `Math.floor` ON DAYS REMAINING. At 23:59 on the day before the deadline
 * there are ZERO whole days left, not one. Rounding up would manufacture a day of
 * comfort that does not exist; rounding the state away would hide a deadline. The
 * state is exact; the day count only ever counts whole days that have actually
 * completed.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. A bare number is refused: an epoch number in a JSON file is as likely to
 * be a duration as an instant.
 */
export function instantMs(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/** UTC midnight of the day containing `ms`, or null. Accepts a number or an instant. */
export function utcDayMs(value) {
  const ms = typeof value === 'number' && Number.isFinite(value) ? value : instantMs(value);
  if (ms === null) return null;
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** `YYYY-MM-DD` for the UTC day containing `ms`, or null. */
export function utcDayKey(value) {
  const dayMs = utcDayMs(value);
  if (dayMs === null) return null;
  return new Date(dayMs).toISOString().slice(0, 10);
}

/**
 * Whole calendar days from `from` to `to` (positive when `to` is later).
 * Both ends floor to their UTC day first, so 23:59 to 00:01 is ONE day.
 */
export function wholeDaysBetween(from, to) {
  const a = utcDayMs(from);
  const b = utcDayMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Whole minutes elapsed from `fromMs` to `toMs`, floored; negative when earlier. */
export function wholeMinutesBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / MINUTE_MS);
}

/**
 * The notification deadline as epoch ms, derived from the trigger day and the
 * policy's declared window in whole days.
 *
 * The deadline day is the LAST day the insurer may be told: a notification on
 * that day is in time. Returns null when the trigger day or the window cannot be
 * read — and a caller that gets null MUST print its refusal rather than a date:
 * a plausible default here is a missed notification.
 */
export function notificationDeadline({ triggerMs, windowDays }) {
  if (!Number.isFinite(triggerMs) || !Number.isInteger(windowDays) || windowDays < 0) return null;
  const triggerDayMs = utcDayMs(triggerMs);
  if (triggerDayMs === null) return null;
  return triggerDayMs + windowDays * DAY_MS;
}

/**
 * Whether a trigger day falls inside a policy period, both ends inclusive.
 * Returns true, false, or null when either end cannot be read.
 */
export function withinPeriod({ triggerMs, periodStartMs, periodEndMs }) {
  const trigger = utcDayMs(triggerMs);
  const start = utcDayMs(periodStartMs);
  const end = utcDayMs(periodEndMs);
  if (trigger === null || start === null || end === null) return null;
  return trigger >= start && trigger <= end;
}

/**
 * Whole days from `now` to `deadline`, floored. Negative once the deadline has
 * passed. Null when either end cannot be read — and a caller must then print its
 * refusal rather than a zero, because a zero here reads as "today, still time".
 */
export function daysRemaining(nowMs, deadlineMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) return null;
  return wholeDaysBetween(nowMs, deadlineMs);
}

/**
 * Whole days by which the deadline has been overrun, or 0 when it has not.
 * Null when either end is unreadable.
 */
export function daysOver(nowMs, deadlineMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) return null;
  const remaining = wholeDaysBetween(nowMs, deadlineMs);
  if (remaining === null) return null;
  return remaining < 0 ? -remaining : 0;
}

/**
 * Whole days a notification ran over the deadline, or 0 when it was in time.
 * Null when either end is unreadable. A notification ON the deadline day is in
 * time (0); a notification the day after is 1 day over.
 */
export function notificationDaysOver(notifiedMs, deadlineMs) {
  if (!Number.isFinite(notifiedMs) || !Number.isFinite(deadlineMs)) return null;
  const notified = utcDayMs(notifiedMs);
  const deadline = utcDayMs(deadlineMs);
  if (notified === null || deadline === null) return null;
  const over = Math.round((notified - deadline) / DAY_MS);
  return over > 0 ? over : 0;
}

/**
 * An integer amount in minor units, or null. A fractional, negative, non-numeric
 * or non-finite value is refused — never rounded into the record, because a total
 * built from rounded rows is a total that does not equal its parts.
 */
export function minorUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/** An exact sum of integer minor units over rows that carry a readable amount. */
export function sumMinor(rows, pick) {
  let total = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const amount = pick ? pick(row) : row;
    if (Number.isInteger(amount)) total += amount;
  }
  return total;
}

/**
 * The derived net cost: gross exposure less what the insurer actually paid.
 * Both ends must be integers; otherwise null — a net cost computed from an
 * unreadable gross or an unreadable recovery would be a figure nobody can prove.
 * The result is never negative: a recovery above the gross is capped at the
 * gross, because the insurer does not pay more than the loss.
 */
export function netCostMinor({ grossMinor, recoveredMinor }) {
  if (!Number.isInteger(grossMinor) || !Number.isInteger(recoveredMinor)) return null;
  const net = grossMinor - recoveredMinor;
  return net > 0 ? net : 0;
}

/** Minor units for a human to read, in a declared currency. Screen only; CSV never formats. */
export function moneyLabel(minor, currency = 'GBP') {
  if (!Number.isInteger(minor)) return '—';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${currency} ${major.toLocaleString('en-GB')}.${rest}`;
}

/** A signed day offset for a human to read, e.g. "in 12 days", "9 days ago". */
export function dayLabel(days) {
  if (!Number.isInteger(days)) return '—';
  if (days === 0) return 'today';
  const abs = Math.abs(days);
  const unit = abs === 1 ? 'day' : 'days';
  return days > 0 ? `in ${abs} ${unit}` : `${abs} ${unit} ago`;
}

/** A `YYYY-MM-DD` day for a human to read, from epoch ms. */
export function dayKeyLabel(dayMs) {
  return utcDayKey(dayMs) || '—';
}
