// ─────────────────────────────────────────────────────────────────────────
// Shared time-decay utilities. Every probabilistic module (bayesianNetwork,
// signalFusion, predictiveScoring, causalChain) uses the same recency model
// so "how much does a 20-day-old signal matter" has one answer in the app.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / DAY_MS;
}

/**
 * Exponential recency decay.
 *
 * Formula: w(t) = 0.5 ^ (t / halfLife)
 *
 * This is the standard half-life decay formula (identical in form to
 * radioactive decay, and the same model used for recency weighting in
 * information-retrieval ranking). At t = halfLife, w = 0.5 exactly; the
 * weight approaches but never reaches 0 for finite t.
 */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  if (halfLifeDays <= 0) return 0;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
