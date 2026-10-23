// UTC-anchored date arithmetic for renewal/termination windows and cascade deadlines.
//
// Why UTC-anchored: local-timezone "add N days" arithmetic is a classic source of off-by-one
// errors across DST transitions (e.g. "spring forward" days are 23 hours long in local time).
// By doing all day-granularity math against the UTC calendar date (Y/M/D triple, no time-of-day
// component) we are DST-proof: a day is always a day, independent of wall-clock offsets. See
// tests/dates.dst.test.ts for a fixture that specifically crosses a US DST boundary.

export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDaysUTC(date: Date, days: number): Date {
  const base = toUtcMidnight(date);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

export function addMonthsUTC(date: Date, months: number): Date {
  const base = toUtcMidnight(date);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate()));
}

export function diffInCalendarDaysUTC(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtcMidnight(b).getTime() - toUtcMidnight(a).getTime()) / msPerDay);
}

export interface RenewalWindow {
  /** The date the current term expires (or next auto-renewal date). */
  termEndDate: Date;
  /** The date by which a non-renewal / termination notice must be sent. */
  noticeDeadline: Date;
  /** The date the renewal-decision window opens (termEndDate - renewalWindowDays). */
  windowOpensAt: Date;
}

export function computeRenewalWindow(params: {
  effectiveDate: Date;
  termMonths: number;
  renewalWindowDays: number;
  terminationNoticeDays: number;
  /** How many renewal cycles have already elapsed (0 = still in initial term). */
  cyclesElapsed?: number;
}): RenewalWindow {
  const cycles = params.cyclesElapsed ?? 0;
  const termEndDate = addMonthsUTC(params.effectiveDate, params.termMonths * (cycles + 1));
  const windowOpensAt = addDaysUTC(termEndDate, -params.renewalWindowDays);
  const noticeDeadline = addDaysUTC(termEndDate, -params.terminationNoticeDays);
  return { termEndDate, noticeDeadline, windowOpensAt };
}

/** Part 25 cadence seam: recurring obligation schedules (quarterly / annual / monthly). */
export type Cadence = "monthly" | "quarterly" | "annual";

export function nextCadenceOccurrence(from: Date, cadence: Cadence, after: Date): Date {
  const stepMonths = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  let candidate = toUtcMidnight(from);
  // Advance in fixed steps until strictly after `after` — deterministic, DST-proof (UTC calendar math).
  let guard = 0;
  while (candidate.getTime() <= after.getTime() && guard < 10_000) {
    candidate = addMonthsUTC(candidate, stepMonths);
    guard += 1;
  }
  return candidate;
}
