// src/lib/beliefFabric.ts
//
// PROVENANCE NOTE: Part 1 ("belief fabric") is not present in this sandbox.
// This file is a minimal, self-contained reconstruction that exposes only
// what Part 5 (Financial Nervous System) needs: a `financialRisk`
// posterior probability in [0, 1]. It implements a simple, explicitly
// documented Bayesian odds update (log-odds additive evidence combination,
// a standard/textbook technique — not copied from any file in this repo,
// since no beliefFabric.ts existed here).
//
// Each piece of "evidence" (short runway, weak unit economics, high burn
// multiple) nudges the posterior away from a neutral prior via a fixed,
// explicitly labeled log-odds weight. These weights are DESIGN PARAMETERS,
// not calibrated from historical data.

export interface FinancialRiskEvidence {
  /** Median simulated runway, in months. */
  runwayP50: number;
  /** LTV:CAC ratio, or null if unknown. */
  ltvCacRatio: number | null;
  /** Net burn / net new ARR, or null if unknown. */
  burnMultiple: number | null;
  /** Probability (0-1) that the company goes under within 6 months. */
  probabilityCritical: number;
}

function logit(p: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * computeFinancialRiskPosterior — Bayesian-style log-odds update.
 *
 * PRIOR: 0.3 ("neutral-leaning-safe" baseline risk for an operating
 * company), a DESIGN PARAMETER.
 *
 * EVIDENCE WEIGHTS (all DESIGN PARAMETERS, not statistically calibrated):
 *   - runway p50 < 6 months:      +1.6 log-odds (strong risk signal)
 *   - runway p50 < 12 months:     +0.8 log-odds (moderate risk signal)
 *   - ltvCacRatio < 1 (known):    +1.0 log-odds (unit economics broken)
 *   - ltvCacRatio < 2 (known):    +0.4 log-odds (unit economics weak)
 *   - burnMultiple > 2 (known):   +0.6 log-odds (inefficient growth)
 *   - probabilityCritical > 0.3:  +0.7 log-odds (fat left tail)
 */
export function computeFinancialRiskPosterior(
  evidence: FinancialRiskEvidence
): number {
  const PRIOR = 0.3; // DESIGN PARAMETER
  let logOdds = logit(PRIOR);

  if (evidence.runwayP50 < 6) {
    logOdds += 1.6; // DESIGN PARAMETER
  } else if (evidence.runwayP50 < 12) {
    logOdds += 0.8; // DESIGN PARAMETER
  }

  if (evidence.ltvCacRatio !== null) {
    if (evidence.ltvCacRatio < 1) {
      logOdds += 1.0; // DESIGN PARAMETER
    } else if (evidence.ltvCacRatio < 2) {
      logOdds += 0.4; // DESIGN PARAMETER
    }
  }

  if (evidence.burnMultiple !== null && evidence.burnMultiple > 2) {
    logOdds += 0.6; // DESIGN PARAMETER
  }

  if (evidence.probabilityCritical > 0.3) {
    logOdds += 0.7; // DESIGN PARAMETER
  }

  return sigmoid(logOdds);
}
