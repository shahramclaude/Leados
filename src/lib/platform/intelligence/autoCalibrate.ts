/**
 * autoCalibrate.ts — Part 04-D, the real calibration loop (standardizing
 * what the duplication cluster previously split across
 * `ruleCalibration.ts` / `calibrateRules.ts` / `autoCalibrate.ts`). This is
 * the ONE place weight adjustments are proposed and applied.
 *
 * Algorithm: gradient-free coordinate search. For each rule, independently
 * try weight * 1.1 and weight * 0.9 (one "coordinate" = one rule's weight),
 * re-run the supplied golden-dataset evaluator, and keep whichever of
 * {+10%, -10%, unchanged} yields the best (lowest Brier) score on the
 * golden dataset. This is "coordinate ascent" / "coordinate descent"
 * (classic derivative-free optimization, e.g. Wright, 2015, "Coordinate
 * Descent Algorithms") — chosen because rule weights feed a non-smooth
 * pipeline (log-odds pooling + downstream thresholds) where we do not have
 * a clean analytic gradient, but we can cheaply re-evaluate the whole
 * pipeline per candidate.
 *
 * Guardrails (standing order D):
 *  - max ±10% change per cycle (enforced twice: here, by construction, and
 *    again inside `ruleEngine.adjustWeight`'s clamp — belt and suspenders).
 *  - a change is only applied if it improves the golden-dataset eval.
 *  - every applied (or rejected, or held-for-approval) change is recorded
 *    as an audit event.
 *  - human-approval mode is toggleable per rule class: rules whose
 *    `ruleClass` is in `humanApprovalRequired` are never auto-applied; a
 *    `rule.weight.pendingApproval` event is recorded instead.
 */

import { ruleEngine } from "./ruleEngine";
import { eventLog } from "./eventLog";

export type GoldenEvaluator = () => number; // returns Brier score on the golden dataset — LOWER is better

export type CalibrationCycleResult = {
  ruleId: string;
  before: number;
  after: number;
  applied: boolean;
  pendingApproval: boolean;
  goldenScoreBefore: number;
  goldenScoreAfter: number;
};

export function runCalibrationCycle(
  ruleIds: string[],
  evaluateGolden: GoldenEvaluator,
  humanApprovalRequired: Set<string> = new Set(),
): CalibrationCycleResult[] {
  const results: CalibrationCycleResult[] = [];
  const baselineScore = evaluateGolden();

  for (const ruleId of ruleIds) {
    const rule = ruleEngine.get(ruleId);
    if (!rule) continue;
    const original = rule.weight;
    const candidates = [original * 1.1, original * 0.9].map((w) => Math.min(1, Math.max(0.25, w)));

    let best = { weight: original, score: baselineScore };
    for (const candidate of candidates) {
      ruleEngine.__setTrialWeightForCalibration(ruleId, candidate);
      const score = evaluateGolden();
      if (score < best.score) best = { weight: candidate, score };
    }
    // restore original before deciding, so `adjustWeight`'s delta math is correct
    ruleEngine.__setTrialWeightForCalibration(ruleId, original);

    const improved = best.score < baselineScore;
    const requiresApproval = humanApprovalRequired.has(rule.ruleClass);

    if (!improved) {
      eventLog.append("rule.calibration.no_change", {
        ruleId,
        ruleClass: rule.ruleClass,
        weight: original,
        goldenScore: baselineScore,
      });
      results.push({
        ruleId,
        before: original,
        after: original,
        applied: false,
        pendingApproval: false,
        goldenScoreBefore: baselineScore,
        goldenScoreAfter: baselineScore,
      });
      continue;
    }

    if (requiresApproval) {
      eventLog.append("rule.weight.pendingApproval", {
        ruleId,
        ruleClass: rule.ruleClass,
        before: original,
        proposedAfter: best.weight,
        goldenScoreBefore: baselineScore,
        goldenScoreAfter: best.score,
      });
      results.push({
        ruleId,
        before: original,
        after: original,
        applied: false,
        pendingApproval: true,
        goldenScoreBefore: baselineScore,
        goldenScoreAfter: best.score,
      });
      continue;
    }

    ruleEngine.adjustWeight(
      ruleId,
      best.weight,
      `coordinate-search improved golden Brier ${baselineScore.toFixed(4)} -> ${best.score.toFixed(4)}`,
    );
    results.push({
      ruleId,
      before: original,
      after: best.weight,
      applied: true,
      pendingApproval: false,
      goldenScoreBefore: baselineScore,
      goldenScoreAfter: best.score,
    });
  }

  return results;
}
