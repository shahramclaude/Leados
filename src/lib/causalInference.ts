import type { CausalLink, Cascade, RuleEvaluation, Severity } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// causalInference — 12 hardcoded causal links between rules, representing
// plausible cross-domain cascades observed in practice (e.g. flight risk
// in key people cascading into delivery confidence). This is a *declared*
// causal graph (expert-encoded), not a statistically inferred one — labeled
// here for honesty. DESIGN PARAMETER: amplification multipliers below.
// ─────────────────────────────────────────────────────────────────────────

export const CAUSAL_LINKS: CausalLink[] = [
  { id: "cl1", fromRuleId: "people.flight_risk_spike", toRuleId: "execution.low_confidence", description: "Key-person flight risk erodes delivery confidence.", amplification: 1.25 },
  { id: "cl2", fromRuleId: "people.org_wide_disengagement", toRuleId: "execution.momentum_stalled", description: "Disengagement slows delivery momentum.", amplification: 1.2 },
  { id: "cl3", fromRuleId: "finance.runway_critical", toRuleId: "people.org_wide_disengagement", description: "Runway anxiety increases org-wide disengagement.", amplification: 1.3 },
  { id: "cl4", fromRuleId: "finance.bankruptcy_risk", toRuleId: "strategy.okr_off_track", description: "Cash anxiety derails OKR execution focus.", amplification: 1.4 },
  { id: "cl5", fromRuleId: "sales.pipeline_coverage_low", toRuleId: "finance.runway_critical", description: "Weak pipeline shortens effective runway.", amplification: 1.2 },
  { id: "cl6", fromRuleId: "sales.churn_elevated", toRuleId: "finance.unit_economics_broken", description: "Elevated churn breaks unit economics.", amplification: 1.3 },
  { id: "cl7", fromRuleId: "execution.blocked_projects", toRuleId: "rd.confidence_low", description: "Portfolio blockers reduce R&D delivery confidence.", amplification: 1.2 },
  { id: "cl8", fromRuleId: "rd.support_ticket_surge", toRuleId: "sales.nps_declining", description: "Quality regressions surface as falling NPS.", amplification: 1.25 },
  { id: "cl9", fromRuleId: "strategy.competitive_pressure", toRuleId: "sales.new_logo_growth_stalled", description: "Competitive pressure stalls new logo growth.", amplification: 1.2 },
  { id: "cl10", fromRuleId: "execution.critical_path_risk", toRuleId: "strategy.velocity_negative", description: "A critical-path bottleneck drags OKR velocity negative.", amplification: 1.3 },
  { id: "cl11", fromRuleId: "manufacturing.critical_blocker", toRuleId: "execution.open_blocker_backlog", description: "Critical ops blockers spill into the wider blocker backlog.", amplification: 1.15 },
  { id: "cl12", fromRuleId: "knowledge.low_confirmation_rate", toRuleId: "knowledge.stale_playbooks", description: "Miscalibrated rules reduce trust and playbook adoption.", amplification: 1.1 },
];

function severityScore(sev: Severity | null): number {
  if (!sev) return 0;
  return { low: 1, medium: 2, high: 3, critical: 4 }[sev];
}

/**
 * Detect active cascades: a link is "active" when both its source and
 * target rules are currently firing. Effective severity on the target is
 * amplified by the link's multiplier (self-test T28 asserts
 * effectiveSeverity > originalSeverity whenever a cascade is active).
 */
export function detectCascades(evaluations: RuleEvaluation[]): Cascade[] {
  const byId = new Map(evaluations.map((e) => [e.ruleId, e]));
  return CAUSAL_LINKS.map((link) => {
    const from = byId.get(link.fromRuleId);
    const to = byId.get(link.toRuleId);
    const active = Boolean(from?.firing && to?.firing);
    const originalSeverityScore = severityScore(to?.severity ?? null);
    const effectiveSeverityScore = active ? originalSeverityScore * link.amplification : originalSeverityScore;
    return { link, active, originalSeverityScore, effectiveSeverityScore };
  });
}

export function activeCascadeCount(cascades: Cascade[]): number {
  return cascades.filter((c) => c.active).length;
}
