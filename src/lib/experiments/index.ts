/**
 * STAND-IN for Part 30's experiment scaffolding. Not present in this
 * repository snapshot (confirmed via grep before writing). Part 51 only
 * needs two things from Part 30: (1) a shape for a completed experiment
 * result that can feed the belief-update loop, and (2) a way to link a
 * recommendation's "how-to-verify" field to a concrete experiment metric.
 * Replace with the real Part 30 client when it lands.
 */

export interface ExperimentResult {
  experimentId: string;
  interventionId: string;
  contextKey: string;
  metric: string;
  success: boolean;
  magnitude: number; // 0..1, partial credit
  sampleSize: number;
  status: "running" | "completed";
}

/**
 * Builds the metric name an accepted recommendation should be verified
 * against. Part 30's real scaffolding would return a live experiment id;
 * here we return a deterministic metric label so the UI has something
 * concrete to render in "how-to-verify".
 */
export function suggestVerificationMetric(interventionSlug: string, category: string): string {
  const byCategory: Record<string, string> = {
    communication: "manager_report_clarity_score",
    delegation: "decision_latency_days",
    feedback: "psych_safety_pulse_score",
    planning: "okr_attainment_rate",
    culture: "voluntary_attrition_rate",
    structure: "cross_team_blocker_count",
  };
  const metric = byCategory[category] ?? "team_health_index";
  return `${metric} (track via Part 30 experiment scaffolding, tagged "${interventionSlug}")`;
}
