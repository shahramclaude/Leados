// Small shared numeric helpers used by lifeStage.ts and orgDesign.ts.
// Extracted so both modules stay dependency-free of any client-only store.

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}
