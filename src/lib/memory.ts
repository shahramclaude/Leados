// src/lib/memory.ts
//
// Shared, dependency-free math used by institutionalMemory.ts (retrospective
// decay/reactivation strength) and hypotheses.ts (Bayesian evidence
// accumulation + forecaster scoring). Kept pure so every function here is
// directly unit/property-testable without a database (see
// scripts/property-test-memory.ts).
//
// ---------------------------------------------------------------------------
// Institutional-memory strength model (mission §B):
//
//   s(t) = s0 * exp(-Δt / τ) + Σ reactivations
//
// `s0` is the memory's base strength at creation (default 1). `τ` (tau) is a
// half-life-derived time constant, different per memory class (an incident
// retrospective should feel "fresh" longer than a routine decision note).
// Each reactivation (citation, reuse, "we faced this before" surfacing) adds
// its own term that ALSO decays from the moment it happened, so recent
// citations matter more than old ones but a memory never truly dies — it
// just asymptotically approaches (but, per CONFIDENCE_FLOOR-style flooring
// below, never reaches) zero. Nothing is ever deleted: `retrospectives` rows
// are permanent; only the *displayed* strength changes with time.
// ---------------------------------------------------------------------------

export const STRENGTH_FLOOR = 0.02; // a memory is always at least "barely alive" and recallable, never literally 0
export const DEFAULT_BASE_STRENGTH = 1;

/** Half-life (days) per institutional-memory class — tuned by how long a class of lesson stays "front of mind" absent reuse. */
export const MEMORY_CLASS_HALF_LIFE_DAYS: Record<string, number> = {
  decision: 120,
  incident: 60, // incidents fade fastest if not reinforced — intentionally, so stale fire-drills don't dominate recall
  experiment: 180,
  hiring: 240,
  partnership: 200,
};
export const DEFAULT_HALF_LIFE_DAYS = 120;

export function halfLifeForClass(memoryClass: string): number {
  return MEMORY_CLASS_HALF_LIFE_DAYS[memoryClass] ?? DEFAULT_HALF_LIFE_DAYS;
}

/** Convert a half-life to the exponential time constant τ: τ = halfLife / ln(2). */
export function tauFromHalfLife(halfLifeDays: number): number {
  return halfLifeDays / Math.LN2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type ReactivationInput = { ageDays: number; weight: number };

/**
 * s(t) = s0 * exp(-Δt/τ) + Σ_i weight_i * exp(-ageDays_i/τ)
 *
 * `ageDaysSinceCreation` is Δt for the base term. Each reactivation
 * contributes its own exponentially-decaying term keyed off its own age.
 * The sum is floored at STRENGTH_FLOOR (a memory is always at least
 * minimally recallable) and NOT ceilinged — repeated reactivation can push
 * a frequently-cited memory's displayed strength above its original s0,
 * which is the intended "well-worn, load-bearing lesson" signal.
 */
export function memoryStrength(params: {
  baseStrength: number;
  ageDaysSinceCreation: number;
  halfLifeDays: number;
  reactivations: ReactivationInput[];
}): number {
  const tau = tauFromHalfLife(params.halfLifeDays);
  const baseTerm = params.baseStrength * Math.exp(-Math.max(0, params.ageDaysSinceCreation) / tau);
  const reactivationTerm = params.reactivations.reduce(
    (sum, r) => sum + r.weight * Math.exp(-Math.max(0, r.ageDays) / tau),
    0
  );
  return Math.max(STRENGTH_FLOOR, baseTerm + reactivationTerm);
}

/** Age in days between two timestamps (always >= 0). */
export function ageDays(from: Date | string, to: Date = new Date()): number {
  const fromDate = typeof from === "string" ? new Date(from) : from;
  return Math.max(0, (to.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Bayesian evidence accumulation (shared with hypotheses.ts) — Part 04 seam.
// ---------------------------------------------------------------------------

export function probabilityToOdds(p: number): number {
  const bounded = clamp(p, 1e-6, 1 - 1e-6);
  return bounded / (1 - bounded);
}

export function oddsToProbability(odds: number): number {
  return odds / (1 + odds);
}

/**
 * Apply a piece of evidence with a given likelihood ratio (LR > 1 supports
 * the hypothesis, LR < 1 counts against it, LR = 1 is neutral) to a prior
 * probability, returning the posterior probability via a log-odds update.
 */
export function applyLikelihoodRatio(priorProbability: number, likelihoodRatio: number): number {
  const posteriorOdds = probabilityToOdds(priorProbability) * Math.max(1e-6, likelihoodRatio);
  return clamp(oddsToProbability(posteriorOdds), 1e-6, 1 - 1e-6);
}

/** Brier score for a single forecast: (probability - outcome)^2. Lower is better, range [0,1]. */
export function brierScore(probability: number, outcome: boolean): number {
  const o = outcome ? 1 : 0;
  return Math.pow(probability - o, 2);
}

/** Mean Brier score across a set of resolved forecasts. */
export function meanBrierScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/** Jaccard similarity of two sets — shared primitive for tag-overlap clustering (genome.ts, playbooksIntelligence.ts, similarity surfacing). */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Calibration curve: bucket forecasts by predicted-probability decile and
 * compare mean predicted probability to observed outcome frequency in each
 * bucket. A perfectly calibrated forecaster lies on the diagonal.
 */
export type CalibrationBucket = { bucket: string; meanPredicted: number; observedFrequency: number; count: number };

export function calibrationCurve(samples: { probability: number; outcome: boolean }[], buckets = 5): CalibrationBucket[] {
  const width = 1 / buckets;
  const grouped: { probability: number; outcome: boolean }[][] = Array.from({ length: buckets }, () => []);
  for (const s of samples) {
    const idx = clamp(Math.floor(s.probability / width), 0, buckets - 1);
    grouped[idx].push(s);
  }
  return grouped.map((group, idx) => {
    const lo = (idx * width).toFixed(2);
    const hi = ((idx + 1) * width).toFixed(2);
    const meanPredicted = group.length === 0 ? 0 : group.reduce((s, g) => s + g.probability, 0) / group.length;
    const observedFrequency = group.length === 0 ? 0 : group.filter((g) => g.outcome).length / group.length;
    return { bucket: `${lo}-${hi}`, meanPredicted, observedFrequency, count: group.length };
  });
}
