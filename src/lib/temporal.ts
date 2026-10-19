// src/lib/temporal.ts
//
// BOOTSTRAP NOTE: no prior temporal.ts existed in the repository (see Part-1
// read step). This is an original-derivation baseline implementation.

/** Days between two dates (b - a), fractional. Original derivation:
 * plain millisecond delta divided by ms-per-day.
 */
export function daysBetween(a: Date | string, b: Date | string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return (tb - ta) / 86_400_000;
}

export function isWithinDays(date: Date | string, now: Date, days: number): boolean {
  const delta = daysBetween(date, now);
  return delta >= 0 && delta <= days;
}

/** Exponential half-life recency weight. Original derivation (standard
 * radioactive-decay analogue, not from a specific paper):
 *   w(t) = 2^(-age/halfLife) = exp(-ln(2) * age / halfLife)
 * age <= 0 (future-dated) clamps to weight 1.
 */
export function recencyWeight(date: Date | string, now: Date, halfLifeDays: number): number {
  const age = daysBetween(date, now);
  if (age <= 0) return 1;
  return Math.exp(-Math.LN2 * (age / halfLifeDays));
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function clamp(x: number, min: number, max: number): number {
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
