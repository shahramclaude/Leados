/**
 * app/core/domain/psrMath.js — exact date, instant and strict-integer
 * arithmetic for the Pre-Startup Safety Review Register (ADR-0258).
 *
 * Every boundary refuses coercion: blanks, nulls, booleans, arrays, hex
 * strings, floats and overflowing calendar dates (such as `2026-02-29`) return
 * `null` rather than turning into zero or rolling into the next month.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DECIMAL_INT_RE = /^(?:0|[1-9]\d*)$/;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Parse an exact non-negative decimal integer from a number or trimmed decimal
 * string. Rejects blanks, null, undefined, booleans, objects, floats, negative
 * numbers, leading zeros and non-decimal prefixes (`0x10`, `1e2`).
 */
export function strictWholeInt(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!DECIMAL_INT_RE.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parse a strict `YYYY-MM-DD` calendar day into UTC midnight milliseconds,
 * verifying round-trip equality so `2026-02-29` and `2026-13-01` return `null`.
 */
export function utcDayMs(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!DAY_RE.test(trimmed)) return null;
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString().slice(0, 10) !== trimmed) return null;
  return ms;
}

/**
 * Parse an explicit ISO-8601 instant string (with time and explicit UTC/offset
 * zone) into epoch milliseconds. Bare numbers and date-only strings return
 * `null` so an untyped value is never guessed as a timestamp.
 */
export function instantMs(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_INSTANT_RE.test(trimmed)) return null;
  const datePart = trimmed.slice(0, 10);
  if (utcDayMs(datePart) === null) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Signed exact whole UTC calendar days `toDay - fromDay`. Positive when `toDay`
 * is after `fromDay`, zero on the same day, negative when `toDay` precedes
 * `fromDay`, or `null` if either day is invalid.
 */
export function wholeDaysBetween(fromDay, toDay) {
  const fromMs = utcDayMs(fromDay);
  const toMs = utcDayMs(toDay);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

/**
 * Signed floored whole minutes `toIso - fromIso` (truncating toward zero so 39
 * seconds is 0 minutes, never rounded up to 1). Returns `null` if either
 * instant is invalid.
 */
export function wholeMinutesBetween(fromIso, toIso) {
  const fromMs = instantMs(fromIso);
  const toMs = instantMs(toIso);
  if (fromMs === null || toMs === null) return null;
  const delta = toMs - fromMs;
  if (delta >= 0) return Math.floor(delta / MS_PER_MINUTE);
  return -Math.floor((-delta) / MS_PER_MINUTE);
}

/** Human-readable signed day countdown/overrun label from exact integer days. */
export function dayWindowLabel(days, { overdueSuffix = 'd overdue', dueToday = 'due today', remainingSuffix = 'd left' } = {}) {
  if (!Number.isInteger(days)) return '—';
  if (days < 0) return `${-days}${overdueSuffix}`;
  if (days === 0) return dueToday;
  return `${days}${remainingSuffix}`;
}
