// ════════════════════════════════════════════════════════════════════
// Auto-calibration engine — rules learn from outcomes, and numeric
// thresholds re-center to the organization's own observed distribution
// so they neither fire constantly in a high-performing org nor stay
// silent forever in a struggling one.
// ════════════════════════════════════════════════════════════════════
import { Rule, cloneRule } from "./ruleRegistry";

export interface Outcome {
  ruleId: string;
  firedAt: Date;
  confirmedProblem: boolean;
}

export interface RuleHealthScore {
  precision: number;
  recall: number;
  f1: number;
  lastUpdated: Date;
}

// ─────────────────────────── stats helpers ───────────────────────────

/** Linear-interpolation percentile, p in [0,1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.min(1, Math.max(0, p));
  const idx = clampedP * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─────────────────────────── calibration ───────────────────────────

/**
 * Updates a rule's weight from the precision implied by historical outcomes.
 * A rule that fired 10 times and was confirmed a real problem 8 times (80%
 * precision) should be trusted (and surfaced) more; one that's mostly false
 * positives should be damped down, eventually toward being ignorable.
 *
 * Weight is smoothed (not snapped) so one noisy batch can't whiplash a rule's
 * influence — it moves 50% of the way toward the precision-implied target
 * each calibration pass, converging over a few passes.
 */
export function calibrateRule(rule: Rule, historicalOutcomes: Outcome[]): Rule {
  const mine = historicalOutcomes.filter((o) => o.ruleId === rule.id);
  const tp = mine.filter((o) => o.confirmedProblem).length;
  const fp = mine.filter((o) => !o.confirmedProblem).length;

  const updated = cloneRule(rule);
  updated.calibration = {
    truePositiveCount: rule.calibration.truePositiveCount + tp,
    falsePositiveCount: rule.calibration.falsePositiveCount + fp,
    lastCalibrated: new Date(),
  };

  const total = updated.calibration.truePositiveCount + updated.calibration.falsePositiveCount;
  if (total >= 3) {
    const precision = updated.calibration.truePositiveCount / total;
    // Map precision [0,1] -> weight target [0.2, 5]. Severity still informs
    // the floor/ceiling via the rule's own starting weight scale (1-5).
    const target = clamp(0.2 + precision * 4.8, 0.2, 5);
    const smoothed = rule.weight + (target - rule.weight) * 0.5;
    updated.weight = Math.round(smoothed * 100) / 100;

    // Rules that are almost pure noise (precision < 15% with enough samples)
    // get auto-disabled so they stop cluttering Active Findings.
    if (total >= 8 && precision < 0.15) {
      updated.enabled = false;
    }
  }

  return updated;
}

/**
 * Re-centers a rule's numeric threshold(s) at the given percentile of the
 * organization's *own* historical metric values, instead of a hardcoded
 * industry constant. For a "high is bad" rule (direction: gt) the threshold
 * is set at the requested percentile (e.g. 75th) so only the worst quartile
 * fires. For a "low is bad" rule (direction: lt) we mirror the percentile
 * (1 - p) so the same logic re-centers correctly in the other tail.
 */
export function autoAdjustThresholds(rule: Rule, currentData: number[], percentileTarget = 0.75): Rule {
  if (currentData.length === 0 || rule.dataRefs.metrics.length === 0) return cloneRule(rule);

  const updated = cloneRule(rule);
  for (const ref of rule.dataRefs.metrics) {
    const p = ref.direction === "gt" ? percentileTarget : 1 - percentileTarget;
    const newThreshold = percentile(currentData, p);
    updated.autoThresholds[ref.thresholdKey] = Math.round(newThreshold * 100) / 100;
  }
  updated.calibration = { ...updated.calibration, lastCalibrated: new Date() };
  return updated;
}

/**
 * precision = TP / (TP + FP) — directly observed.
 * recall has no ground-truth "missed cases" feed in this schema (only fired
 * outcomes are tracked), so it is estimated as a severity/weight-informed
 * confidence proxy: a rule that is both precise AND has earned a high
 * calibrated weight is assumed to also be catching most real cases.
 * This keeps the signature exactly `(rule) -> {precision, recall, f1, lastUpdated}`
 * while being transparent that recall is a documented estimate, not measured.
 */
export function computeRuleHealthScore(rule: Rule): RuleHealthScore {
  const { truePositiveCount, falsePositiveCount, lastCalibrated } = rule.calibration;
  const total = truePositiveCount + falsePositiveCount;
  const precision = total > 0 ? truePositiveCount / total : 0.5; // neutral prior before any evidence
  const confidenceProxy = clamp(rule.weight / 5, 0, 1);
  const recall = total > 0 ? clamp(precision * 0.6 + confidenceProxy * 0.4, 0, 1) : confidenceProxy;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    lastUpdated: lastCalibrated,
  };
}

export interface CalibrationDiffEntry {
  ruleId: string;
  ruleName: string;
  before: { weight: number; enabled: boolean; thresholds: Record<string, number> };
  after: { weight: number; enabled: boolean; thresholds: Record<string, number> };
  updatedRule: Rule;
}

/**
 * Runs a full calibration pass over every rule: (1) relearn weights from
 * historical outcomes, then (2) re-center numeric thresholds against the
 * org's own observed metric distribution. Returns a before/after diff per
 * rule for transparency in the UI.
 */
export function runCalibrationPass(
  rules: Rule[],
  outcomes: Outcome[],
  metricSeriesByKey: Record<string, number[]>,
  percentileTarget = 0.75
): CalibrationDiffEntry[] {
  return rules.map((rule) => {
    const before = {
      weight: rule.weight,
      enabled: rule.enabled,
      thresholds: { ...rule.autoThresholds },
    };

    let updated = calibrateRule(rule, outcomes);

    for (const ref of updated.dataRefs.metrics) {
      const series = metricSeriesByKey[ref.key];
      if (series && series.length > 0) {
        updated = autoAdjustThresholds(updated, series, percentileTarget);
      }
    }

    const after = {
      weight: updated.weight,
      enabled: updated.enabled,
      thresholds: { ...updated.autoThresholds },
    };

    return { ruleId: rule.id, ruleName: rule.name, before, after, updatedRule: updated };
  });
}
