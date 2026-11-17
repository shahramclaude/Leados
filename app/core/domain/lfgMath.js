/**
 * app/core/domain/lfgMath.js — the exact integer kernels of the Claim, Limitation &
 * Settlement-Authority Register (ADR-0248).
 *
 * PURE. No DOM, no storage, no ambient clock, no network, no floating-point money.
 * Every figure this register prints — a deadline, days remaining, days over, a
 * suspension span, a paid total, the authority gap — is computed here from dated
 * declarations, so the same fixture gives the same answer in a test, in the browser
 * and in an exported file.
 *
 * WHY THE LIMITATION DEADLINE IS COMPUTED IN CALENDAR MONTHS AND NOT IN DAYS.
 * A limitation period is stated in the statute as a period of years or months ("six
 * years from the date on which the cause of action accrued", "three months less one
 * day"). Converting that to days is wrong twice over: it invents a convention nobody
 * declared, and it drifts every leap year. The deadline is therefore computed by
 * advancing the accrual day by whole months on the UTC calendar, with the
 * end-of-month clamp that the ordinary rule requires: a period of one month from
 * 31 January ends on 28 February (29 in a leap year), not on 3 March.
 *
 * WHY DAYS ARE COUNTED IN UTC. "Days remaining" is a planning figure a human acts on
 * against a calendar. UTC day boundaries mean no DST shift can move a deadline by an
 * hour and no locale can move it by a day. The whole register reads days this way and
 * prints day counts only.
 *
 * WHY MONEY IS INTEGER MINOR UNITS AND NEVER A FLOAT. 0.1 + 0.2 is not 0.3, and a
 * settlement register that prints a total which does not equal the sum of its own
 * rows fails the reliability mandate at the first decimal place. Every amount in this
 * register is an integer number of minor units (pence, cents) with a three-letter
 * currency, summed exactly. A fractional minor unit is refused at the door, never
 * rounded into the record.
 *
 * WHY `Math.floor` ON DAYS REMAINING. At 23:59 on the day before the deadline there
 * are ZERO whole days left, not one. Rounding up would manufacture a day of comfort
 * that does not exist; rounding the state away would hide a deadline. The state is
 * exact; the day count only ever counts whole days that have actually completed.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. A bare number is refused: an epoch number in a JSON file is as likely to be
 * a duration as an instant.
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

/** Days in the UTC month `0`-indexed `month` of `year`. */
export function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * The UTC day `months` whole months after the UTC day containing `value`, with the
 * end-of-month clamp: 31 January + 1 month = 28 February (29 in a leap year).
 * A negative `months` goes backwards with the same clamp. Returns null on bad input.
 */
export function addMonthsUtc(value, months) {
  const dayMs = utcDayMs(value);
  if (dayMs === null || !Number.isInteger(months)) return null;
  const date = new Date(dayMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = month + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInUtcMonth(targetYear, targetMonth));
  return Date.UTC(targetYear, targetMonth, clampedDay);
}

/**
 * The limitation deadline as epoch ms, derived from the accrual day, the declared
 * period in whole months and every PROVED suspension span.
 *
 * `stays` is an array of `{ fromMs, toMs }` already reduced to proved rows by the
 * reader; this function does no judging of its own. Overlapping spans are merged
 * before summing, because two concurrent stays do not suspend the clock twice.
 *
 * Returns `{ deadlineMs, baseDeadlineMs, suspendedDays, mergedSpans }` or null when
 * the accrual or the period cannot be read. A caller that gets null MUST print its
 * refusal rather than a date: a plausible default here is a missed deadline.
 */
export function limitationDeadline({ accrualMs, periodMonths, stays = [] }) {
  if (!Number.isFinite(accrualMs) || !Number.isInteger(periodMonths) || periodMonths <= 0) return null;
  const baseDeadlineMs = addMonthsUtc(accrualMs, periodMonths);
  if (baseDeadlineMs === null) return null;

  const spans = (Array.isArray(stays) ? stays : [])
    .map((span) => ({ fromMs: utcDayMs(span?.fromMs), toMs: utcDayMs(span?.toMs) }))
    .filter((span) => Number.isFinite(span.fromMs) && Number.isFinite(span.toMs) && span.toMs >= span.fromMs)
    .map((span) => ({ fromMs: span.fromMs, toMs: span.toMs }))
    .sort((a, b) => a.fromMs - b.fromMs || a.toMs - b.toMs);

  // Merge overlapping or touching spans. Two concurrent stays are ONE suspension of
  // the clock, and counting them twice would manufacture validity the record does not
  // support.
  const mergedSpans = [];
  for (const span of spans) {
    const last = mergedSpans[mergedSpans.length - 1];
    if (last && span.fromMs <= last.toMs) {
      last.toMs = Math.max(last.toMs, span.toMs);
      continue;
    }
    mergedSpans.push({ ...span });
  }

  let suspendedDays = 0;
  for (const span of mergedSpans) {
    // Both ends inclusive: a stay whose instrument says "from 1 March to 30 April"
    // suspends 61 days, not 60.
    suspendedDays += Math.round((span.toMs - span.fromMs) / DAY_MS) + 1;
  }

  return {
    baseDeadlineMs,
    deadlineMs: baseDeadlineMs + suspendedDays * DAY_MS,
    suspendedDays,
    mergedSpans,
  };
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

/** Whole days a stay span covers, inclusive of both ends, or null. */
export function staySpanDays(fromMs, toMs) {
  const a = utcDayMs(fromMs);
  const b = utcDayMs(toMs);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * An integer amount in minor units, or null. A fractional, negative, non-numeric or
 * non-finite value is refused — never rounded into the record, because a total built
 * from rounded rows is a total that does not equal its parts.
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
