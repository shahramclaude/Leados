// LEADOS Part 25 — timezone-correct, DST-safe occurrence clock.
//
// This module answers one question honestly and testably: "given a ritual's
// wall-clock anchor (e.g. 'every Monday at 09:00 America/New_York') and an
// instant to search forward from, when is the next real-world instant that
// matches?" It uses only `Intl.DateTimeFormat` (no date library), the same
// dependency-free approach observed upstream in `src/lib/temporal.ts` (Part
// 14) and `src/lib/kernel/cron.ts` (Part 07) during this part's discovery
// read. Unlike `kernel/cron.ts` (which matches against *UTC* fields only —
// not timezone-correct for an org whose participants are not in UTC), this
// clock resolves wall-clock-in-a-named-zone to a UTC instant, which is what
// "timezone-correct" and "DST-tested" actually require.
import type { RitualAnchor, RitualKind } from "./types";

export interface LocalDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun..6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Reads the local wall-clock date/time + weekday for `date` in `timeZone`. */
export function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: Number.parseInt(map.hour, 10) % 24,
    minute: Number.parseInt(map.minute, 10),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

/** The UTC offset, in minutes (can be fractional, e.g. 330 for +05:30), that
 * `timeZone` observes at instant `date`. Positive = east of UTC. */
export function getTzOffsetMinutes(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number.parseInt(map.year, 10),
    Number.parseInt(map.month, 10) - 1,
    Number.parseInt(map.day, 10),
    Number.parseInt(map.hour, 10) % 24,
    Number.parseInt(map.minute, 10),
    Number.parseInt(map.second, 10),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Converts a wall-clock date/time *as experienced in `timeZone`* to the
 * corresponding real-world UTC instant. Handles DST transitions and
 * fractional-hour offsets (e.g. Asia/Kolkata +05:30, Australia/Lord_Howe's
 * half-hour DST shift) by iterating the offset lookup twice, which converges
 * because a timezone's offset changes by at most a couple of hours between
 * any two nearby instants.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getTzOffsetMinutes(new Date(utcGuessMs), timeZone);
    utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000;
  }
  return new Date(utcGuessMs);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Adds `days` calendar days to a plain (year, month, day) triple, using
 * proleptic-Gregorian UTC arithmetic purely as a calendar calculator (this
 * does NOT represent a real instant — just date rollover math). */
function addCalendarDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export interface Occurrence {
  scheduledFor: Date;
  occurrenceKey: string;
}

/** ISO week number (1-53) for a plain calendar date, per ISO-8601. */
function isoWeekKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function occurrenceKeyFor(kind: RitualKind, localParts: { year: number; month: number; day: number }): string {
  switch (kind) {
    case "daily_brief":
      return `${localParts.year}-${String(localParts.month).padStart(2, "0")}-${String(localParts.day).padStart(2, "0")}`;
    case "weekly_review":
      return isoWeekKey(localParts.year, localParts.month, localParts.day);
    case "monthly_business_review":
      return `${localParts.year}-${String(localParts.month).padStart(2, "0")}`;
    case "quarterly_strategy": {
      const q = Math.floor((localParts.month - 1) / 3) + 1;
      return `${localParts.year}-Q${q}`;
    }
    case "annual_plan":
      return `${localParts.year}`;
  }
}

/**
 * Finds the next occurrence for a ritual's anchor, strictly after `after`.
 * Searches forward in whole calendar days (bounded, so it always terminates)
 * and resolves each candidate's wall-clock time to a UTC instant via
 * `zonedTimeToUtc`, which is what makes this DST-correct: the *calendar*
 * search is tz-agnostic, but the final instant comparison is tz-aware.
 */
export function nextOccurrence(kind: RitualKind, timezone: string, anchor: RitualAnchor, after: Date): Occurrence {
  const start = getLocalDateParts(after, timezone);
  const maxLookaheadDays = kind === "daily_brief" ? 3 : kind === "weekly_review" ? 10 : kind === "monthly_business_review" ? 35 : kind === "quarterly_strategy" ? 100 : 370;

  for (let offset = 0; offset <= maxLookaheadDays; offset++) {
    const candidate = addCalendarDays(start.year, start.month, start.day, offset);
    if (!matchesAnchorDay(kind, candidate, anchor)) continue;
    const scheduledFor = zonedTimeToUtc(candidate.year, candidate.month, candidate.day, anchor.hour, anchor.minute, timezone);
    if (scheduledFor.getTime() > after.getTime()) {
      return { scheduledFor, occurrenceKey: occurrenceKeyFor(kind, candidate) };
    }
  }
  throw new Error(`nextOccurrence: no match found for kind=${kind} within ${maxLookaheadDays} days`);
}

function matchesAnchorDay(kind: RitualKind, candidate: { year: number; month: number; day: number }, anchor: RitualAnchor): boolean {
  switch (kind) {
    case "daily_brief":
      return true;
    case "weekly_review":
      return weekdayOf(candidate.year, candidate.month, candidate.day) === (anchor.weekday ?? 1);
    case "monthly_business_review": {
      const dom = Math.min(anchor.dayOfMonth ?? 1, daysInMonth(candidate.year, candidate.month));
      return candidate.day === dom;
    }
    case "quarterly_strategy": {
      const quarterStartMonths = [1, 4, 7, 10];
      if (!quarterStartMonths.includes(candidate.month)) return false;
      const dom = Math.min(anchor.dayOfMonth ?? 1, daysInMonth(candidate.year, candidate.month));
      return candidate.day === dom;
    }
    case "annual_plan": {
      if (candidate.month !== (anchor.month ?? 1)) return false;
      const dom = Math.min(anchor.dayOfMonth ?? 1, daysInMonth(candidate.year, candidate.month));
      return candidate.day === dom;
    }
  }
}
