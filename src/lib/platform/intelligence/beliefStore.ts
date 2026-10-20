/**
 * beliefStore.ts — stateful home for `Belief` objects, keyed by
 * `proposition`. Delegates all math to `beliefFabric.ts` (pure); this file
 * only persists the current belief per proposition and appends
 * `evidence.recorded` audit events — which is what `forecastCache.ts`
 * listens for to invalidate caches (standing order F: invalidate on new
 * evidence, not timers).
 */

import {
  newBinaryBelief,
  newContinuousBelief,
  newRateBelief,
  updateBinaryBelief,
  updateContinuousBelief,
  updateRateBelief,
  type BinaryEvidenceInput,
} from "../../domain/intelligence/beliefFabric";
import type { Belief, EvidenceRef } from "../../domain/intelligence/types";
import { eventLog } from "./eventLog";
import { sourceReliabilityStore } from "./sourceReliabilityStore";

class BeliefStore {
  private beliefs = new Map<string, Belief>();

  get(proposition: string): Belief | undefined {
    return this.beliefs.get(proposition);
  }

  all(): Belief[] {
    return [...this.beliefs.values()];
  }

  resetForTests() {
    this.beliefs.clear();
  }

  ensureBinary(proposition: string, priorP: number): Belief {
    const existing = this.beliefs.get(proposition);
    if (existing) return existing;
    const created = newBinaryBelief(proposition, priorP);
    this.beliefs.set(proposition, created);
    return created;
  }

  ensureRate(proposition: string, alpha: number, beta: number): Belief {
    const existing = this.beliefs.get(proposition);
    if (existing) return existing;
    const created = newRateBelief(proposition, alpha, beta);
    this.beliefs.set(proposition, created);
    return created;
  }

  ensureContinuous(proposition: string, mu: number, sigma: number): Belief {
    const existing = this.beliefs.get(proposition);
    if (existing) return existing;
    const created = newContinuousBelief(proposition, mu, sigma);
    this.beliefs.set(proposition, created);
    return created;
  }

  /** Binary update: looks up each evidence item's source reliability from
   * `sourceReliabilityStore` so callers don't have to plumb it manually. */
  updateBinary(
    proposition: string,
    newEvidence: Array<Omit<BinaryEvidenceInput, "rawReliability">>,
    asOf: string,
  ): Belief {
    const prior = this.beliefs.get(proposition) ?? newBinaryBelief(proposition, 0.5);
    const withReliability: BinaryEvidenceInput[] = newEvidence.map((e) => ({
      ...e,
      rawReliability: sourceReliabilityStore.get(e.evidence.sourceId).reliability,
    }));
    const updated = updateBinaryBelief(proposition, prior, withReliability, asOf);
    this.beliefs.set(proposition, updated);
    eventLog.append("evidence.recorded", { proposition, kind: "binary", evidenceIds: newEvidence.map((e) => e.evidence.id) });
    return updated;
  }

  updateRate(proposition: string, successes: number, failures: number, evidence: EvidenceRef[], asOf: string): Belief {
    const prior = this.beliefs.get(proposition) ?? newRateBelief(proposition, 1, 1);
    const updated = updateRateBelief(proposition, prior, successes, failures, evidence, asOf);
    this.beliefs.set(proposition, updated);
    eventLog.append("evidence.recorded", { proposition, kind: "rate", evidenceIds: evidence.map((e) => e.id) });
    return updated;
  }

  updateContinuous(
    proposition: string,
    obs: number,
    obsSigma: number,
    evidence: EvidenceRef[],
    asOf: string,
    options?: { alpha?: number; useConjugate?: boolean },
  ): Belief {
    const prior = this.beliefs.get(proposition) ?? newContinuousBelief(proposition, obs, obsSigma);
    const updated = updateContinuousBelief(proposition, prior, obs, obsSigma, evidence, asOf, options);
    this.beliefs.set(proposition, updated);
    eventLog.append("evidence.recorded", { proposition, kind: "continuous", evidenceIds: evidence.map((e) => e.id) });
    return updated;
  }
}

export const beliefStore = new BeliefStore();
