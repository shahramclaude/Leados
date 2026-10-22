// src/lib/humanNeeds.ts
//
// Cognitive-style ("human needs") model — Part 41.
//
// This module infers *presentation* preferences only: detail-vs-summary,
// visual-vs-tabular, deliberative-vs-quick. It deliberately has no awareness
// of domain facts, severity, or content — it cannot filter or select content
// even by accident, because it never receives fact data as input. That
// separation is the structural enforcement behind the "adaptation changes
// form, not substance" rule tested in tests/presentationAdapter.contentParity.test.ts.

import { clamp01, recencyWeight, type Domain } from "@/lib/familiarity";

export type StyleActionType =
  | "expand_detail"
  | "collapse_detail"
  | "switch_to_table"
  | "switch_to_chart"
  | "time_on_summary"
  | "time_on_detail"
  | "quick_decision"
  | "deliberate_review";

export interface BehaviorSample {
  domain: Domain;
  action: StyleActionType;
  /** 0..1 normalized magnitude/duration of the behavior. */
  value: number;
  timestamp: number;
}

export interface StyleAxis {
  /** -1..1 */
  value: number;
  /** 0..1 — declared answers start high-confidence; inferred-only starts low. */
  confidence: number;
}

export interface CognitiveStyleProfile {
  /** -1 = prefers summaries, +1 = prefers full detail */
  detailVsSummary: StyleAxis;
  /** -1 = prefers tables, +1 = prefers visual/chart presentation */
  visualVsTabular: StyleAxis;
  /** -1 = decides quickly, +1 = deliberates/reviews thoroughly */
  deliberativeVsQuick: StyleAxis;
  /** true once the user has explicitly answered the first-run questionnaire. */
  declared: boolean;
}

export const DEFAULT_STYLE: CognitiveStyleProfile = {
  detailVsSummary: { value: 0, confidence: 0 },
  visualVsTabular: { value: 0, confidence: 0 },
  deliberativeVsQuick: { value: 0, confidence: 0 },
  declared: false,
};

const STYLE_HALF_LIFE_MS = 21 * 24 * 60 * 60 * 1000;

type AxisKey = "detailVsSummary" | "visualVsTabular" | "deliberativeVsQuick";

const ACTION_AXIS: Record<StyleActionType, { axis: AxisKey; sign: 1 | -1 }> = {
  expand_detail: { axis: "detailVsSummary", sign: 1 },
  collapse_detail: { axis: "detailVsSummary", sign: -1 },
  time_on_detail: { axis: "detailVsSummary", sign: 1 },
  time_on_summary: { axis: "detailVsSummary", sign: -1 },
  switch_to_chart: { axis: "visualVsTabular", sign: 1 },
  switch_to_table: { axis: "visualVsTabular", sign: -1 },
  deliberate_review: { axis: "deliberativeVsQuick", sign: 1 },
  quick_decision: { axis: "deliberativeVsQuick", sign: -1 },
};

function inferAxis(samples: BehaviorSample[], axis: AxisKey, now: number): StyleAxis {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const sample of samples) {
    const mapping = ACTION_AXIS[sample.action];
    if (!mapping || mapping.axis !== axis) continue;
    if (sample.timestamp > now) continue;
    const weight = recencyWeight(now - sample.timestamp, STYLE_HALF_LIFE_MS);
    weightedSum += weight * mapping.sign * clamp01(sample.value);
    totalWeight += weight;
  }
  if (totalWeight === 0) return { value: 0, confidence: 0 };
  const value = Math.max(-1, Math.min(1, weightedSum / totalWeight));
  const confidence = clamp01(1 - Math.exp(-0.2 * totalWeight));
  return { value, confidence };
}

/** Infer a cognitive-style profile purely from behavior — no declared input. */
export function inferCognitiveStyle(samples: BehaviorSample[], now: number = Date.now()): CognitiveStyleProfile {
  return {
    detailVsSummary: inferAxis(samples, "detailVsSummary", now),
    visualVsTabular: inferAxis(samples, "visualVsTabular", now),
    deliberativeVsQuick: inferAxis(samples, "deliberativeVsQuick", now),
    declared: false,
  };
}

/**
 * Blend a declared (questionnaire) style with an inferred (behavioral) style.
 * Declared answers are a strong prior that behavioral evidence can gradually
 * shift — but never silently overwritten. `declared` stays true once set.
 */
export function blendStyle(
  declared: CognitiveStyleProfile | null,
  inferred: CognitiveStyleProfile,
): CognitiveStyleProfile {
  if (!declared) return inferred;
  const blendAxis = (d: StyleAxis, i: StyleAxis): StyleAxis => {
    const declaredWeight = 0.6; // declared answers keep meaningful influence
    const totalConfidence = declaredWeight + i.confidence;
    if (totalConfidence === 0) return d;
    const value = (d.value * declaredWeight + i.value * i.confidence) / totalConfidence;
    const confidence = Math.max(d.confidence, i.confidence);
    return { value: Math.max(-1, Math.min(1, value)), confidence: clamp01(confidence) };
  };
  return {
    detailVsSummary: blendAxis(declared.detailVsSummary, inferred.detailVsSummary),
    visualVsTabular: blendAxis(declared.visualVsTabular, inferred.visualVsTabular),
    deliberativeVsQuick: blendAxis(declared.deliberativeVsQuick, inferred.deliberativeVsQuick),
    declared: true,
  };
}

export function declaredStyleFromAnswers(answers: {
  detailVsSummary: number;
  visualVsTabular: number;
  deliberativeVsQuick: number;
}): CognitiveStyleProfile {
  const clampAxis = (v: number): StyleAxis => ({ value: Math.max(-1, Math.min(1, v)), confidence: 0.75 });
  return {
    detailVsSummary: clampAxis(answers.detailVsSummary),
    visualVsTabular: clampAxis(answers.visualVsTabular),
    deliberativeVsQuick: clampAxis(answers.deliberativeVsQuick),
    declared: true,
  };
}
