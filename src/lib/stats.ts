// src/lib/stats.ts
//
// NEW FOUNDATIONAL MODULE (no prior file existed — see provenance note in
// src/lib/types.ts). Small shared numeric helpers reused by several of the
// people-intelligence modules so the same formula isn't re-derived (and
// potentially re-derived inconsistently) in multiple places.

/**
 * Jaccard similarity of two sets: |A ∩ B| / |A ∪ B|.
 * CITATION: standard set-similarity formula (Jaccard, 1912) — general
 * mathematical knowledge, not borrowed from any file in this repo.
 * Used by: src/lib/familiarity.ts (skillOverlap, 1 caller site within this
 * repo: src/lib/talentEngine.ts computeSuccessionRisk).
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Ordinary-least-squares slope of y over x, normalized so the result is
 * "units of y per unit of x". Used as a lightweight trend detector
 * (growth velocity across performance snapshots, sentiment trend across
 * 1:1s, team mood trend) without needing a full regression library.
 * CITATION: standard OLS slope formula
 *   slope = Σ((x-x̄)(y-ȳ)) / Σ((x-x̄)^2)
 * general statistical knowledge, not borrowed from any file in this repo.
 * Used by: src/lib/talentEngine.ts (growthVelocity trend, teamMoodTrend),
 * src/lib/orgNetwork.ts (centrality-shift magnitude is a simple delta, not
 * OLS, so not used there).
 */
export function olsSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - xMean) * (p.y - yMean);
    denominator += (p.x - xMean) * (p.x - xMean);
  }
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
