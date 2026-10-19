// src/lib/intelligence/explain.ts
//
// The explainability contract (Part 3 §2). `explainFinding()` is the ONLY
// sanctioned way to turn an internal computation (belief, rule, forecast,
// causal estimate, fused finding) into something a UI can render. No view
// may construct an `Explanation` object by hand — this is enforced by the
// test in src/lib/intelligence/__tests__/explain.test.ts, which scans every
// engine's public output through `isValidExplanation`.
import { randomUUID } from "crypto";
import { betaCredibleInterval, betaMean } from "./bayesian";
import type { Belief } from "./beliefFabric";
import type { Driver, EngineMethod, EvidenceRef, Explanation, Interval } from "./types";
import { isValidExplanation } from "./types";

export interface ExplainInput {
  label: string;
  value: number;
  interval: Interval;
  drivers: Driver[];
  evidence: EvidenceRef[];
  method: EngineMethod;
  confidence: number;
  caveats?: string[];
  asOf?: string;
  id?: string;
}

/** Builds a validated `Explanation`. Throws if the result would violate the
 * contract, so a bug in an engine fails loudly in tests/CI rather than
 * shipping a bare number to the UI. */
export function explainFinding(input: ExplainInput): Explanation {
  const explanation: Explanation = {
    id: input.id ?? randomUUID(),
    label: input.label,
    value: input.value,
    interval: input.interval,
    drivers: [...input.drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    evidence: input.evidence,
    method: input.method,
    asOf: input.asOf ?? new Date().toISOString(),
    confidence: input.confidence,
    caveats: input.caveats ?? [],
  };
  if (!isValidExplanation(explanation)) {
    throw new Error(`explainFinding() produced an invalid Explanation for "${input.label}"`);
  }
  return explanation;
}

/** Convenience constructor for the common case of explaining a belief
 * straight out of the belief fabric (method="bayesian-belief"). */
export function explainBelief(
  belief: Belief,
  label: string,
  opts: { level?: number; extraDrivers?: Driver[]; extraEvidence?: EvidenceRef[]; extraCaveats?: string[] } = {},
): Explanation {
  const level = opts.level ?? 0.9;
  const ci = betaCredibleInterval(belief.params, level);
  const drivers: Driver[] = belief.provenance.map((p) => ({
    name: p.source,
    contribution: Number((p.posteriorMean - p.priorMean).toFixed(4)),
    description: p.wasContradiction
      ? `Contradicted prior belief (z=${p.contradictionZ.toFixed(2)}); confidence was reduced, not averaged away.`
      : undefined,
  }));
  const evidence: EvidenceRef[] = belief.provenance.map((p) => ({
    type: p.evidence.type,
    id: p.evidence.id,
    label: p.evidence.label,
    timestamp: p.evidence.timestamp ?? p.observedAt,
    weight: p.evidence.weight,
  }));

  const caveats: string[] = [];
  if (belief.contradictionCount > 0) {
    caveats.push(
      `${belief.contradictionCount} contradicting observation(s) detected; confidence explicitly reduced rather than averaging sources.`,
    );
  }
  if (belief.params.alpha + belief.params.beta <= 2) {
    caveats.push("No evidence observed yet; this is the uninformative Beta(1,1) prior.");
  }

  return explainFinding({
    id: belief.id,
    label,
    value: betaMean(belief.params),
    interval: { low: ci.low, high: ci.high, level, kind: "credible" },
    drivers: [...drivers, ...(opts.extraDrivers ?? [])],
    evidence: [...evidence, ...(opts.extraEvidence ?? [])],
    method: "bayesian-belief",
    confidence: belief.confidence,
    caveats: [...caveats, ...(opts.extraCaveats ?? [])],
    asOf: belief.updatedAt,
  });
}

/** Re-exported for convenience so views only need one import for both the
 * builder and the type guard. */
export { isValidExplanation };
