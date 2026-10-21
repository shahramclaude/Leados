// Pure, isomorphic time utilities shared by the attention engine, the Now
// surface, and the client-side `useNowTick` hook. No DB/IO here on purpose
// so it can run on the client without bundling server code.

export function localHourFor(date: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
    const hour = Number.parseInt(hourPart, 10);
    // Intl can return "24" for midnight in some locales/timezones.
    return hour === 24 ? 0 : hour;
  } catch {
    return date.getUTCHours();
  }
}

export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false; // zero-length window = no quiet hours
  if (start < end) return hour >= start && hour < end;
  // Wraps midnight, e.g. 22 -> 7
  return hour >= start || hour < end;
}

export function startOfLocalDay(date: Date, timezone: string): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const ymd = fmt.format(date); // YYYY-MM-DD in local tz
    return new Date(`${ymd}T00:00:00.000Z`);
  } catch {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // Monday-start week
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

// Exponential decay weight for "recency-weighted" statistics. halfLifeDays
// controls how fast old behavior stops mattering.
export function decayWeight(ageDays: number, halfLifeDays = 14): number {
  return Math.pow(0.5, ageDays / halfLifeDays);
}
