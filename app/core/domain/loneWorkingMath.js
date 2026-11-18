/**
 * app/core/domain/loneWorkingMath.js — the exact integer kernels of the
 * Lone-Working Welfare Check Register (ADR-0242).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints about lateness, overrun or overlap is a whole number of minutes
 * computed here from two instants, so the same fixture gives the same answer in a
 * test, in the browser and in an exported file.
 *
 * WHY WHOLE MINUTES AND NOT HOURS OR A PERCENTAGE. A welfare deadline is read by
 * a human under pressure: "eleven minutes past" is actionable, "0.18 of an hour"
 * is not. `Math.floor` is deliberate and is the one rounding rule in the file: at
 * nine minutes and fifty-nine seconds past the deadline the register says NINE
 * minutes, because a system that rounds a lateness UP manufactures urgency and a
 * system that rounds it DOWN to zero hides a breach. Both are the same class of
 * lie; flooring a positive elapsed span is the only choice that never claims a
 * minute that has not finished.
 *
 * THE FOUR KERNELS:
 *   1. `deadlineMs` / `graceDeadlineMs` — the two instants the supervisor
 *      actually works to, derived from the LAST CONTACT (or the declared start
 *      when there has been none) and the DECLARED interval and grace.
 *   2. `latenessMinutes` — exact minutes past the grace deadline, or 0.
 *   3. `overrunMinutes` — exact minutes past the declared end, or 0.
 *   4. `overlapMinutes` — exact overlap of two declared spans, used at the door
 *      to refuse one person being declared alone in two places at once.
 */

export const MINUTE_MS = 60_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. Nothing is coerced from a bare number: an epoch number in a JSON file is
 * as likely to be a duration as an instant, and guessing which would put a
 * manufactured deadline on the record.
 */
export function instantMs(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw.length === 24 && raw.endsWith('Z')) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) && new Date(ms).toISOString() === raw ? ms : null;
  }
  // The forms declare UTC. A zone-less datetime-local value is UTC, never the
  // machine's timezone. Verify the wall time before applying an explicit offset:
  // Date.parse alone can normalize impossible dates and truncate sub-ms input.
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(raw);
  if (!match) return null;
  const wall = `${match[1]}:${match[2] || '00'}`;
  const wallMs = Date.parse(`${wall}Z`);
  if (!Number.isFinite(wallMs) || new Date(wallMs).toISOString().slice(0, 19) !== wall) return null;
  const time = Date.parse(`${wall}${match[3] || ''}${match[4] || 'Z'}`);
  return Number.isFinite(time) && new Date(time).toISOString().length === 24 ? time : null;
}

/** Whole minutes elapsed from `fromMs` to `toMs`, floored; negative if `to` is earlier. */
export function wholeMinutesBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / MINUTE_MS);
}

/** The declared deadline: the last contact plus the declared interval. */
export function deadlineMs(lastContactMs, intervalMinutes) {
  if (!Number.isFinite(lastContactMs) || !Number.isInteger(intervalMinutes)) return null;
  if (intervalMinutes <= 0) return null;
  return lastContactMs + intervalMinutes * MINUTE_MS;
}

/** The instant after which contact is OVERDUE, not merely due. */
export function graceDeadlineMs(lastContactMs, intervalMinutes, graceMinutes) {
  const due = deadlineMs(lastContactMs, intervalMinutes);
  if (due === null || !Number.isInteger(graceMinutes) || graceMinutes < 0) return null;
  return due + graceMinutes * MINUTE_MS;
}

/**
 * Exact whole minutes past the grace deadline, or 0 when contact is not overdue.
 *
 * Returns null only when the deadline itself cannot be computed — and a caller
 * that cannot compute a lateness must print its refusal rather than a zero,
 * because a zero here reads as "nothing is wrong".
 */
export function latenessMinutes(nowMs, overdueAfterMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(overdueAfterMs)) return null;
  if (nowMs <= overdueAfterMs) return 0;
  return Math.floor((nowMs - overdueAfterMs) / MINUTE_MS);
}

/** Exact whole minutes past the declared end, or 0 when the deployment has not overrun. */
export function overrunMinutes(nowMs, expectedEndMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(expectedEndMs)) return null;
  if (nowMs <= expectedEndMs) return 0;
  return Math.floor((nowMs - expectedEndMs) / MINUTE_MS);
}

/** Exact whole minutes two half-open intervals share, or 0. */
export function overlapMinutes(aStartMs, aEndMs, bStartMs, bEndMs) {
  if (![aStartMs, aEndMs, bStartMs, bEndMs].every(Number.isFinite)) return 0;
  const lo = Math.max(aStartMs, bStartMs);
  const hi = Math.min(aEndMs, bEndMs);
  if (hi <= lo) return 0;
  return Math.floor((hi - lo) / MINUTE_MS);
}

/** The declared span of a deployment in whole minutes, or null when it is not a span. */
export function declaredSpanMinutes(startMs, expectedEndMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(expectedEndMs)) return null;
  if (expectedEndMs <= startMs) return null;
  return Math.floor((expectedEndMs - startMs) / MINUTE_MS);
}

/**
 * A duration for a human to read, from whole minutes. Used by the screen only;
 * the CSV never formats anything.
 */
export function durationLabel(minutes) {
  if (!Number.isInteger(minutes)) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
