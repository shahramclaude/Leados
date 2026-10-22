// Part 28 — automation opportunity scoring.
//
// score = (volume * handlingTimeHours * errorRate * ruleBasedFraction) / automationCost
//
// HONESTY CONTRACT (Phase 5 Q3): `ruleBasedFraction` and `errorRate` are only
// as good as instrumentation. If events for an activity never set
// `attributes.ruleBased` / `attributes.errorFlag`, we fall back to
// conservative heuristic defaults and mark the whole score `confidence:
// "estimated"` with an explicit note — callers (the Automation ROI UI) MUST
// surface that distinction rather than presenting every score as equally
// trustworthy.
//
// PROVENANCE NOTE: "Part 06's twin" (a capacity/work-system simulator) is not
// present in this repo snapshot. `projectCapacityImpact` below is a minimal,
// clearly-labelled stand-in that turns saved hours into an FTE-equivalent and
// a rough "extra cases/year" figure using only this step's own observed
// handling time — it is NOT a full twin simulation of downstream capacity
// reallocation, and the output says so.
import type { AutomationScore, Explain } from "./types";

export interface ActivityAutomationInput {
  processName: string;
  activity: string;
  occurrences: number;
  periodMs: number;
  avgHandlingTimeMs: number;
  /** fraction of sampled events with attributes.errorFlag === true, or null if never instrumented */
  observedErrorRate: number | null;
  /** fraction of sampled events with attributes.ruleBased === true, or null if never instrumented */
  observedRuleBasedFraction: number | null;
  sampleEventIds: string[];
}

export interface AutomationCostModel {
  /** flat engineering cost estimate to automate one step, in the same currency unit as ROI figures */
  baseCost: number;
}

const DEFAULT_COST_MODEL: AutomationCostModel = { baseCost: 4000 };
const HEURISTIC_DEFAULT_ERROR_RATE = 0.05;
const HEURISTIC_DEFAULT_RULE_BASED_FRACTION = 0.3;
const WORKING_HOURS_PER_FTE_YEAR = 1800;
const AUTOMATION_REALIZATION_FACTOR = 0.8; // not every "rule-based" minute converts to saved capacity

export function scoreAutomationOpportunity(
  input: ActivityAutomationInput,
  costModel: AutomationCostModel = DEFAULT_COST_MODEL,
): AutomationScore {
  const notes: string[] = [];
  let confidence: Explain<number>["confidence"] = "measured";

  const errorRate = input.observedErrorRate ?? HEURISTIC_DEFAULT_ERROR_RATE;
  if (input.observedErrorRate === null) {
    confidence = "estimated";
    notes.push(
      `errorRate not instrumented for "${input.activity}" — using heuristic default ${HEURISTIC_DEFAULT_ERROR_RATE}; treat as directional only.`,
    );
  }

  const ruleBasedFraction = input.observedRuleBasedFraction ?? HEURISTIC_DEFAULT_RULE_BASED_FRACTION;
  if (input.observedRuleBasedFraction === null) {
    confidence = "estimated";
    notes.push(
      `ruleBasedFraction not instrumented for "${input.activity}" — using heuristic default ${HEURISTIC_DEFAULT_RULE_BASED_FRACTION}; this is the single most over-promising input in this score and should be validated with SMEs before funding automation.`,
    );
  }

  const periodYears = input.periodMs / (365 * 24 * 60 * 60 * 1000);
  const volumeAnnualized = periodYears > 0 ? input.occurrences / periodYears : input.occurrences;
  const avgHandlingTimeHours = input.avgHandlingTimeMs / 3_600_000;

  const rawScore =
    (volumeAnnualized * avgHandlingTimeHours * errorRate * ruleBasedFraction) / Math.max(1, costModel.baseCost);

  const scoreExplain: Explain<number> = {
    value: rawScore,
    formula: "score = (volumeAnnualized * avgHandlingTimeHours * errorRate * ruleBasedFraction) / automationCost",
    inputs: {
      volumeAnnualized: round4(volumeAnnualized),
      avgHandlingTimeHours: round4(avgHandlingTimeHours),
      errorRate,
      ruleBasedFraction,
      automationCost: costModel.baseCost,
    },
    citations: input.sampleEventIds.slice(0, 5),
    confidence,
    notes,
  };

  const roi = projectCapacityImpact(volumeAnnualized, avgHandlingTimeHours, ruleBasedFraction);

  return {
    processName: input.processName,
    activity: input.activity,
    volumeAnnualized,
    avgHandlingTimeHours,
    errorRate,
    ruleBasedFraction,
    automationCost: costModel.baseCost,
    score: scoreExplain,
    roi,
  };
}

function projectCapacityImpact(volumeAnnualized: number, avgHandlingTimeHours: number, ruleBasedFraction: number) {
  const savedHoursPerYear = volumeAnnualized * avgHandlingTimeHours * ruleBasedFraction * AUTOMATION_REALIZATION_FACTOR;
  const fteEquivalent = savedHoursPerYear / WORKING_HOURS_PER_FTE_YEAR;
  const additionalCaseThroughputPerYear = avgHandlingTimeHours > 0 ? savedHoursPerYear / avgHandlingTimeHours : 0;

  return {
    savedHoursPerYear,
    fteEquivalent,
    additionalCaseThroughputPerYear,
    twinNote:
      "Minimal capacity stand-in — Part 06's work-system twin is not present in this repo snapshot. This figure only reallocates THIS step's own freed hours back into THIS step's own case volume; it does not simulate downstream queueing effects, cross-step capacity sharing, or constraint shifting elsewhere in the process.",
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
