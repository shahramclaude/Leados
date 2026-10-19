// src/lib/time.ts
//
// The one clock contract for the whole app (mission item 5):
//
//  - Every timestamp is stored as `timestamptz` in UTC (see src/db/schema.ts).
//    Postgres normalizes timestamptz to UTC internally regardless of the
//    session timezone, so storage is unambiguous by construction.
//  - The user-facing timezone is a *display* concern only, read from
//    `settings.orgTimezone` (see src/lib/repositories/settingsRepository.ts).
//    Nothing server-side ever does date arithmetic in local time — only
//    formatting for display uses the org timezone.
//  - `now()` is the single place that reads the wall clock, so tests and
//    deterministic replays (rebuildProjections) can reason about time
//    without reaching for `new Date()` directly all over the codebase.

export function now(): Date {
  return new Date();
}

export function toIso(d: Date | string | number): string {
  return new Date(d).toISOString();
}

/** Format a UTC instant for display in the organization's configured timezone. */
export function formatInTimezone(d: Date | string | number, timeZone: string): string {
  const date = new Date(d);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    // Unknown/invalid IANA timezone string — fall back to UTC rather than throwing.
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

export function daysBetween(a: Date | string | number, b: Date | string | number): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86_400_000);
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse an `asOf` query parameter (ISO date or datetime string) into a Date
 * used to bound both event-time (`events.ts`) and transaction-time
 * (`recordedAt` / bitemporal `recordedAt`) queries. Defaults to "now" when
 * absent, which is equivalent to the normal (non-retrospective) view.
 */
export function parseAsOf(value: string | null | undefined): Date {
  if (!value) return now();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid asOf value: "${value}". Expected an ISO-8601 date or datetime.`);
  }
  return d;
}
