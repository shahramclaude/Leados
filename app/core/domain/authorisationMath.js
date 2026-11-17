/**
 * app/core/domain/authorisationMath.js — the exact integer kernels of the
 * Statutory Authorisation & Licence-to-Operate Register (ADR-0247).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints about lapse, lead time and evidence age is a whole number
 * computed here from two instants, so the same fixture gives the same answer in a
 * test, in the browser and in an exported file.
 *
 * TWO DIFFERENT UNITS, DELIBERATELY.
 *
 *   - An authority is IN FORCE or LAPSED at an exact INSTANT. `expiresAt` is the
 *     last instant at which the authority is in force, and the half-open interval
 *     is the rule: at exactly `expiresAt` the authority has lapsed. There is no
 *     rounding here at all.
 *   - A renewal WINDOW and a CONDITION re-evidence window are measured in whole
 *     calendar DAYS (UTC), because "renew ninety days before expiry" and "re-evidence
 *     every forty-five days" are obligations a human plans against a calendar, not
 *     a clock. Day boundaries are UTC so no DST shift can move a deadline.
 *
 * WHY `Math.floor` ON LAPSED MINUTES. At forty seconds past expiry the register
 * says ZERO whole minutes — the authorisation has lapsed, and no whole minute has
 * yet finished. Rounding up would manufacture urgency; rounding the state away
 * would hide a lapse. Both are the same class of lie. The state is exact; the
 * minute count only ever counts minutes that have completed.
 */

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. Nothing is coerced from a bare number: an epoch number in a JSON file is
 * as likely to be a duration as an instant.
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
  // A finite NUMBER is epoch milliseconds, and is accepted here because every
  // caller inside this module already holds instants as numbers. `instantMs`
  // deliberately refuses bare numbers (an epoch in a JSON file is as likely to be
  // a duration), so the numeric path is explicit and confined to this helper.
  const ms = typeof value === 'number' && Number.isFinite(value) ? value : instantMs(value);
  if (ms === null) return null;
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Whole calendar days from `from` to `to` (positive when `to` is later).
 * Both ends are floored to their UTC day first, so 23:59 to 00:01 is ONE day,
 * which is what a human means by "tomorrow".
 */
export function wholeDaysBetween(from, to) {
  const a = utcDayMs(from);
  const b = utcDayMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Whole minutes elapsed from `fromMs` to `toMs`, floored; negative if `to` is earlier. */
export function wholeMinutesBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / MINUTE_MS);
}

/**
 * Exact whole minutes an authority has been lapsed, or 0 when it is not lapsed.
 * Returns null only when the expiry cannot be computed — and a caller that cannot
 * compute a lapse must print its refusal rather than a zero, because a zero here
 * reads as "in force".
 */
export function lapsedMinutes(nowMs, expiresMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return null;
  if (nowMs <= expiresMs) return 0;
  return Math.floor((nowMs - expiresMs) / MINUTE_MS);
}

/** Days to expiry (negative once lapsed), or null. Used for the renewal window. */
export function daysToExpiry(nowMs, expiresMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return null;
  return wholeDaysBetween(nowMs, expiresMs);
}

/**
 * The instant a renewal window opens: expiry minus the declared lead time.
 * A lead of 0 means the window opens ON the expiry instant, which is a legitimate
 * (if unwise) declaration and is stored as such rather than defaulted.
 */
export function renewalWindowOpensMs(expiresMs, leadDays) {
  if (!Number.isFinite(expiresMs) || !Number.isInteger(leadDays) || leadDays < 0) return null;
  return expiresMs - leadDays * DAY_MS;
}

/** Whole days of declared validity between grant and expiry, or null when reversed. */
export function declaredSpanDays(grantedMs, expiresMs) {
  if (!Number.isFinite(grantedMs) || !Number.isFinite(expiresMs)) return null;
  if (expiresMs <= grantedMs) return null;
  return wholeDaysBetween(grantedMs, expiresMs);
}

/** Whole minutes from `fromMs` to `toMs`, for an action’s exact window. */
export function spanMinutes(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (toMs <= fromMs) return null;
  return Math.floor((toMs - fromMs) / MINUTE_MS);
}

/**
 * A duration for a human to read, from whole minutes. Used by the screen only;
 * the CSV never formats anything.
 */
export function durationLabel(minutes) {
  if (!Number.isInteger(minutes)) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(minutes / 1440);
  const rest = minutes % 1440;
  return rest ? `${days} d ${Math.floor(rest / 60)} h` : `${days} d`;
}

/** A signed day offset for a human to read, e.g. "in 12 days", "9 days ago". */
export function dayLabel(days) {
  if (!Number.isInteger(days)) return '—';
  if (days === 0) return 'today';
  const abs = Math.abs(days);
  const unit = abs === 1 ? 'day' : 'days';
  return days > 0 ? `in ${abs} ${unit}` : `${abs} ${unit} ago`;
}
