// src/lib/intelligence/predictiveScoring.ts
//
// Predictive scoring combines a belief-network/rule signal with linear,
// documented feature weights into a single explainable score (e.g. "lead
// score", "renewal score"). Because the scoring function is linear, each
// feature's contribution is EXACT (weight * value), not an approximation —
// so `drivers[]` in the resulting Explanation are reproducible by a test,
// as the standing order requires (no SHAP/LIME approximation needed at this
// scale).
import { explainFinding } from "./explain";
import type { Driver, EvidenceRef, Explanation } from "./types";

export interface ScoringFeature {
  name: string;
  value: number;
  /** linear weight, fit offline and documented in docs/INTELLIGENCE.md §6 */
  weight: number;
  evidence?: EvidenceRef;
}

export interface ScoringModel {
  id: string;
  label: string;
  intercept: number;
  features: ScoringFeature[];
}

/** LEADOS lead-quality score: logistic link over a linear combination of
 * documented features. Weights are placeholders calibrated against the
 * golden dataset (see goldenDataset.ts + ruleCalibration.ts); in production
 * they would be refit from the backtest history. */
export const LEAD_SCORE_MODEL_WEIGHTS: Record<string, number> = {
  engagementScore: 0.9,
  firmographicFit: 0.7,
  intentSignalStrength: 1.1,
  daysSinceLastTouch: -0.4,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function scoreModel(model: ScoringModel): Explanation {
  const linear = model.intercept + model.features.reduce((sum, f) => sum + f.weight * f.value, 0);
  const probability = sigmoid(linear);

  // Exact per-feature contribution to the *linear* score, then expressed as
  // the marginal change in probability that feature's contribution implies
  // relative to baseline (intercept-only) — this keeps contributions
  // additive and auditable while still being in probability units.
  const baseline = sigmoid(model.intercept);
  const drivers: Driver[] = model.features.map((f) => {
    const withoutFeature = linear - f.weight * f.value;
    const probWithout = sigmoid(withoutFeature);
    return {
      name: f.name,
      contribution: Number((probability - probWithout).toFixed(4)),
      description: `weight=${f.weight}, value=${f.value}`,
    };
  });

  const evidence: EvidenceRef[] = model.features
    .filter((f): f is ScoringFeature & { evidence: EvidenceRef } => !!f.evidence)
    .map((f) => f.evidence);

  // Confidence reflects how far the linear score (logit) sits from the
  // decision boundary (logit=0, probability=0.5): confidence = 1 - 1/(1+|logit|),
  // a simple, monotonic, bounded-in-[0,1) transform. A logit of 0 (maximum
  // uncertainty) yields confidence 0; large |logit| asymptotes to 1.
  const confidence = Math.max(0.05, Math.min(0.95, 1 - 1 / (1 + Math.abs(linear))));

  return explainFinding({
    id: model.id,
    label: model.label,
    value: probability,
    interval: {
      low: Math.max(0, probability - (1 - confidence) * 0.3),
      high: Math.min(1, probability + (1 - confidence) * 0.3),
      level: 0.8,
      kind: "confidence",
    },
    drivers,
    evidence,
    method: "predictive-scoring",
    confidence,
    caveats:
      drivers.length === 0
        ? ["No features supplied; score reflects the model intercept (baseline rate) only.", `baseline=${baseline.toFixed(3)}`]
        : [],
  });
}
