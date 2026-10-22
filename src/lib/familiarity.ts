// src/lib/familiarity.ts
//
// Expertise ("familiarity") model — Part 41.
//
// Pure functions only. No DB, no React, no side effects. This module answers
// ONE question per domain: "how familiar does this person appear to be, based
// on how they interact?" It NEVER decides what facts a user sees — only the
// presentation layer (presentationAdapter.ts) is allowed to read this output,
// and only to change density/format, never content (enforced by the
// content-parity test in tests/presentationAdapter.contentParity.test.ts).

export type Domain = "finance" | "people" | "risk" | "tech";

export const DOMAINS: Domain[] = ["finance", "people", "risk", "tech"];

export type ExpertiseLevel = "novice" | "intermediate" | "expert";

/** A single observed behavior that is evidence of familiarity in a domain. */
export interface InteractionSignal {
  domain: Domain;
  /** 0..1 — how far the user drilled past the headline number into supporting detail. */
  depth: number;
  /** 0..1 — use of domain-technical vocabulary/filters rather than plain-language search. */
  vocabulary: number;
  /** 0..1 — intensity of drill-down navigation (expanding nested breakdowns, pivoting). */
  drilldown: number;
  /** epoch ms when the interaction happened. */
  timestamp: number;
}

export interface ExpertiseScore {
  domain: Domain;
  /** 0..1 saturating score. */
  score: number;
  level: ExpertiseLevel;
  /** 0..1 — how much evidence backs this score (small sample = low confidence). */
  confidence: number;
  sampleSize: number;
  /** epoch ms the score was computed for. */
  asOf: number;
}

/** Recency half-life: a signal's weight halves every 14 days of inactivity. */
export const EXPERTISE_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

/** Saturation constant so repeated strong signals approach but never hit 1. */
const SATURATION_K = 0.35;

/** Level thresholds — explicit and documented so the UI can explain transitions. */
export const EXPERTISE_THRESHOLDS: { novice: number; intermediate: number } = {
  novice: 0.33,
  intermediate: 0.7,
};

export function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function recencyWeight(ageMs: number, halfLifeMs: number = EXPERTISE_HALF_LIFE_MS): number {
  if (ageMs <= 0) return 1;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

function signalStrength(signal: InteractionSignal): number {
  const raw = 0.4 * clamp01(signal.depth) + 0.3 * clamp01(signal.vocabulary) + 0.3 * clamp01(signal.drilldown);
  return clamp01(raw);
}

export function levelFromScore(score: number): ExpertiseLevel {
  if (score < EXPERTISE_THRESHOLDS.novice) return "novice";
  if (score < EXPERTISE_THRESHOLDS.intermediate) return "intermediate";
  return "expert";
}

/**
 * Compute a domain's expertise score from a list of interaction signals.
 *
 * Properties guaranteed (see tests/familiarity.property.test.ts):
 *  - Monotone: adding any additional non-negative signal never decreases the score.
 *  - Decaying: holding signals fixed, score computed at a later `now` is <= score at an earlier `now`.
 *  - Bounded: score and confidence are always within [0, 1].
 */
export function computeExpertise(
  signals: InteractionSignal[],
  domain: Domain,
  now: number = Date.now(),
): ExpertiseScore {
  const relevant = signals.filter((s) => s.domain === domain && s.timestamp <= now);

  let weightedSum = 0;
  let totalWeight = 0;
  for (const signal of relevant) {
    const age = now - signal.timestamp;
    const weight = recencyWeight(age);
    weightedSum += weight * signalStrength(signal);
    totalWeight += weight;
  }

  const score = clamp01(1 - Math.exp(-SATURATION_K * weightedSum));
  const confidence = clamp01(1 - Math.exp(-0.25 * totalWeight));

  return {
    domain,
    score,
    level: levelFromScore(score),
    confidence,
    sampleSize: relevant.length,
    asOf: now,
  };
}

export function computeAllExpertise(
  signals: InteractionSignal[],
  now: number = Date.now(),
): Record<Domain, ExpertiseScore> {
  const out = {} as Record<Domain, ExpertiseScore>;
  for (const domain of DOMAINS) {
    out[domain] = computeExpertise(signals, domain, now);
  }
  return out;
}

/**
 * True if `curr` reflects decay relative to `prev` (no new evidence, time passed).
 * Used only to produce a human-readable transparency message — never hidden.
 */
export function hasDecayed(prev: ExpertiseScore, curr: ExpertiseScore): boolean {
  return curr.asOf > prev.asOf && curr.score < prev.score;
}

/**
 * Default (empty-evidence) expertise score for a domain — the safe fallback
 * for cold-start users. Always "novice" with zero confidence, which the
 * presentation layer treats as "use guided density, but don't trap the user".
 */
export function defaultExpertise(domain: Domain, now: number = Date.now()): ExpertiseScore {
  return { domain, score: 0, level: "novice", confidence: 0, sampleSize: 0, asOf: now };
}
