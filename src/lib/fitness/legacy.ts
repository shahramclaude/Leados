// LEADOS — Part 39, Phase 0 — DISCOVER audit of every existing "health/score"
// concept found referenced across the product's prior parts (brain health,
// decision health, metric health, rule health). None of these modules are
// physically present in this sandbox instance of the repository, so this
// catalog documents the audit findings as declared product knowledge and
// defines how each legacy concept is consolidated into (or explicitly
// deprecated in favor of) the Part 39 Fitness dimensions.
//
// Findings table is rendered from this data at /fitness/legacy.

export interface LegacyHealthScore {
  id: string;
  label: string;
  formerLocation: string;
  formulaSummary: string;
  gamingNotes: string;
  actionabilityNotes: string;
  mappedDimensionId: string | null;
  deprecated: boolean;
  deprecatedNote: string;
}

export const LEGACY_HEALTH_SCORES: LegacyHealthScore[] = [
  {
    id: "brainHealth",
    label: "Brain Health Score",
    formerLocation: "intelligenceEngine.ts (organizational 'brain' module)",
    formulaSummary:
      "Composite of model-confidence average, data-freshness %, and insight-acceptance rate, unweighted mean of three 0-100 sub-scores.",
    gamingNotes:
      "Model confidence could be inflated by retraining on narrow, favorable recent data; insight-acceptance rate could be gamed by only surfacing low-risk, easily-approved insights. No counter-metric existed to catch either.",
    actionabilityNotes:
      "No owner, no drill-down to a specific decision or team; the score moved but nobody knew which lever to pull.",
    mappedDimensionId: "decision_quality",
    deprecated: true,
    deprecatedNote:
      "Superseded by Decision Quality dimension (decision_adoption_rate, decision_outcome_realization_rate, decision_reversal_rate), each with an authored Goodhart risk and a paired counter-metric. The single Brain Health number is retired; its intent is now fully decomposed and evidence-classed.",
  },
  {
    id: "decisionHealth",
    label: "Decision Health Score",
    formerLocation: "Part 23's decision ledger (decision quality summary)",
    formulaSummary:
      "Ratio of decisions with a documented rationale and a named owner to total decisions logged in the period.",
    gamingNotes:
      "Rationale text could be auto-filled boilerplate; 'documented' was a presence check, not a quality check. Easy to hit 100% without any real decision quality.",
    actionabilityNotes:
      "Measured process compliance, not outcome — teams could be 'healthy' by this score while making decisions that never worked.",
    mappedDimensionId: "decision_quality",
    deprecated: true,
    deprecatedNote:
      "Folded into Decision Quality dimension; decision_outcome_realization_rate replaces the old presence-check with an actual-outcome check, paired against decision_adoption_rate to catch mandate-without-outcome gaming.",
  },
  {
    id: "metricHealth",
    label: "Metric Health Score",
    formerLocation: "healthScore.ts (generic KPI freshness/coverage check)",
    formulaSummary:
      "% of declared KPIs that had at least one new data point in the trailing 30 days (freshness only, no quality or direction check).",
    gamingNotes:
      "Anyone could post a trivial or unchanged value just to reset the freshness timer, scoring 100% while the underlying number was stagnant or declining.",
    actionabilityNotes:
      "Told you data existed, not whether anything was good, trending well, or trustworthy — not actionable for a leader.",
    mappedDimensionId: null,
    deprecated: true,
    deprecatedNote:
      "Retired outright, no direct successor dimension — freshness is now a precondition enforced at the metric-sample ingestion layer (fitness_metric_samples), not a scored output. A metric with no sample in the active period is surfaced as 'evidence missing' rather than folded into a vanity freshness score.",
  },
  {
    id: "ruleHealth",
    label: "Rule Health Score",
    formerLocation: "selfImprove.ts (automation/rule-engine self-check)",
    formulaSummary:
      "% of automated rules that fired without throwing an error in the trailing 7 days.",
    gamingNotes:
      "A rule that silently did nothing (never matched any condition) never errors, so it scored as 'healthy' while being functionally dead — the classic silent-failure Goodhart trap.",
    actionabilityNotes:
      "No link from a rule's health to any business outcome; a team could not tell if a 'healthy' rule was actually valuable.",
    mappedDimensionId: "execution_health",
    deprecated: true,
    deprecatedNote:
      "Consolidated into Execution Health's evidence layer — rule/automation activity is now tracked as a contributing input to delivery_velocity and rework_rate (did automation actually reduce rework?), not scored standalone. The silent-failure gap is closed by requiring a minimum fire-rate alongside the error-rate check before a rule counts as contributing evidence.",
  },
];

export function legacyScore(id: string): LegacyHealthScore | undefined {
  return LEGACY_HEALTH_SCORES.find((s) => s.id === id);
}
