// LEADOS — src/lib/temporal.ts dependency stand-in (Part 14 contract)
//
// ENGINEERING NOTE (read-before-write honesty): this sandbox does not
// contain the real `src/lib/temporal.ts` produced in Part 14 — the repo
// at https://github.com/shahramclaude/Leados was not checked out with
// Parts 1-44 present when this session started. Rather than silently
// invent incompatible assumptions, this file implements the minimal,
// clearly-labeled surface Part 45 needs from "temporal.ts": timezone-aware
// duration math and work-day boundaries, with no third-party deps so it
// is trivial to delete and replace with the real Part 14 file on merge.
// Every consumer in this part imports only through this module so a swap
// is a one-file change.

export type IsoDateTime = string; // ISO-8601 with offset or 'Z'

/**
 * Returns the UTC offset, in minutes, of an IANA time zone at a given
 * instant (handles DST correctly because it asks the platform's own tz
 * database via Intl rather than a static table).
 */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Minutes since local midnight for `at`, in the given IANA time zone. */
export function localMinuteOfDay(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Day of week (0=Sun..6=Sat) local to the given IANA time zone. */
export function localDayOfWeek(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dtf.format(at)] ?? at.getUTCDay();
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

export function durationHours(start: Date, end: Date): number {
  return durationMinutes(start, end) / 60;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Minutes of overlap between two intervals (0 if disjoint). */
export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, (end - start) / 60000);
}

export function isWithinWorkDay(
  timeZone: string,
  at: Date,
  workDayStartMinute: number,
  workDayEndMinute: number,
): boolean {
  const m = localMinuteOfDay(timeZone, at);
  return m >= workDayStartMinute && m < workDayEndMinute;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}
