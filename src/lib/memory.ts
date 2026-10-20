// src/lib/memory.ts
//
// The shared "forgetting curve" + Bayesian-update engine used by
// institutionalMemory.ts (retrospective confidence) and hypotheses.ts
// (evidence accumulation). Kept dependency-free and pure so it is trivial
// to unit test.
//
// Confidence model: a retrospective/pattern starts at `baseConfidence`.
// Every time new evidence reinforces it, `reinforce()` nudges the base
// confidence upward (asymptotically toward a ceiling — repeated evidence
// strengthens belief but never reaches certainty). Between reinforcements,
// confidence exponentially decays toward a floor (CONFIDENCE_FLOOR) with a
// configurable half-life — stale evidence fades but a record is NEVER
// deleted, only its displayed confidence drops.

export const CONFIDENCE_FLOOR = 0.05;
export const CONFIDENCE_CEILING = 0.97;
export const DEFAULT_HALF_LIFE_DAYS = 90;
export const REINFORCEMENT_STEP = 0.2; // fraction of remaining headroom closed per reinforcement

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Move `baseConfidence` toward CONFIDENCE_CEILING by REINFORCEMENT_STEP of
 * the remaining headroom. Repeated calls asymptotically approach the
 * ceiling but never reach it exactly.
 */
export function reinforce(baseConfidence: number, step: number = REINFORCEMENT_STEP): number {
  const headroom = CONFIDENCE_CEILING - baseConfidence;
  return clamp(baseConfidence + headroom * step, CONFIDENCE_FLOOR, CONFIDENCE_CEILING);
}

/**
 * Exponential decay of confidence toward CONFIDENCE_FLOOR as time passes
 * since the record was last reinforced. `ageDays` must be >= 0.
 */
export function decay(
  baseConfidence: number,
  ageDays: number,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const decayFactor = Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
  return clamp(
    CONFIDENCE_FLOOR + (baseConfidence - CONFIDENCE_FLOOR) * decayFactor,
    CONFIDENCE_FLOOR,
    CONFIDENCE_CEILING
  );
}

/** Convenience: decay as-of `now` given a `lastReinforcedAt` timestamp. */
export function decayedConfidenceAt(
  baseConfidence: number,
  lastReinforcedAt: Date | string,
  now: Date = new Date(),
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const last = typeof lastReinforcedAt === "string" ? new Date(lastReinforcedAt) : lastReinforcedAt;
  const ageDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return decay(baseConfidence, ageDays, halfLifeDays);
}

// ---------------------------------------------------------------------------
// Bayesian evidence accumulation (shared with hypotheses.ts).
// ---------------------------------------------------------------------------

/** Probability -> odds. */
export function probabilityToOdds(p: number): number {
  const bounded = clamp(p, 1e-6, 1 - 1e-6);
  return bounded / (1 - bounded);
}

/** Odds -> probability. */
export function oddsToProbability(odds: number): number {
  return odds / (1 + odds);
}

/**
 * Apply a piece of evidence with a given likelihood ratio (LR > 1 supports
 * the hypothesis, LR < 1 counts against it, LR = 1 is neutral) to a prior
 * probability, returning the posterior probability via log-odds update.
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
