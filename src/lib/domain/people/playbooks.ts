// Playbooks engine: a small catalog of named interventions. Every
// recommendation surfaced anywhere in the people domain should trace back to
// one of these entries so a manager sees *evidence* and *expected impact
// with uncertainty*, not just a label like "improve engagement."

export interface Playbook {
  id: string;
  title: string;
  trigger: string;
  action: string;
  evidenceBasis: string;
  expectedImpact: { metric: string; direction: "increase" | "decrease"; magnitude: string };
  uncertainty: string;
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "growth-conversation-overdue",
    title: "Schedule a growth conversation",
    trigger: "No growth conversation in 90+ days",
    action: "Hold a dedicated 30-minute growth/career conversation within 2 weeks.",
    evidenceBasis:
      "Internal 1:1 commitment-tracking data correlates growth-conversation recency with lower missed-commitment rates on this team.",
    expectedImpact: { metric: "flight-risk estimate", direction: "decrease", magnitude: "small-to-moderate" },
    uncertainty: "Directional, not causal — based on correlational pattern across a small internal sample.",
  },
  {
    id: "compa-ratio-review",
    title: "Review compa-ratio at next cycle",
    trigger: "Compa-ratio below band midpoint",
    action: "Flag for compensation committee review at the next cycle; benchmark against band and peers.",
    evidenceBasis: "Compa-ratio is a widely replicated external driver of voluntary attrition.",
    expectedImpact: { metric: "flight-risk estimate", direction: "decrease", magnitude: "moderate" },
    uncertainty: "Effect size varies by market and role; not guaranteed to change the individual's decision.",
  },
  {
    id: "workload-rebalance",
    title: "Rebalance workload",
    trigger: "Overloaded collaboration load or high missed-commitment rate",
    action: "Review current workload in 1:1 and redistribute or deprioritize at least one active commitment.",
    evidenceBasis: "Derived from this person's own meeting-load and commitment-completion history.",
    expectedImpact: { metric: "commitment follow-through rate", direction: "increase", magnitude: "moderate" },
    uncertainty: "Based on short observation windows; recommend re-checking after 2-3 cycles.",
  },
  {
    id: "bus-factor-mitigation",
    title: "Reduce single-point-of-failure risk",
    trigger: "Team bus factor of 1-2 on a critical workflow",
    action: "Pair the identified person with a backup owner and document the runbook within 30 days.",
    evidenceBasis: "Meeting-organizer concentration metadata shows one person organizing a large share of recurring syncs.",
    expectedImpact: { metric: "team bus factor", direction: "increase", magnitude: "small-to-moderate" },
    uncertainty: "Organizer share is an approximation of knowledge concentration, not a direct measure of it.",
  },
  {
    id: "onboarding-support",
    title: "Add onboarding support capacity",
    trigger: "A mentor is supporting 3+ new hires concurrently",
    action: "Add a second onboarding buddy or stagger start dates where possible.",
    evidenceBasis: "Derived from mentor-pairing metadata within the first 90 days of each hire's start date.",
    expectedImpact: { metric: "new-hire ramp time", direction: "decrease", magnitude: "small" },
    uncertainty: "Ramp-time effect is an internal estimate, not independently validated.",
  },
  {
    id: "succession-bench-building",
    title: "Build succession bench depth",
    trigger: "Zero ready-now candidates for a high/critical role",
    action: "Identify 1-2 ready-later candidates and create a gap-closing stretch assignment.",
    evidenceBasis: "Succession board shows no ready-now candidates for this role.",
    expectedImpact: { metric: "role coverage risk", direction: "decrease", magnitude: "moderate" },
    uncertainty: "Readiness tiers reflect manager/HR judgment plus evidence, not a certified assessment.",
  },
];

export function matchPlaybooks(triggerIds: string[]): Playbook[] {
  return PLAYBOOKS.filter((p) => triggerIds.includes(p.id));
}
