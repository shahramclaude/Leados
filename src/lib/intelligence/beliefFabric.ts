// src/lib/intelligence/beliefFabric.ts
//
// The unified probabilistic belief state described in Part 3 §1. Every
// domain fact LEADOS reasons about ("this account will renew", "this metric
// is healthy", "this rule fires correctly") is represented as a `Belief`:
// a Beta distribution (prior -> posterior) plus a provenance trail of the
// evidence that produced it.
//
// Updating is strict Bayesian conjugate updating (see bayesian.ts). When two
// pieces of evidence disagree (a "contradiction"), we do NOT silently
// average them into the posterior mean. Instead we still perform the
// Bayesian update (so the posterior reflects all evidence) but we also:
//   1. record the contradiction in provenance,
//   2. apply an explicit confidence penalty proportional to disagreement,
//   3. surface a caveat string so the UI/explain layer can warn the user.
import {
  BetaParams,
  UNINFORMATIVE_PRIOR,
  betaConfidence,
  betaCredibleInterval,
  betaMean,
  betaUpdate,
  contradictionZScore,
} from "./bayesian";
import type { EvidenceRef } from "./types";

export interface Observation {
  source: string;
  evidence: EvidenceRef;
  /** weight of evidence supporting a "true"/"success" outcome, in [0, ~5] */
  successWeight: number;
  /** weight of evidence supporting a "false"/"failure" outcome, in [0, ~5] */
  failureWeight: number;
}

export interface ProvenanceEntry {
  source: string;
  evidence: EvidenceRef;
  priorMean: number;
  posteriorMean: number;
  wasContradiction: boolean;
  contradictionZ: number;
  observedAt: string;
}

export interface Belief {
  id: string;
  subject: string;
  domain: string;
  params: BetaParams;
  confidence: number;
  provenance: ProvenanceEntry[];
  contradictionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** z-score beyond which a new observation is treated as contradicting the
 * current belief rather than ordinary sampling noise. z=1.64 ~ one-tailed
 * 95% threshold for a unit-normal approximation of the Beta's spread. */
export const CONTRADICTION_Z_THRESHOLD = 1.64;

/** Contradiction penalty growth constant: confidence is multiplied by
 * (1 - penalty) in bayesian.betaConfidence; a single contradiction costs
 * 15% of remaining confidence, compounding with repeated contradictions so
 * the belief cannot stay "confident" while disagreeing sources keep
 * appearing. */
const CONTRADICTION_PENALTY_STEP = 0.15;

export class BeliefFabric {
  private beliefs = new Map<string, Belief>();

  /** Create (if absent) and return a belief, seeded with the uninformative
   * Beta(1,1) prior (maximum entropy: "we know nothing yet"). */
  getOrCreate(id: string, subject: string, domain: string, prior: BetaParams = UNINFORMATIVE_PRIOR): Belief {
    const existing = this.beliefs.get(id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const belief: Belief = {
      id,
      subject,
      domain,
      params: { ...prior },
      confidence: betaConfidence(prior, 0),
      provenance: [],
      contradictionCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.beliefs.set(id, belief);
    return belief;
  }

  get(id: string): Belief | undefined {
    return this.beliefs.get(id);
  }

  list(): Belief[] {
    return [...this.beliefs.values()];
  }

  /** Apply a Bayesian update from a new observation. Returns the updated
   * belief. This is the ONLY way beliefs change — there is no code path
   * that averages or overwrites a posterior directly. */
  observe(id: string, subject: string, domain: string, obs: Observation): Belief {
    const belief = this.getOrCreate(id, subject, domain);
    const priorMean = betaMean(belief.params);
    const observedMean =
      obs.successWeight + obs.failureWeight > 0
        ? obs.successWeight / (obs.successWeight + obs.failureWeight)
        : priorMean;
    const z = contradictionZScore(belief.params, observedMean);
    const wasContradiction = z > CONTRADICTION_Z_THRESHOLD && belief.provenance.length > 0;

    const nextParams = betaUpdate(belief.params, obs.successWeight, obs.failureWeight);
    const nextContradictionCount = belief.contradictionCount + (wasContradiction ? 1 : 0);
    const penalty = 1 - (1 - CONTRADICTION_PENALTY_STEP) ** nextContradictionCount;

    const posteriorMean = betaMean(nextParams);
    const entry: ProvenanceEntry = {
      source: obs.source,
      evidence: obs.evidence,
      priorMean,
      posteriorMean,
      wasContradiction,
      contradictionZ: z,
      observedAt: new Date().toISOString(),
    };

    const updated: Belief = {
      ...belief,
      params: nextParams,
      confidence: betaConfidence(nextParams, penalty),
      provenance: [...belief.provenance, entry],
      contradictionCount: nextContradictionCount,
      updatedAt: entry.observedAt,
    };
    this.beliefs.set(id, updated);
    return updated;
  }

  /** Posterior mean (point estimate) for a belief. */
  mean(id: string): number | undefined {
    const belief = this.beliefs.get(id);
    return belief ? betaMean(belief.params) : undefined;
  }

  /** 90% credible interval for a belief's posterior. */
  interval(id: string, level = 0.9): { low: number; high: number } | undefined {
    const belief = this.beliefs.get(id);
    return belief ? betaCredibleInterval(belief.params, level) : undefined;
  }

  /** Caveats describing contradiction history, for the explain layer. */
  caveats(id: string): string[] {
    const belief = this.beliefs.get(id);
    if (!belief) return [];
    const caveats: string[] = [];
    if (belief.contradictionCount > 0) {
      caveats.push(
        `${belief.contradictionCount} contradicting observation(s) detected; confidence was explicitly reduced instead of averaging sources.`,
      );
    }
    if (belief.params.alpha + belief.params.beta <= 2) {
      caveats.push("No evidence observed yet; this is the uninformative prior.");
    }
    return caveats;
  }

  snapshot(): Record<string, Belief> {
    return Object.fromEntries(this.beliefs.entries());
  }

  hydrate(beliefs: Belief[]): void {
    for (const b of beliefs) this.beliefs.set(b.id, b);
  }
}

/** Process-wide singleton used by API routes / the eval harness so beliefs
 * persist across requests within a server lifetime. Tests create their own
 * instances instead of using this singleton, so they stay isolated. */
export const globalBeliefFabric = new BeliefFabric();
