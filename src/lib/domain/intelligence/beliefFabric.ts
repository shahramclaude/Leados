/**
 * beliefFabric.ts — the single belief engine for LEADOS (Part 04-A).
 *
 * This is the ONE place that turns (prior belief + new evidence) into a
 * posterior `Belief`. It supersedes any previous `bayesianNetwork.ts` /
 * `predictiveScoring.ts` / `temporalBeliefTracker.ts` scoring paths found in
 * the duplication cluster (`docs/AUDIT-2026.md`): those concerns are now
 * just call sites of this module —
 *   - `bayesianNetwork.ts` → binary propositions → `updateBinaryBelief`
 *   - `predictiveScoring.ts` → rate propositions → `updateRateBelief`
 *   - `temporalBeliefTracker.ts` → continuous time series → `updateContinuousBelief`
 * Stateful storage (keeping a map of propositions -> Belief across calls)
 * lives in `src/lib/platform/intelligence/beliefStore.ts`; this file is pure.
 */

import {
  betaBinomialUpdate,
  betaInterval,
  daysBetween,
  decayWeight,
  ewmaUpdate,
  gaussianConjugateUpdate,
  logOddsPool,
  normalInterval,
  type LogOddsEvidenceItem,
} from "./bayesian";
import type {
  Belief,
  BetaDistribution,
  EvidenceRef,
  NormalDistribution,
} from "./types";

export type NowFn = () => string;
const defaultNow: NowFn = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// A1. Binary belief via log-odds pooling, with decay applied to reliability
// ---------------------------------------------------------------------------

export type BinaryEvidenceInput = {
  evidence: EvidenceRef;
  p: number;
  rawReliability: number;
  domain: string; // selects the decay half-life, see bayesian.ts DOMAIN_HALF_LIFE_DAYS
};

export function updateBinaryBelief(
  proposition: string,
  prior: Belief,
  newEvidence: BinaryEvidenceInput[],
  asOf: string,
  now: NowFn = defaultNow,
): Belief {
  if (prior.prior.kind !== "beta" && prior.posterior.kind !== "beta") {
    // binary beliefs are represented as a beta posterior over "probability true"
  }
  const priorDist = prior.posterior as BetaDistribution;
  const priorP = priorDist.alpha / (priorDist.alpha + priorDist.beta);

  const items: LogOddsEvidenceItem[] = newEvidence.map((e) => {
    const ageDays = daysBetween(e.evidence.observedAt, asOf);
    const decayedWeight = decayWeight(e.rawReliability, ageDays, e.domain);
    return {
      evidence: { ...e.evidence, weightApplied: decayedWeight },
      p: e.p,
      reliability: decayedWeight,
    };
  });

  const { posteriorP, perItemWeight } = logOddsPool(priorP, items);

  // Represent the pooled posterior probability as a Beta distribution whose
  // mean equals posteriorP and whose concentration grows with accumulated
  // evidence weight (more/weightier evidence => tighter interval), a
  // standard "method of moments" re-expression so downstream code can keep
  // using Beta machinery (interval, variance) uniformly.
  const totalWeight = items.reduce((s, it) => s + (perItemWeight[it.evidence.id] ?? 0), 0);
  const priorStrength = priorDist.alpha + priorDist.beta;
  const concentration = Math.max(2, priorStrength + totalWeight * 4);
  const posterior: BetaDistribution = {
    kind: "beta",
    alpha: posteriorP * concentration,
    beta: (1 - posteriorP) * concentration,
  };

  const evidenceOut: EvidenceRef[] = items.map((it) => it.evidence);
  const sourceReliability = { ...prior.sourceReliability };
  newEvidence.forEach((e) => {
    sourceReliability[e.evidence.sourceId] = e.rawReliability;
  });

  return {
    proposition,
    kind: "binary",
    prior: prior.posterior,
    posterior,
    interval: betaInterval(posterior, 0.95),
    evidence: [...prior.evidence, ...evidenceOut],
    sourceReliability,
    updatedAt: now(),
    asOf,
    method: "log-odds-pool",
  };
}

// ---------------------------------------------------------------------------
// A2. Rate belief via Beta-Binomial conjugate update
// ---------------------------------------------------------------------------

export function updateRateBelief(
  proposition: string,
  prior: Belief,
  successes: number,
  failures: number,
  evidence: EvidenceRef[],
  asOf: string,
  now: NowFn = defaultNow,
): Belief {
  const priorDist = prior.posterior as BetaDistribution;
  const posterior = betaBinomialUpdate(priorDist, successes, failures);
  return {
    proposition,
    kind: "rate",
    prior: prior.posterior,
    posterior,
    interval: betaInterval(posterior, 0.95),
    evidence: [...prior.evidence, ...evidence],
    sourceReliability: prior.sourceReliability,
    updatedAt: now(),
    asOf,
    method: "beta-binomial",
  };
}

// ---------------------------------------------------------------------------
// A3. Continuous belief via EWMA-with-uncertainty (see bayesian.ts for why
// EWMA is chosen over plain Gaussian conjugate for streaming metrics)
// ---------------------------------------------------------------------------

export function updateContinuousBelief(
  proposition: string,
  prior: Belief,
  obs: number,
  obsSigma: number,
  evidence: EvidenceRef[],
  asOf: string,
  options: { alpha?: number; useConjugate?: boolean } = {},
  now: NowFn = defaultNow,
): Belief {
  const priorDist = prior.posterior as NormalDistribution;
  const posterior = options.useConjugate
    ? gaussianConjugateUpdate(priorDist, obs, obsSigma)
    : ewmaUpdate(priorDist, obs, obsSigma, options.alpha ?? 0.3);
  return {
    proposition,
    kind: "continuous",
    prior: prior.posterior,
    posterior,
    interval: normalInterval(posterior, 0.95),
    evidence: [...prior.evidence, ...evidence],
    sourceReliability: prior.sourceReliability,
    updatedAt: now(),
    asOf,
    method: options.useConjugate ? "gaussian-conjugate" : "ewma",
  };
}

// ---------------------------------------------------------------------------
// Factories for brand-new beliefs (no prior evidence yet)
// ---------------------------------------------------------------------------

export function newBinaryBelief(proposition: string, priorP: number, strength = 2, now: NowFn = defaultNow): Belief {
  const dist: BetaDistribution = { kind: "beta", alpha: priorP * strength, beta: (1 - priorP) * strength };
  const asOf = now();
  return {
    proposition,
    kind: "binary",
    prior: dist,
    posterior: dist,
    interval: betaInterval(dist, 0.95),
    evidence: [],
    sourceReliability: {},
    updatedAt: asOf,
    asOf,
    method: "log-odds-pool",
  };
}

export function newRateBelief(proposition: string, alpha: number, beta: number, now: NowFn = defaultNow): Belief {
  const dist: BetaDistribution = { kind: "beta", alpha, beta };
  const asOf = now();
  return {
    proposition,
    kind: "rate",
    prior: dist,
    posterior: dist,
    interval: betaInterval(dist, 0.95),
    evidence: [],
    sourceReliability: {},
    updatedAt: asOf,
    asOf,
    method: "beta-binomial",
  };
}

export function newContinuousBelief(proposition: string, mu: number, sigma: number, now: NowFn = defaultNow): Belief {
  const dist: NormalDistribution = { kind: "normal", mu, sigma };
  const asOf = now();
  return {
    proposition,
    kind: "continuous",
    prior: dist,
    posterior: dist,
    interval: normalInterval(dist, 0.95),
    evidence: [],
    sourceReliability: {},
    updatedAt: asOf,
    asOf,
    method: "ewma",
  };
}
