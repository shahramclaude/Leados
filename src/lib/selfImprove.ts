// Canonical rule self-calibration logic. This is the single source of
// truth for adjusting rule weights from observed outcomes — the
// autonomous agent (autonomousAgent.ts) imports `calibrateRules` from
// here rather than re-implementing it, and the orchestrator's rule
// evaluations + decision outcomes are the only inputs.

import { db as defaultDb } from "@/db";
import type { OrchestratorResult } from "./orchestrator";
import { getAllRules, getResolvedOutcomesForRule, updateRuleWeight } from "./ruleStore";

type Database = typeof defaultDb;

const CALIBRATION_ALPHA = 0.1;
const BRIER_THRESHOLD = 0.25;
const MIN_SAMPLES = 5;
const WEIGHT_MIN = 0.1;
const WEIGHT_MAX = 3.0;

export interface RuleCalibrationOutcome {
  ruleKey: string;
  calibrated: boolean;
  sampleSize: number;
  brierScore: number | null;
  oldWeight: number;
  newWeight: number;
  reason?: string;
}

/**
 * Brier score: mean squared error between predicted probability and the
 * realized binary outcome (0/1).
 *   brierScore = (1/n) * sum((predicted_i - outcome_i)^2)
 * Standard definition (UNVERIFIED: not sourced from a repo file — this is
 * the textbook Brier score formula, used because the task spec references
 * "brierScore" directly without giving its formula).
 */
export function computeBrierScore(samples: Array<{ predicted: number; outcome: boolean }>): number {
  if (samples.length === 0) return 0;
  const sumSquaredError = samples.reduce((acc, s) => {
    const actual = s.outcome ? 1 : 0;
    return acc + (s.predicted - actual) ** 2;
  }, 0);
  return sumSquaredError / samples.length;
}

function clampWeight(weight: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight));
}

/**
 * Calibrates every rule's weight from its last-30-day resolved outcomes
 * (pooled rule_evaluations + decision_outcomes).
 *
 * EXACT FORMULA (given in task spec — "CALIBRATION MATH"):
 *   newWeight = oldWeight * (1 - alpha) + alpha * (brierScore > 0.25 ? 0.5 : 1.5)
 *   alpha = 0.1
 *   Skip calibration if fewer than 5 outcomes exist for a rule.
 *   Clamp newWeight to [0.1, 3.0].
 *
 * `result` (the latest OrchestratorResult) is accepted for audit/logging
 * context but does not factor into the math above — calibration is driven
 * purely by historical resolved outcomes, per spec.
 */
export async function calibrateRules(
  result: OrchestratorResult | null,
  db: Database = defaultDb,
): Promise<RuleCalibrationOutcome[]> {
  void result; // reserved for future context-aware calibration / audit logging
  const allRules = await getAllRules(db);
  const outcomes: RuleCalibrationOutcome[] = [];

  for (const rule of allRules) {
    const samples = await getResolvedOutcomesForRule(db, rule.id, 30);

    if (samples.length < MIN_SAMPLES) {
      outcomes.push({
        ruleKey: rule.key,
        calibrated: false,
        sampleSize: samples.length,
        brierScore: null,
        oldWeight: rule.weight,
        newWeight: rule.weight,
        reason: "insufficient_data",
      });
      continue;
    }

    const brierScore = computeBrierScore(samples);
    const target = brierScore > BRIER_THRESHOLD ? 0.5 : 1.5;

    // newWeight = oldWeight * (1 - α) + α * target  (α = 0.1)
    const rawNewWeight = rule.weight * (1 - CALIBRATION_ALPHA) + CALIBRATION_ALPHA * target;
    const newWeight = clampWeight(rawNewWeight);

    await updateRuleWeight(db, rule.key, newWeight);

    outcomes.push({
      ruleKey: rule.key,
      calibrated: true,
      sampleSize: samples.length,
      brierScore,
      oldWeight: rule.weight,
      newWeight,
    });
  }

  return outcomes;
}

/**
 * Small, separate nudge applied when a hypothesis resolves — moves the
 * associated rule's weight in the direction of confirmation (up) or
 * refutation (down). This is distinct from the Brier-score calibration
 * above (which only runs off pooled historical outcomes); it lets a single
 * resolved hypothesis have an immediate, bounded effect on the rule that
 * generated it.
 * UNVERIFIED: exact nudge magnitude not specified by the task; chosen to be
 * small (half of the calibration alpha) so it cannot dominate the
 * Brier-based calibration above.
 */
export async function applyHypothesisResolutionNudge(
  db: Database,
  ruleKey: string | null | undefined,
  confirmed: boolean,
): Promise<void> {
  if (!ruleKey) return;
  const allRules = await getAllRules(db);
  const rule = allRules.find((r) => r.key === ruleKey);
  if (!rule) return;

  const nudgeAlpha = CALIBRATION_ALPHA / 2;
  const target = confirmed ? 1.5 : 0.5;
  const newWeight = clampWeight(rule.weight * (1 - nudgeAlpha) + nudgeAlpha * target);
  await updateRuleWeight(db, ruleKey, newWeight);
}
