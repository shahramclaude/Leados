/**
 * sourceReliability.ts — Part 04-C. Pure functions that turn a source's
 * historical resolved-prediction record into a reliability score used as
 * the `wᵢ` in `bayesian.ts`'s log-odds pooling. Persistence of the
 * resolved-prediction history lives in
 * `src/lib/platform/intelligence/sourceReliabilityStore.ts`; this module
 * only computes.
 */

import { brierScore } from "./stats";
import type { ResolvedPrediction, SourceReliabilityRecord } from "./types";

/** Shrinkage constant k: with n resolved predictions, the raw reliability
 * estimate is blended with the uninformative prior (0.5) using weight
 * n/(n+k). k=10 means a source needs roughly 10 resolved outcomes before its
 * own track record dominates the estimate — a standard empirical-Bayes
 * shrinkage form (cf. James-Stein shrinkage / Bayesian hierarchical models
 * for rate estimation, e.g. Efron & Morris 1975). */
export const RELIABILITY_SHRINKAGE_K = 10;

/**
 * reliability = 1 - BrierScore(resolved predictions), shrunk toward 0.5:
 *   reliability_shrunk = (n/(n+k)) * reliability_raw + (k/(n+k)) * 0.5
 *
 * Sources with zero resolved predictions get reliability = 0.5 (maximally
 * uninformative) AND `neverResolved: true` so callers/UI can say so
 * explicitly rather than silently trusting an unproven source (standing
 * order C: "Sources that never resolve stay discounted and say so").
 */
export function computeSourceReliability(
  sourceId: string,
  history: ResolvedPrediction[],
): SourceReliabilityRecord {
  const n = history.length;
  if (n === 0) {
    return { sourceId, reliability: 0.5, resolvedCount: 0, brierScore: null, neverResolved: true };
  }
  const brier = brierScore(history.map((h) => ({ p: h.p, outcome: h.outcome })));
  const rawReliability = 1 - brier; // Brier in [0,1] for binary outcomes -> reliability in [0,1]
  const shrunk = (n / (n + RELIABILITY_SHRINKAGE_K)) * rawReliability + (RELIABILITY_SHRINKAGE_K / (n + RELIABILITY_SHRINKAGE_K)) * 0.5;
  return {
    sourceId,
    reliability: Math.min(1, Math.max(0, shrunk)),
    resolvedCount: n,
    brierScore: brier,
    neverResolved: false,
  };
}
