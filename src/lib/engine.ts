// Maps active synthetic rule flags + mood trend + goal-hit-rate into the
// evidence-signal arrays each Bayesian hypothesis consumes. This function is
// an original, typed reimplementation of the *behavior* described by
// `LEADOS.bayesian._extractEvidenceSignals()` in the pasted brief — see
// bayesian.ts header for the two disclosed gaps in that original function
// (two hypotheses with no likelihood model; five likelihood keys the
// original function never actually emits) that are preserved here rather
// than silently patched.
import type { AppState } from "./types";
import { computeMoodTrend, type EvidenceSignals } from "./bayesian";
import { MOOD_SERIES } from "./seed";
import { RULES } from "./rules";

export function activeFindings(state: AppState) {
  return RULES.filter((r) => state.ruleFlags[r.id]);
}

export function extractEvidenceSignals(state: AppState): EvidenceSignals {
  const findings = activeFindings(state);
  const has = (id: string) => findings.some((f) => f.id === id);

  const signals: EvidenceSignals = {
    "attrition.next60d": [],
    "revenue.miss.next_quarter": [],
    "okr.on_track": [],
    "crisis.next30d": [],
    "key_hire.success": [],
  };

  // --- Auto-detected mappings, faithful to the pasted brief's own wiring ---
  if (has("R7")) signals["attrition.next60d"].push("burnout.signal");
  if (has("R1")) signals["attrition.next60d"].push("1on1.missed");
  if (has("R10")) signals["attrition.next60d"].push("no_growth_plan");
  if (has("R6")) signals["attrition.next60d"].push("conflict.recent");

  const moodTrend = computeMoodTrend(MOOD_SERIES[state.moodScenario]);
  if (moodTrend < -0.1) signals["attrition.next60d"].push("mood.declining");

  if (has("R157")) signals["revenue.miss.next_quarter"].push("win_rate.declining");
  if (has("R73")) {
    signals["revenue.miss.next_quarter"].push("velocity.declining");
    signals["okr.on_track"].push("velocity.declining");
  }
  if (has("R104")) signals["revenue.miss.next_quarter"].push("ltv_cac.below_threshold");
  if (has("R14")) signals["okr.on_track"].push("okr.silent_over_30d");

  const goalHitRate =
    state.goalHitRateMode === "synthetic" ? state.goalHitRateManual : state.goalHitRateManual;
  if (goalHitRate > 0.7) signals["okr.on_track"].push("goal_hit_rate.high");

  // --- Manual-only evidence: defined as likelihood ratios in the pasted
  // brief but NEVER emitted by its own _extractEvidenceSignals(). Surfaced
  // here as explicit, separately-labeled toggles rather than silently wired
  // into the automatic rule mapping (which would misattribute a connection
  // the brief itself never made). ---
  if (state.manualEvidence["comp.at_market"]) signals["attrition.next60d"].push("comp.at_market");
  if (state.manualEvidence["promotion.recent"])
    signals["attrition.next60d"].push("promotion.recent");
  if (state.manualEvidence["pipeline.shrinking"])
    signals["revenue.miss.next_quarter"].push("pipeline.shrinking");
  if (state.manualEvidence["nps.high"]) signals["revenue.miss.next_quarter"].push("nps.high");
  if (state.manualEvidence["velocity.stable"]) signals["okr.on_track"].push("velocity.stable");

  return signals;
}

export function moodTrendFor(state: AppState): number {
  return computeMoodTrend(MOOD_SERIES[state.moodScenario]);
}
