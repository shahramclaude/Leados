// ---------------------------------------------------------------------------
// temporal.ts — time decay helpers shared by the metrics engine and the
// belief fabric.
// ---------------------------------------------------------------------------

/**
 * Exponential recency weight with a configurable half-life.
 * weight = 0.5 ^ (ageDays / halfLifeDays)
 * DESIGN PARAMETER: default half-life = 14 days (per Part 9 spec).
 */
export function recencyWeight(ageDays: number, halfLifeDays = 14): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfDayUTC(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
