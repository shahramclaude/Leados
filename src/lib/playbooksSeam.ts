// Part 11 seam: the real playbooks/interventions engine is out of scope for
// Part 09. This module is the stable interface Team Health calls into so
// Part 11 can replace the implementation without touching callers. Every
// recommendation it returns is wrapped so UI can render evidence, expected
// effect and uncertainty per Part 05's language rules.

import type { Explain } from "./explain";

export interface Intervention {
  id: string;
  title: string;
  appliesToDimension: "engagement" | "workload" | "velocity" | "quality" | "risk";
  expectedEffect: Explain<string>;
}

const CATALOG: Record<Intervention["appliesToDimension"], Omit<Intervention, "appliesToDimension">[]> = {
  engagement: [
    {
      id: "intervene_1on1_cadence",
      title: "Restore a consistent 1:1 cadence across the team",
      expectedEffect: {
        value: "Teams that restored 1:1 cadence in similar LEADOS cohorts saw commitment follow-through rise",
        method: "Qualitative pattern from internal cohort review (Part 11 playbooks engine placeholder).",
        inputs: ["oneOnOnes.heldAt cadence"],
        uncertaintyNote: "Illustrative, not a validated causal estimate; the real playbooks engine (Part 11) will replace this with a measured effect.",
        lawfulPurpose: "Manager coaching support.",
        asOf: new Date().toISOString(),
        limitations: ["Association only — see docs/FAIRNESS.md causal-language rules."],
      },
    },
  ],
  workload: [
    {
      id: "intervene_rebalance_load",
      title: "Rebalance collaboration load away from identified bottlenecks",
      expectedEffect: {
        value: "Rebalancing is associated with reduced single-point-of-failure risk in comparable teams",
        method: "Heuristic from collaboration-load metadata (Part 11 playbooks engine placeholder).",
        inputs: ["orgNetwork.collaborationLoad", "orgNetwork.communicationBottlenecks"],
        uncertaintyNote: "No controlled comparison performed; directional guidance only.",
        lawfulPurpose: "Workload fairness and burnout prevention.",
        asOf: new Date().toISOString(),
        limitations: ["Association only — see docs/FAIRNESS.md causal-language rules."],
      },
    },
  ],
  velocity: [
    {
      id: "intervene_growth_plans",
      title: "Activate growth plans for team members without one",
      expectedEffect: {
        value: "Active growth plans are associated with higher milestone completion rates in this dataset",
        method: "Observed correlation from growthPlans milestone completion (Part 11 playbooks engine placeholder).",
        inputs: ["growthPlans.milestonesJson"],
        uncertaintyNote: "Small sample; placeholder pending Part 11's validated model.",
        lawfulPurpose: "Capability development planning.",
        asOf: new Date().toISOString(),
        limitations: ["Association only — see docs/FAIRNESS.md causal-language rules."],
      },
    },
  ],
  quality: [
    {
      id: "intervene_skill_gap_closure",
      title: "Target training at the team's largest skill gaps",
      expectedEffect: {
        value: "Closing top skill gaps is associated with higher role-readiness coverage",
        method: "Derived from skillsGraph.teamSkillGapAnalysis (Part 11 playbooks engine placeholder).",
        inputs: ["skillsGraph.teamSkillGapAnalysis"],
        uncertaintyNote: "Coverage proxy, not a direct quality metric.",
        lawfulPurpose: "Capability development planning.",
        asOf: new Date().toISOString(),
        limitations: ["Association only — see docs/FAIRNESS.md causal-language rules."],
      },
    },
  ],
  risk: [
    {
      id: "intervene_retention_focus",
      title: "Prioritize manager attention on the highest flight-risk, highest-impact roles",
      expectedEffect: {
        value: "Targeted attention is associated with lower modeled flight-risk in comparable cases",
        method: "Derived from flightRisk.ts counterfactuals (Part 11 playbooks engine placeholder).",
        inputs: ["flightRisk.counterfactuals"],
        uncertaintyNote: "Based on an observational, non-causal model; see docs/FAIRNESS.md.",
        lawfulPurpose: "Equitable allocation of retention support.",
        asOf: new Date().toISOString(),
        limitations: ["Association only — see docs/FAIRNESS.md causal-language rules.", "Decision support, not a decision."],
      },
    },
  ],
};

export function recommendInterventions(lowDimensions: Intervention["appliesToDimension"][]): Intervention[] {
  return lowDimensions.flatMap((dim) => CATALOG[dim].map((i) => ({ ...i, appliesToDimension: dim })));
}
