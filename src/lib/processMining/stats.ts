// Part 28 — small, dependency-free numeric helpers shared across the mining
// pipeline. Kept pure so they are trivial to unit-test from scripts/verify.ts.

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lowerIdx = Math.floor(rank);
  const upperIdx = Math.ceil(rank);
  if (lowerIdx === upperIdx) return sortedAsc[lowerIdx];
  const weight = rank - lowerIdx;
  return sortedAsc[lowerIdx] * (1 - weight) + sortedAsc[upperIdx] * weight;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function gapStatsFromSamples(samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    count: samplesMs.length,
    avgMs: mean(samplesMs),
    p50Ms: percentile(sorted, 50),
    p85Ms: percentile(sorted, 85),
    maxMs: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

/** Reservoir sampling (Algorithm R) so streaming merges stay bounded in memory. */
export function reservoirPush(reservoir: number[], value: number, seenCount: number, cap: number): void {
  if (reservoir.length < cap) {
    reservoir.push(value);
    return;
  }
  const j = Math.floor(Math.random() * (seenCount + 1));
  if (j < cap) {
    reservoir[j] = value;
  }
}

export function clampNonNegative(ms: number): number {
  return ms > 0 ? ms : 0;
}
