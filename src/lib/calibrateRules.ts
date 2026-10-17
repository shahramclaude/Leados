// js/calibrate_rules.js (requested module) -> src/lib/calibrateRules.ts.
// Lets a user mark a triggered rule as "confirmed" or "false positive" and
// adjusts a per-rule calibration weight (simple exponential moving average)
// used to nudge displayed severity. Entirely original to this workspace.

import type { FeedbackRecord, Rule, Severity } from "./types";

const ALPHA = 0.3; // EMA smoothing factor

/** weight in [0,1]; 1 = fully trust this rule's alerts, 0 = mostly false positives. */
export function computeWeights(feedback: FeedbackRecord[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const record of feedback) {
    const prior = weights[record.ruleId] ?? 0.5;
    const sample = record.outcome === "confirmed" ? 1 : 0;
    weights[record.ruleId] = prior + ALPHA * (sample - prior);
  }
  return weights;
}

export function calibratedSeverity(rule: Rule, declaredSeverity: Severity, weights: Record<string, number>): Severity {
  const weight = weights[rule.id];
  if (weight === undefined) return declaredSeverity;
  if (weight < 0.3 && declaredSeverity !== "low") {
    // Repeatedly disputed -> step down one level.
    return declaredSeverity === "high" ? "medium" : "low";
  }
  if (weight > 0.85 && declaredSeverity !== "high") {
    // Repeatedly confirmed -> step up one level.
    return declaredSeverity === "low" ? "medium" : "high";
  }
  return declaredSeverity;
}

export function summarizeCalibration(feedback: FeedbackRecord[]): {
  ruleId: string;
  confirmed: number;
  falsePositive: number;
  weight: number;
}[] {
  const weights = computeWeights(feedback);
  const grouped = new Map<string, { confirmed: number; falsePositive: number }>();
  for (const f of feedback) {
    const g = grouped.get(f.ruleId) ?? { confirmed: 0, falsePositive: 0 };
    if (f.outcome === "confirmed") g.confirmed += 1;
    else g.falsePositive += 1;
    grouped.set(f.ruleId, g);
  }
  return Array.from(grouped.entries()).map(([ruleId, counts]) => ({
    ruleId,
    ...counts,
    weight: weights[ruleId] ?? 0.5,
  }));
}
