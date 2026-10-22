// src/lib/twin/workforceSim.ts
//
// Workforce-focused convenience layer on top of the general twin: headcount
// trajectory (hiring/attrition/shocks) without requiring callers to know
// about the full work-system/network machinery. Two speeds are offered:
//   - `estimateHeadcountClosedForm`: an O(weeks) analytic approximation using
//     a constant hazard rate, useful for instant UI previews BEFORE a full
//     ensemble run completes. Explicitly labelled as an approximation.
//   - `projectWorkforceEnsemble`: the real thing — runs the full ensemble and
//     returns just the activeHeadcount P10/P50/P90 band.

import type { PercentileSeriesPoint, ScenarioInput } from "./types";
import { runEnsemble, type EnsembleOptions } from "./ensemble";
import { BASE_WEEKLY_ATTRITION_PROB } from "./agents";

export interface ClosedFormHeadcountPoint {
  week: number;
  expectedActiveHeadcount: number;
}

/**
 * Fast analytic approximation: expected headcount under a constant weekly
 * hazard rate, ignoring fatigue/motivation feedback and shocks. This is
 * intentionally a rough instant preview, not a substitute for the ensemble.
 */
export function estimateHeadcountClosedForm(scenario: ScenarioInput): ClosedFormHeadcountPoint[] {
  const out: ClosedFormHeadcountPoint[] = [];
  let headcount = scenario.orgSize;
  for (let week = 1; week <= scenario.horizonWeeks; week++) {
    if (week === scenario.headcountChangeWeek && scenario.headcountDeltaFraction !== 0) {
      headcount = headcount * (1 + scenario.headcountDeltaFraction);
    }
    headcount = headcount * (1 - BASE_WEEKLY_ATTRITION_PROB);
    out.push({ week, expectedActiveHeadcount: headcount });
  }
  return out;
}

export function projectWorkforceEnsemble(
  scenario: ScenarioInput,
  opts: EnsembleOptions = {},
): PercentileSeriesPoint[] {
  const result = runEnsemble(scenario, opts);
  return result.bands.activeHeadcount;
}
