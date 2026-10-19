// src/lib/intelligence/inference.ts
//
// Shared inference utilities used across multiple engines: combining
// several probability estimates into one fused probability, and mapping a
// (probability, impact) pair onto the 1-5 severity scale that
// signalFusion.ts consumes. Centralised here so every caller uses the same
// documented formula instead of ad-hoc arithmetic scattered per engine.
import type { Severity } from "./types";

export interface WeightedProbability {
  probability: number;
  weight: number;
  source: string;
}

/** Combines multiple probability estimates via a logarithmic opinion pool
 * (weighted geometric mean of odds), which — unlike a naive weighted
 * average — correctly produces more extreme (confident) combined estimates
 * when independent sources agree, and pulls back toward 0.5 when they
 * disagree. Formula (Genest & Zidek, 1986, "Combining probability
 * distributions: A critique and an annotated bibliography"):
 *   odds_i = p_i / (1 - p_i)
 *   combinedOdds = exp( sum(w_i * ln(odds_i)) / sum(w_i) )
 *   combinedProbability = combinedOdds / (1 + combinedOdds)
 */
export function combineProbabilities(estimates: WeightedProbability[]): number {
  const valid = estimates.filter((e) => e.weight > 0 && e.probability > 0 && e.probability < 1);
  if (valid.length === 0) {
    const fallback = estimates[0]?.probability ?? 0.5;
    return Math.min(1, Math.max(0, fallback));
  }
  const totalWeight = valid.reduce((sum, e) => sum + e.weight, 0);
  const logOddsSum = valid.reduce((sum, e) => sum + e.weight * Math.log(e.probability / (1 - e.probability)), 0);
  const combinedLogOdds = logOddsSum / totalWeight;
  const combinedOdds = Math.exp(combinedLogOdds);
  return combinedOdds / (1 + combinedOdds);
}

/** Qualitative impact of the domain a finding belongs to, used by the
 * severity rubric below. Documented in docs/INTELLIGENCE.md §6. */
export type ImpactTier = "low" | "medium" | "high" | "critical";

const IMPACT_SCORE: Record<ImpactTier, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** Maps (probability of the adverse outcome, impact tier) onto a 1-5
 * severity, using a standard risk-matrix: severity = round(probabilityBand *
 * impactScore), clamped to [1,5]. probabilityBand buckets probability into
 * 1 (unlikely) .. 5 (near-certain) in 20% steps before multiplying, which
 * keeps the mapping a simple, auditable lookup rather than a continuous
 * formula that could produce deceptively precise-looking severities. */
export function severityFromRisk(probability: number, impact: ImpactTier): Severity {
  const probabilityBand = Math.min(5, Math.max(1, Math.ceil(probability * 5)));
  const impactScore = IMPACT_SCORE[impact];
  const raw = Math.round((probabilityBand * impactScore) / 4);
  return Math.min(5, Math.max(1, raw)) as Severity;
}
