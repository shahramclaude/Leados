/**
 * app/core/domain/taxMath.js — the exact integer kernels of the Tax Controversy
 * & Appeal-Control Register (ADR-0257).
 *
 * PURE. No DOM, no storage, no ambient clock, no network, no floating-point
 * money. Every figure this register prints — days remaining, days overdue, the
 * disputed amount, the resolved amount, the swing — is computed here from
 * declared facts, so the same fixture gives the same answer in a test, in the
 * browser and in an exported file.
 *
 * WHY DAYS ARE COUNTED IN UTC. A notice day, a deadline day and a filing day
 * are calendar days. UTC day boundaries mean no DST shift can move a date by an
 * hour and no locale can move it by a day. Timeliness is a comparison of two
 * declared days, never a duration a clock could drift.
 *
 * WHY THE SWING IS AN EXACT SUBTRACTION AND NEVER A RATE. The swing is disputed
 * less resolved, in whole minor units of one currency. A rate would need a base
 * this record does not hold, and a percentage of a disputed amount is a figure
 * that can be made to say anything. The register prints the exact difference
 * beside both figures and lets the reader judge it.
 *
 * WHY MONEY IS INTEGER MINOR UNITS AND NEVER A FLOAT. 0.1 + 0.2 is not 0.3, and
 * a controversy schedule that prints a total which does not equal the sum of
 * its rows fails the reliability mandate at the first decimal place. Every
 * amount is an integer number of minor units with a three-letter currency.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. A bare number is refused: an epoch number in a JSON file is as likely
 * to be a duration as an instant.
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

/** UTC midnight of the day containing `ms`, or null. */
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

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function wholeDaysBetween(from, to) {
  const a = utcDayMs(from);
  const b = utcDayMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * An integer amount in minor units, or null. A fractional, negative, non-numeric
 * or non-finite value is refused — never rounded into the record, because a
 * total built from rounded rows is a total that does not equal its parts.
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
 * The swing: disputed less resolved, in whole minor units.
 *
 * Returns `{ swingMinor, reason }`. `swingMinor` is null when either figure is
 * unreadable — a caller must then print the absence, never a zero that reads as
 * "the controversy moved nothing". A positive swing is value recovered against
 * the assessment; a negative swing is an amount finally payable above what was
 * disputed (interest, penalties or a partial upholding above the notice).
 */
export function swingMinor({ disputedMinor, resolvedMinor }) {
  if (!Number.isInteger(disputedMinor) || !Number.isInteger(resolvedMinor)) {
    return { swingMinor: null, reason: 'Either the disputed amount or the resolved amount is unreadable, so no swing can be printed.' };
  }
  return { swingMinor: disputedMinor - resolvedMinor, reason: null };
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
