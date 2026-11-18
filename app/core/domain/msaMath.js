/**
 * app/core/domain/msaMath.js — the exact integer kernels of the Modern Slavery
 * & Supply-Chain Due-Diligence Statement Register (ADR-0260).
 *
 * PURE. No DOM, no storage, no ambient clock, no network, no floating-point
 * arithmetic. Every day count this register prints — days to the publication
 * deadline, days overdue, the assessment age — is computed here from declared
 * calendar days, so the same fixture gives the same answer in a test, in the
 * browser and in an exported file.
 *
 * WHY DAYS ARE COUNTED IN UTC. A financial-year end, a declared deadline and a
 * published day are calendar days. UTC day boundaries mean no DST shift can
 * move a date by an hour and no locale can move it by a day. Timeliness is a
 * comparison of two declared days, never a duration a clock could drift.
 *
 * WHY THERE IS NO MONEY KERNEL HERE. Remediation is recorded as acts with
 * evidence references, not amounts: a fee repayment figure is a fact inside the
 * payment evidence, and a register that totals remediation money would be
 * re-issuing financial statements this workspace carries elsewhere. The
 * integers here are whole days and whole counts, and a count is never fractional
 * because every row behind it is one dated act.
 */

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
 * An integer count, or null. A fractional, negative, non-numeric or non-finite
 * value is refused — never rounded into the record, because a total built from
 * rounded rows is a total that does not equal its parts.
 */
export function wholeCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/** A signed day offset for a human to read, e.g. "in 12 days", "9 days ago". */
export function dayLabel(days) {
  if (!Number.isInteger(days)) return '—';
  if (days === 0) return 'today';
  const abs = Math.abs(days);
  const unit = abs === 1 ? 'day' : 'days';
  return days > 0 ? `in ${abs} ${unit}` : `${abs} ${unit} ago`;
}
