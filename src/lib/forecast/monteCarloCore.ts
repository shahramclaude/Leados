// src/lib/forecast/monteCarloCore.ts
//
// Minimal, faithful stand-in for "Part 04's Monte Carlo core".
//
// Context: this sandbox only contains the fresh Next.js/Drizzle starter
// template (see AI-SESSION-LOG.md Phase 0 discovery for Part 06) — none of
// Parts 01/04/05's files exist on disk. Rather than silently inventing an
// undocumented dependency, this module reconstructs the narrow slice of
// "Part 04" that Part 06 actually needs: a seeded belief distribution per
// initiative category with an expected-value sampler, so the twin's
// finance bridge and the forecasting layer share one PRNG discipline
// (src/lib/twin/prng.ts) instead of two incompatible RNGs.
//
// HONESTY: this is a reconstruction, not an import of a real Part 04
// deliverable. Treat every number here as illustrative. It is flagged in
// MODEL_CARD_KNOWN_FICTIONS (src/lib/twin/modelVersion.ts).

import type { Rng } from "@/lib/twin/prng";

export interface InitiativeBelief {
  category: string;
  /** Expected value per effort-hour, log-normal belief (uncertain ROI). */
  evMu: number;
  evSigma: number;
}

export const DEFAULT_BELIEFS: InitiativeBelief[] = [
  { category: "delivery", evMu: 4.0, evSigma: 0.35 },
  { category: "strategy", evMu: 4.3, evSigma: 0.55 },
  { category: "coaching", evMu: 3.6, evSigma: 0.3 },
  { category: "dataAnalysis", evMu: 4.1, evSigma: 0.4 },
  { category: "stakeholderMgmt", evMu: 3.8, evSigma: 0.3 },
  { category: "technical", evMu: 4.2, evSigma: 0.45 },
];

/**
 * Sample an expected-value-per-hour draw for a category using the shared
 * seeded RNG stream. Mirrors the "beliefs -> EV sample" interface the finance
 * bridge expects from a Monte Carlo forecasting core.
 */
export function sampleExpectedValuePerHour(
  category: string,
  rng: Rng,
  baselineValuePerHr: number,
): number {
  const belief = DEFAULT_BELIEFS.find((b) => b.category === category) ?? DEFAULT_BELIEFS[0];
  // Scale the generic log-normal belief so its mean equals the scenario's
  // configured valuePerEffortHr (keeps the UI's single "value per hour" input
  // meaningful while still injecting belief-shaped uncertainty).
  const rawMean = Math.exp(belief.evMu + (belief.evSigma * belief.evSigma) / 2);
  const draw = rng.logNormal(belief.evMu, belief.evSigma);
  return (draw / rawMean) * baselineValuePerHr;
}
