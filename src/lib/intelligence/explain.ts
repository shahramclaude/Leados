/**
 * explain.ts — turns belief primitives into Explain<T> envelopes.
 *
 * Confidence-class policy (documented, not invented):
 *   evidenceCount === 0        -> "assumed"   (prior only, no data)
 *   0 < evidenceCount < MIN_N  -> "inferred"  (some data, too thin to trust fully)
 *   evidenceCount >= MIN_N     -> "estimated" (enough direct evidence)
 * "observed" is reserved for raw counts with no modeling step at all and is
 * assigned by callers directly (see observedExplain below), never by a belief.
 */

import { RateBelief, LevelBelief, DriftBelief } from "./beliefs";
import { Explain, EvidenceRef, SensitivityFactor, makeExplain, noDataExplain } from "./types";

const MIN_N_ESTIMATED = 20;

function classify(evidenceCount: number): "assumed" | "inferred" | "estimated" {
  if (evidenceCount <= 0) return "assumed";
  if (evidenceCount < MIN_N_ESTIMATED) return "inferred";
  return "estimated";
}

export function explainRate(
  belief: RateBelief,
  opts: {
    method: string;
    modelCardId: string;
    evidence?: EvidenceRef[];
    sensitivity?: SensitivityFactor[];
    nextDataNeeded?: string;
    level?: number;
  },
): Explain<number> {
  const n = belief.evidenceCount;
  if (n <= 0) {
    return noDataExplain(belief.mean, opts.nextDataNeeded ?? "At least a handful of resolved outcomes.", opts.method);
  }
  const cls = classify(n);
  const [lo, hi] = belief.interval(opts.level ?? 0.8);
  return makeExplain({
    value: belief.mean,
    interval: [lo, hi],
    confidenceClass: cls,
    method: opts.method,
    assumptions: [
      `Beta(${belief.alpha.toFixed(1)}, ${belief.beta.toFixed(1)}) conjugate posterior over a Bernoulli-generating process.`,
      "Observations are assumed exchangeable (no seasonal/order effects modeled).",
    ],
    evidence: opts.evidence ?? [],
    sensitivity: opts.sensitivity ?? [],
    modelCardId: opts.modelCardId,
    nextDataNeeded: cls === "inferred" ? `${MIN_N_ESTIMATED - n} more resolved outcomes to reach "estimated".` : undefined,
  });
}

export function explainLevel(
  belief: LevelBelief,
  opts: {
    method: string;
    modelCardId: string;
    evidence?: EvidenceRef[];
    sensitivity?: SensitivityFactor[];
    nextDataNeeded?: string;
    level?: number;
    unit?: string;
  },
): Explain<number> {
  const n = belief.evidenceCount;
  if (n <= 0) {
    return noDataExplain(belief.mean, opts.nextDataNeeded ?? "At least a handful of measurements.", opts.method);
  }
  const cls = classify(n);
  const [lo, hi] = belief.interval(opts.level ?? 0.8);
  return makeExplain({
    value: belief.mean,
    interval: [lo, hi],
    confidenceClass: cls,
    method: opts.method,
    assumptions: [
      "Normal-Inverse-Gamma conjugate posterior over an unknown mean AND unknown variance.",
      "Assumes approximately symmetric, unimodal measurement noise.",
      opts.unit ? `Reported in ${opts.unit}.` : "",
    ].filter(Boolean),
    evidence: opts.evidence ?? [],
    sensitivity: opts.sensitivity ?? [],
    modelCardId: opts.modelCardId,
    nextDataNeeded: cls === "inferred" ? `${MIN_N_ESTIMATED - n} more measurements to reach "estimated".` : undefined,
  });
}

export function explainDrift(
  belief: DriftBelief,
  opts: {
    method: string;
    modelCardId: string;
    evidence?: EvidenceRef[];
    sensitivity?: SensitivityFactor[];
    nextDataNeeded?: string;
  },
): Explain<number> {
  const n = belief.evidenceCount;
  if (n <= 0) {
    return noDataExplain(belief.z, opts.nextDataNeeded ?? "At least a few periods of the metric.", opts.method);
  }
  const cls = classify(n);
  const [lo, hi] = belief.interval();
  const [ctrlLo, ctrlHi] = belief.controlLimits();
  return makeExplain({
    value: belief.z,
    interval: [lo, hi],
    confidenceClass: cls,
    method: opts.method,
    assumptions: [
      `EWMA(lambda=${belief.lambda}) smoothed statistic; control limits at [${ctrlLo.toFixed(2)}, ${ctrlHi.toFixed(2)}].`,
      belief.isOutOfControl
        ? "Current statistic is OUTSIDE 3-sigma control limits — treat as a flagged drift, not noise."
        : "Current statistic is within normal control limits.",
    ],
    evidence: opts.evidence ?? [],
    sensitivity: opts.sensitivity ?? [],
    modelCardId: opts.modelCardId,
    nextDataNeeded: cls === "inferred" ? `${MIN_N_ESTIMATED - n} more periods to reach "estimated".` : undefined,
  });
}

/** For raw, unmodeled counts — the ONLY case allowed to render without an uncertainty affordance. */
export function observedExplain<T>(value: T, method: string, evidence: EvidenceRef[] = []): Explain<T> {
  return makeExplain({
    value,
    interval: [NaN, NaN],
    confidenceClass: "observed",
    method,
    assumptions: ["Direct count/measurement; no statistical model applied."],
    evidence,
    sensitivity: [],
  });
}
