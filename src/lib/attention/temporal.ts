// Shared time utilities for the attention engine. Centralised so every
// module (circadian, fatigue, cognitive load, attention policy) agrees on
// "now" and on how minutes-of-day / quiet-hour wraparound are computed.

export function minutesSinceMidnight(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function dateKey(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }); // en-CA => YYYY-MM-DD
  return formatter.format(date);
}

/** Returns true if `minute` falls within a (possibly midnight-wrapping) window. */
export function isWithinWindow(minute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) {
    return minute >= startMinute && minute < endMinute;
  }
  // Wraps past midnight, e.g. 22:00 -> 07:00
  return minute >= startMinute || minute < endMinute;
}

export function minutesUntilWindowEnds(minute: number, startMinute: number, endMinute: number): number {
  if (!isWithinWindow(minute, startMinute, endMinute)) return 0;
  if (minute < endMinute) return endMinute - minute;
  return 24 * 60 - minute + endMinute;
}
