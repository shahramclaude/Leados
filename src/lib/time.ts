// src/lib/time.ts — the one clock contract for the whole app.
//
//  - Every timestamp is stored as `timestamptz` in UTC (see src/db/schema.ts).
//  - The user-facing timezone/locale is a *display* concern only, read from
//    the organization (`organizations.timezone` / `defaultLocale`) or the
//    user record. Nothing server-side does date arithmetic in local time —
//    only formatting for display uses the org timezone + user locale.
//  - `now()` is the single place that reads the wall clock.

export function now(): Date {
  return new Date();
}

export function toIso(d: Date | string | number): string {
  return new Date(d).toISOString();
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function daysBetween(a: Date | string | number, b: Date | string | number): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86_400_000);
}
