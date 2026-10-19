import type { AdaptivePlaybook, Domain, RuleEvaluation } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// playbooksIntelligence — adaptive, domain-aware playbook generation.
// Each domain has a template; buildAdaptivePlaybook() interpolates the
// specific firing rule's basis/scoreMath into the template steps so the
// playbook reads as "written for this finding" rather than generic advice.
// ─────────────────────────────────────────────────────────────────────────

const DOMAIN_TEMPLATES: Record<Domain, string[]> = {
  people: [
    "Schedule a 1:1 with the affected individual(s) within 48 hours.",
    "Review compensation and growth trajectory against internal benchmarks.",
    "Loop in the manager and HRBP to co-own a retention plan.",
    "Re-check flight risk signal in 14 days to confirm resolution.",
  ],
  finance: [
    "Convene finance leadership to review the triggering metric same-week.",
    "Model 2-3 mitigation levers (spend cuts, pricing, collections) with owners.",
    "Update the board on exposure and mitigation timeline.",
    "Re-run the Monte Carlo after mitigation to confirm improvement.",
  ],
  strategy: [
    "Bring the objective owner and leadership together to re-baseline the plan.",
    "Decide: re-scope, re-resource, or retire the objective.",
    "Log the decision in the decision ledger with an outcome owner.",
    "Review OKR health again at the next weekly leadership sync.",
  ],
  execution: [
    "Identify the single-owner accountable for unblocking the workstream.",
    "Escalate cross-team dependencies that are the root blocker.",
    "Set a recovery checkpoint date and track milestone burn-down.",
    "Re-run critical path analysis once the blocker clears.",
  ],
  rd: [
    "Triage the blocking issue with the engineering lead within 24 hours.",
    "Assess whether scope reduction can protect the release date.",
    "Pair a senior engineer on the critical path item.",
    "Track confidence score daily until back above threshold.",
  ],
  sales: [
    "Review the pipeline/funnel stage where the metric is degrading.",
    "Align sales and marketing on a short-term generation or retention sprint.",
    "Audit the 5 largest at-risk accounts for churn or slippage signals.",
    "Re-measure the metric at the next weekly pipeline review.",
  ],
  knowledge: [
    "Audit the rules/hypotheses contributing to this finding for calibration drift.",
    "Assign an owner to resolve the oldest open hypotheses first.",
    "Document the root cause once identified in the institutional memory log.",
    "Review confirmation rate again after the next resolution cycle.",
  ],
  manufacturing: [
    "Convene ops leadership to triage the blocking constraint.",
    "Assess capacity reallocation to protect the critical path.",
    "Confirm supplier/vendor dependencies are not the root cause.",
    "Re-check milestone status at the next daily standup.",
  ],
};

export function buildAdaptivePlaybook(rule: RuleEvaluation): AdaptivePlaybook {
  const template = DOMAIN_TEMPLATES[rule.domain];
  const steps = [
    `Finding: "${rule.name}" is ${rule.firing ? "currently firing" : "inactive"} (${rule.scoreMath}).`,
    ...template,
    `Basis: ${rule.basis}`,
  ];
  return {
    domain: rule.domain,
    title: `Adaptive Playbook — ${rule.name}`,
    steps,
    basedOn: rule.ruleId,
  };
}

export function allDomainTemplates(): Record<Domain, string[]> {
  return DOMAIN_TEMPLATES;
}
