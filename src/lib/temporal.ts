// LEADOS Part 14 — shared time utilities.
// No date library dependency: uses Intl.DateTimeFormat (built into Node/V8)
// to do timezone-aware math without pulling in luxon/date-fns-tz.

export function nowMs(): number {
  return Date.now();
}

/** Returns the local hour-of-day (0-23) for a given instant in a given IANA timezone. */
export function hourOfDayInTz(date: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? Number.parseInt(hourPart.value, 10) % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

/** Returns minutes-since-local-midnight for a given instant in a given IANA timezone. */
export function minuteOfDayInTz(date: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(date);
    const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
    const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/** Local calendar day key (YYYY-MM-DD) for a given instant + timezone. Used as the interrupt-budget ledger key. */
export function dayKeyInTz(date: Date, timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date); // en-CA formats as YYYY-MM-DD
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Whether `minute` (0..1439) falls inside a wraparound window [start, end).
 * Supports windows that cross midnight (e.g. 22:00 -> 07:00).
 */
export function isWithinWindow(minute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return false; // zero-length window = never
  if (startMinute < endMinute) {
    return minute >= startMinute && minute < endMinute;
  }
  // wraps midnight
  return minute >= startMinute || minute < endMinute;
}

/** Minutes until `minute` reaches `targetMinute`, walking forward (wraps at 1440). */
export function minutesUntil(minute: number, targetMinute: number): number {
  const diff = targetMinute - minute;
  return diff >= 0 ? diff : diff + 24 * 60;
}

/** Exponential decay weight for an observation `ageMs` old, with half-life `halfLifeMs`. */
export function decayWeight(ageMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return ageMs <= 0 ? 1 : 0;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

/** Merge a new observation into a decayed exponential moving average. */
export function decayedUpdate(previousScore: number, previousSamples: number, observation: number, alpha = 0.25): number {
  if (previousSamples <= 0) return observation;
  return previousScore * (1 - alpha) + observation * alpha;
}
