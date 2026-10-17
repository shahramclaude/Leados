// js/selfImprove.js (requested module) -> src/lib/selfImprove.ts.
// Closes the loop: looks at feedback history + institutional memory, derives a
// simple "how calibrated are we" score, and suggests which rules to recalibrate.
// This is a heuristic summary over this workspace's own data — not a claim of
// a trained ML model or verified predictive accuracy.

import type { FeedbackRecord, IncidentRecord } from "./types";
import { summarizeCalibration } from "./calibrateRules";

export interface ImprovementSuggestion {
  ruleId: string;
  reason: string;
}

export interface ImprovementReport {
  totalFeedback: number;
  confirmedRate: number; // 0-1
  suggestions: ImprovementSuggestion[];
  incidentCount: number;
}

export function evaluateCycle(feedback: FeedbackRecord[], incidents: IncidentRecord[]): ImprovementReport {
  const summary = summarizeCalibration(feedback);
  const confirmed = feedback.filter((f) => f.outcome === "confirmed").length;
  const confirmedRate = feedback.length === 0 ? 0 : confirmed / feedback.length;

  const suggestions: ImprovementSuggestion[] = summary
    .filter((s) => s.weight < 0.3 || s.weight > 0.85)
    .map((s) => ({
      ruleId: s.ruleId,
      reason:
        s.weight < 0.3
          ? `Marked false-positive ${s.falsePositive}x vs confirmed ${s.confirmed}x — consider lowering default severity.`
          : `Confirmed ${s.confirmed}x with few/no false positives — consider raising default severity.`,
    }));

  return { totalFeedback: feedback.length, confirmedRate, suggestions, incidentCount: incidents.length };
}
