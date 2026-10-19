// src/lib/beliefFabric.ts
//
// NEW MODULE standing in for the "Part 1" belief/uncertainty fabric
// referenced by this brief. No prior file existed in this checkout to read
// (see provenance note in src/lib/types.ts), so this implements the
// minimum surface Part 3 needs: a noisy-OR fusion primitive for combining
// independent risk signals, an evidence-based confidence curve, and a
// builder for UncertaintyFlag[] ("low confidence — log more data").

import type { PersonId, UncertaintyFlag } from "./types";

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Noisy-OR fusion: combines N independent probabilities of "risk is
 * present" into a single probability that at least one underlying cause
 * is active. CITATION: standard noisy-OR formula from Bayesian network
 * literature — P(effect) = 1 - Π(1 - p_i). General technique, not copied
 * from any file in this repo (none existed).
 * Callers: src/lib/flightRisk.ts (combineFactors), src/lib/fatigue.ts
 * (computeBurnoutRisk) — 2 call sites.
 */
export function noisyOr(probabilities: number[]): number {
  const clamped = probabilities.map((p) => Math.max(0, Math.min(1, p)));
  const productOfComplements = clamped.reduce((acc, p) => acc * (1 - p), 1);
  return 1 - productOfComplements;
}

/**
 * Confidence grows with the amount of evidence logged for a person
 * (1:1s, events) and saturates — more data helps less once you already
 * have plenty. UNVERIFIED (original heuristic authored this session):
 * confidence = 1 - e^(-count / saturationAt).
 * Callers: buildUncertaintyFlags (below), 1 call site.
 */
export function computeConfidence(evidenceCount: number, saturationAt = 6): number {
  if (evidenceCount <= 0) return 0;
  return 1 - Math.exp(-evidenceCount / saturationAt);
}

export interface EvidenceSummary {
  personId: PersonId;
  oneOnOneCount: number;
  eventCount: number;
}

/**
 * For each person, derive a confidence score for their risk-node
 * estimates (flight risk, burnout, succession) from how much 1:1 and
 * event evidence exists, and flag anyone below LOW_CONFIDENCE_THRESHOLD.
 * Caller: src/app/api/people/intelligence/route.ts (1 call site).
 */
export function buildUncertaintyFlags(summaries: EvidenceSummary[]): UncertaintyFlag[] {
  const flags: UncertaintyFlag[] = [];
  for (const s of summaries) {
    const evidenceCount = s.oneOnOneCount * 2 + s.eventCount; // 1:1s weighted higher
    const confidence = computeConfidence(evidenceCount);
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      flags.push({
        nodeId: `person-risk:${s.personId}`,
        personId: s.personId,
        confidence: Math.round(confidence * 100) / 100,
        message: "Low confidence — log more data to improve accuracy",
      });
    }
  }
  return flags;
}
