// LEADOS — Part 37: fiscal calendar engine.
//
// Supports three calendar families per entity:
//   - "calendar": 12 full-month periods starting at `yearStartMonth` (default January).
//   - "445" / "544" / "454": retail-style 13-week-quarter calendars, weeks grouped 4-4-5 /
//     5-4-4 / 4-5-4 within each quarter, year anchored to the nearest `weekStartsOn` weekday to
//     the 1st of `yearStartMonth`. Automatically inserts a 53rd ("leap") week into the final
//     period when the gap between this year's anchor and next year's anchor is 371 days instead
//     of the usual 364 — this is the standard 4-4-5 leap-week mechanism, not a bug.
//   - "custom": an explicit, pre-defined list of periods (pass-through).
//
// All date arithmetic is done on UTC epoch days (`Date.UTC`), never on local-timezone `Date`
// objects. That means calendar period lengths are immune to DST transitions by construction —
// a period never gains or loses a day because clocks moved; see
// `src/lib/global-ops/__tests__/fiscalCalendar.test.ts` for the explicit DST-boundary proof.

import type { EntityRecord, FiscalCalendarType } from "./types";

const MS_PER_DAY = 86_400_000;

export interface FiscalPeriodDef {
  fiscalYear: number;
  fiscalPeriod: number; // 1-based
  label: string;
  startDate: string; // ISO date, inclusive
  endDate: string; // ISO date, inclusive
  weekCount?: number; // only populated for 4-4-5 family periods
}

function toUTC(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function diffDaysUTC(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODateUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  return toUTC(y, m, d);
}

function addMonthsUTC(date: Date, months: number): Date {
  // Always operates on day-1 anchors in this module, so no end-of-month overflow risk.
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const total = m + months;
  const newYear = y + Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12;
  return new Date(Date.UTC(newYear, newMonth, date.getUTCDate()));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function generateCalendarYearPeriods(entity: Pick<EntityRecord, "fiscalCalendarConfig">, fiscalYear: number): FiscalPeriodDef[] {
  const yearStartMonth = entity.fiscalCalendarConfig.yearStartMonth ?? 1;
  const periods: FiscalPeriodDef[] = [];
  let cursor = toUTC(fiscalYear, yearStartMonth, 1);
  for (let p = 1; p <= 12; p += 1) {
    const next = addMonthsUTC(cursor, 1);
    const end = addDaysUTC(next, -1);
    periods.push({
      fiscalYear,
      fiscalPeriod: p,
      label: `FY${fiscalYear}-M${String(p).padStart(2, "0")}`,
      startDate: fmt(cursor),
      endDate: fmt(end),
    });
    cursor = next;
  }
  return periods;
}

/** Finds the date nearest to `anchor` that falls on `weekday` (0=Sun..6=Sat). Ties resolve to
 * the earlier date — a fixed, deterministic rule so period boundaries never depend on
 * iteration order. */
export function nearestWeekday(anchor: Date, weekday: number): Date {
  const day = anchor.getUTCDay();
  const base = weekday - day;
  const candidates = [base - 7, base, base + 7];
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c) < Math.abs(best) || (Math.abs(c) === Math.abs(best) && c < best)) {
      best = c;
    }
  }
  return addDaysUTC(anchor, best);
}

const WEEK_PATTERNS: Record<"445" | "544" | "454", number[]> = {
  "445": [4, 4, 5],
  "544": [5, 4, 4],
  "454": [4, 5, 4],
};

export function generate445Periods(
  entity: Pick<EntityRecord, "fiscalCalendarConfig">,
  fiscalYear: number,
  variant: "445" | "544" | "454",
): FiscalPeriodDef[] {
  const yearStartMonth = entity.fiscalCalendarConfig.yearStartMonth ?? 1;
  const weekStartsOn = entity.fiscalCalendarConfig.weekStartsOn ?? 1;

  const thisStart = nearestWeekday(toUTC(fiscalYear, yearStartMonth, 1), weekStartsOn);
  const nextStart = nearestWeekday(toUTC(fiscalYear + 1, yearStartMonth, 1), weekStartsOn);
  const totalDays = diffDaysUTC(thisStart, nextStart);
  const totalWeeks = Math.round(totalDays / 7);

  const pattern = WEEK_PATTERNS[variant];
  const weeksPerPeriod: number[] = [];
  for (let q = 0; q < 4; q += 1) weeksPerPeriod.push(...pattern);

  // Standard 4-4-5 leap-week rule: the 53rd week (when the anchor drift requires it) is added
  // to the last period of the fiscal year.
  const diffFrom52 = totalWeeks - 52;
  weeksPerPeriod[11] += diffFrom52;

  let cursor = thisStart;
  const periods: FiscalPeriodDef[] = [];
  for (let p = 0; p < 12; p += 1) {
    const weeks = weeksPerPeriod[p];
    const start = cursor;
    const end = addDaysUTC(cursor, weeks * 7 - 1);
    periods.push({
      fiscalYear,
      fiscalPeriod: p + 1,
      label: `FY${fiscalYear}-P${String(p + 1).padStart(2, "0")} (${weeks}w)`,
      startDate: fmt(start),
      endDate: fmt(end),
      weekCount: weeks,
    });
    cursor = addDaysUTC(cursor, weeks * 7);
  }
  return periods;
}

export function generateCustomPeriods(entity: Pick<EntityRecord, "fiscalCalendarConfig">, fiscalYear: number): FiscalPeriodDef[] {
  const defs = entity.fiscalCalendarConfig.periods ?? [];
  return defs.map((d, i) => ({
    fiscalYear,
    fiscalPeriod: i + 1,
    label: d.label,
    startDate: d.startDate,
    endDate: d.endDate,
  }));
}

export function generateFiscalPeriods(
  entity: Pick<EntityRecord, "fiscalCalendarConfig" | "fiscalCalendarType">,
  fiscalYear: number,
): FiscalPeriodDef[] {
  const type: FiscalCalendarType = entity.fiscalCalendarType;
  if (type === "calendar") return generateCalendarYearPeriods(entity, fiscalYear);
  if (type === "445" || type === "544" || type === "454") return generate445Periods(entity, fiscalYear, type);
  return generateCustomPeriods(entity, fiscalYear);
}

export { isLeapYear, diffDaysUTC, addDaysUTC, toUTC };

// ---------------------------------------------------------------------------
// Period-alignment engine: maps an entity's fiscal periods onto an arbitrary
// reporting window (e.g. the group's own fiscal month) for group reporting
// when entities run on different fiscal calendars.
// ---------------------------------------------------------------------------

export interface PeriodOverlap {
  period: FiscalPeriodDef;
  overlapDays: number;
  periodLengthDays: number;
  fractionOfPeriod: number; // overlapDays / periodLengthDays, in (0, 1]
}

export function periodLengthDays(period: FiscalPeriodDef): number {
  return diffDaysUTC(parseISODateUTC(period.startDate), parseISODateUTC(period.endDate)) + 1;
}

/** Returns, for every entity period that overlaps [windowStart, windowEnd] (inclusive), how
 * many days of that period fall inside the window and what fraction of the period that
 * represents. Used to prorate an entity's period figures into a group reporting window when
 * fiscal calendars don't line up. Never double-counts and never fabricates overlap for periods
 * outside the window. */
export function alignPeriodsToWindow(periods: FiscalPeriodDef[], windowStart: string, windowEnd: string): PeriodOverlap[] {
  const wStart = parseISODateUTC(windowStart);
  const wEnd = parseISODateUTC(windowEnd);
  const results: PeriodOverlap[] = [];
  for (const period of periods) {
    const pStart = parseISODateUTC(period.startDate);
    const pEnd = parseISODateUTC(period.endDate);
    const overlapStart = pStart.getTime() > wStart.getTime() ? pStart : wStart;
    const overlapEnd = pEnd.getTime() < wEnd.getTime() ? pEnd : wEnd;
    const overlapDays = diffDaysUTC(overlapStart, overlapEnd) + 1;
    if (overlapDays <= 0) continue;
    const lengthDays = periodLengthDays(period);
    results.push({ period, overlapDays, periodLengthDays: lengthDays, fractionOfPeriod: overlapDays / lengthDays });
  }
  return results;
}
