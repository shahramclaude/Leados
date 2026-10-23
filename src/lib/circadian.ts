// src/lib/circadian.ts
//
// RECONSTRUCTION NOTE (Part 52 standing order #1):
// This sandbox checkout of Leados does not contain the real `circadian.ts`
// produced by earlier parts. To honor the "read before write" order and keep
// Part 52 integrable, this file reconstructs the minimal surface the leader
// cognitive-capacity work depends on: naming and bucketing times of day.
// When merging into the real repository, replace this with (or reconcile
// against) the authoritative circadian module and keep the exported names
// stable so `leaderState/*` does not need to change.

export type TimeBucket = "early-morning" | "morning" | "midday" | "afternoon" | "evening" | "night";

/**
 * Buckets a 0-23 hour-of-day into a coarse circadian window.
 * Intentionally coarse: this is used only to group a person's OWN historical
 * decisions, never to make clinical or chronotype claims.
 */
export function bucketForHour(hourOfDay: number): TimeBucket {
  const h = ((hourOfDay % 24) + 24) % 24;
  if (h >= 5 && h < 8) return "early-morning";
  if (h >= 8 && h < 12) return "morning";
  if (h >= 12 && h < 14) return "midday";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

export function bucketForDate(date: Date): TimeBucket {
  return bucketForHour(date.getHours());
}

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  "early-morning": "Early morning (5–8am)",
  morning: "Morning (8am–12pm)",
  midday: "Midday (12–2pm)",
  afternoon: "Afternoon (2–6pm)",
  evening: "Evening (6–10pm)",
  night: "Night (10pm–5am)",
};

export const ALL_TIME_BUCKETS: TimeBucket[] = [
  "early-morning",
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
];
