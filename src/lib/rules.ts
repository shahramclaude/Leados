// src/lib/rules.ts
// Synthetic 24-rule catalog across 6 categories, used to drive the Signal
// Board that feeds the Attention Optimizer. ORIGINAL to this sandbox —
// disclosed-fabricated, not pulled from any verified rule engine. Rule IDs
// R1/R4/R7/R10/R17/R73/R88/R103/R104 are deliberately reused from the task's
// pasted "pt-U" brief so its own named dependency examples (R10 depends on
// R1, R104 depends on R103) stay explorable; everything else is invented.

import type { RuleDef } from "./types";

export const RULES: RuleDef[] = [
  { rule: "R1", category: "people", title: "1:1 cadence slipping with a direct report", baseSev: 3, playId: "oneonone-bundle", personLinked: true },
  { rule: "R4", category: "people", title: "Sustained after-hours activity spike (burnout signal)", baseSev: 4, playId: "oneonone-bundle", personLinked: true },
  { rule: "R7", category: "people", title: "Repeated missed deadlines, same owner", baseSev: 4, playId: "oneonone-bundle", personLinked: true },
  { rule: "R10", category: "people", title: "No documented growth plan for a flight-risk performer", baseSev: 3, playId: "oneonone-bundle", personLinked: true },
  { rule: "R12", category: "people", title: "Underperformance uncorrected after two review cycles", baseSev: 5, playId: "termination-prep", personLinked: true },
  { rule: "R17", category: "ops", title: "Deploy frequency down sharply this sprint", baseSev: 3, playId: "sprint-plan" },
  { rule: "R19", category: "ops", title: "On-call rotation overloaded on one engineer", baseSev: 4, playId: "sprint-plan", personLinked: true },
  { rule: "R22", category: "ops", title: "Incident MTTR trending up three sprints running", baseSev: 3, playId: "sprint-plan" },
  { rule: "R30", category: "strategy", title: "Roadmap bet has no accountable owner", baseSev: 3, playId: "roadmap-sync" },
  { rule: "R33", category: "strategy", title: "Board narrative contradicts last quarter's stated bet", baseSev: 4, playId: "board-narrative" },
  { rule: "R36", category: "strategy", title: "Competitive move unaddressed for 30+ days", baseSev: 3, playId: "roadmap-sync" },
  { rule: "R41", category: "legal", title: "Key contract renewal unanswered by counterparty", baseSev: 3, playId: "contract-review" },
  { rule: "R44", category: "legal", title: "Regulatory filing window closing within 10 days", baseSev: 5, playId: "contract-review" },
  { rule: "R47", category: "legal", title: "Data processing agreement past review date", baseSev: 2, playId: "contract-review" },
  { rule: "R51", category: "product", title: "Churn ticked up in a concentrated cohort", baseSev: 4, playId: "sprint-plan" },
  { rule: "R55", category: "product", title: "Activation rate regression after last release", baseSev: 3, playId: "sprint-plan" },
  { rule: "R58", category: "product", title: "Support escalations up without a root cause owner", baseSev: 3, playId: "crisis-response" },
  { rule: "R73", category: "finance", title: "Runway under 6 months at current burn", baseSev: 5, playId: "pl-review" },
  { rule: "R76", category: "finance", title: "Vendor spend materially over forecast", baseSev: 4, playId: "pl-review" },
  { rule: "R80", category: "finance", title: "Budget variance unexplained for two consecutive months", baseSev: 3, playId: "pl-review" },
  { rule: "R88", category: "finance", title: "Customer concentration risk — top account over 30% of revenue", baseSev: 4, playId: "board-narrative" },
  { rule: "R103", category: "finance", title: "Gross margin compressed vs. plan", baseSev: 4, playId: "pl-review" },
  { rule: "R104", category: "finance", title: "LTV:CAC ratio below healthy threshold", baseSev: 4, playId: "pl-review" },
  { rule: "R110", category: "ops", title: "Cross-team dependency blocking two workstreams", baseSev: 3, playId: "sprint-plan" },
];

export const RULES_BY_ID: Record<string, RuleDef> = Object.fromEntries(
  RULES.map((r) => [r.rule, r])
);

// Dependency heuristic, carried over verbatim from the pasted brief's own
// described examples (R10 needs R1 first; R104 needs R103 first). This is a
// hand-authored heuristic map, not a learned or verified dependency graph.
export function dependenciesFor(rule: string): string[] {
  if (rule === "R10") return ["R1"];
  if (rule === "R104") return ["R103"];
  if (rule === "R12") return ["R7"];
  return [];
}

export const PEOPLE = ["Ana", "Marcus", "Priya", "Dee", "Lior", "Sam"];
