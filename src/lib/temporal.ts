// src/lib/temporal.ts
//
// Small date-math helpers shared across the belief fabric + agent core.

export function daysBetween(a: Date | string, b: Date | string): number {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  return (bMs - aMs) / 86_400_000;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function hoursBetween(a: Date | string, b: Date | string): number {
  return daysBetween(a, b) * 24;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
