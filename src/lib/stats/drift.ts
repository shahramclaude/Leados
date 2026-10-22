/**
 * EWMA / drift machinery.
 *
 * STATUS: Part 04 is expected to own the canonical drift-detection module
 * (used for metric drift alerts elsewhere in LEADOS). It is not present in
 * this repository snapshot, so Part 26 bootstraps the specific primitive it
 * needs — an exponentially weighted moving average and its first difference
 * — under `src/lib/stats/drift.ts`. This mirrors the "momentum = EWMA of
 * adoption-proxy deltas" requirement.
 */

/** Smooth a series with exponential weighting. alpha in (0,1]; higher = less smoothing. */
export function ewma(series: readonly number[], alpha: number): number[] {
  if (alpha <= 0 || alpha > 1) throw new Error("alpha must be in (0, 1]");
  if (series.length === 0) return [];
  const out: number[] = [series[0]];
  for (let i = 1; i < series.length; i++) {
    out.push(alpha * series[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

/** First difference of a series (length n-1). */
export function diffs(series: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) out.push(series[i] - series[i - 1]);
  return out;
}

/**
 * Momentum = most recent delta of the EWMA-smoothed series.
 * Positive => adoption proxy trending up; negative => trending down.
 * Returns 0 for series too short to have a delta.
 */
export function ewmaMomentum(series: readonly number[], alpha = 0.3): number {
  const smoothed = ewma(series, alpha);
  if (smoothed.length < 2) return 0;
  return smoothed[smoothed.length - 1] - smoothed[smoothed.length - 2];
}
