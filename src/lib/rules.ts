// src/lib/rules.ts
// Synthetic rule catalog. Bare rule IDs (R1, R4, R7, R17, R73, R88 — the
// specific ones referenced by the task's pasted "pt-L" brief) are reused
// here deliberately so the feedback-loop / bifurcation logic below can be
// demonstrated against IDs that match the brief's own examples. Everything
// else about these rules (titles, categories, the other ~40 IDs) is this
// delivery's own invention for demo purposes — exactly as the real repo's
// own prior sessions disclosed for their rule catalogs. UNVERIFIED as any
// kind of real rule engine; labeled illustrative throughout the UI.
import type { RuleDef } from "./types";

export const RULE_CATALOG: RuleDef[] = [
  // STRATEGIC
  { id: "R1", title: "Strategic goal has no owner", category: "STRATEGIC", sev: 3 },
  { id: "R2", title: "Roadmap bet unresourced for 2+ sprints", category: "STRATEGIC", sev: 3 },
  { id: "R3", title: "Board-level strategy memo overdue", category: "STRATEGIC", sev: 2 },
  { id: "R73", title: "Strategic pivot thrash (3rd direction change this quarter)", category: "STRATEGIC", sev: 4 },
  { id: "R74", title: "Competitive response plan stale", category: "STRATEGIC", sev: 2 },
  { id: "R75", title: "North-star metric undefined for new initiative", category: "STRATEGIC", sev: 2 },

  // OPERATIONAL
  { id: "R16", title: "Deploy frequency down 40%", category: "OPERATIONAL", sev: 3 },
  { id: "R17", title: "Decision velocity declining (median time-to-decide up)", category: "OPERATIONAL", sev: 4 },
  { id: "R18", title: "Incident MTTR trending up", category: "OPERATIONAL", sev: 3 },
  { id: "R19", title: "Process backlog exceeds capacity", category: "OPERATIONAL", sev: 2 },
  { id: "R20", title: "On-call rotation gaps unfilled", category: "OPERATIONAL", sev: 3 },
  { id: "R21", title: "Tooling migration stalled mid-flight", category: "OPERATIONAL", sev: 2 },

  // FINANCIAL
  { id: "R30", title: "Cash runway under 6 months", category: "FINANCIAL", sev: 5 },
  { id: "R31", title: "Vendor spend 18% over forecast", category: "FINANCIAL", sev: 3 },
  { id: "R32", title: "Burn rate accelerating MoM", category: "FINANCIAL", sev: 4 },
  { id: "R33", title: "Receivables aging past 90 days", category: "FINANCIAL", sev: 2 },
  { id: "R34", title: "Budget reforecast overdue", category: "FINANCIAL", sev: 2 },
  { id: "R35", title: "Headcount cost growing faster than revenue", category: "FINANCIAL", sev: 3 },

  // PEOPLE
  { id: "R4", title: "Sustained overtime pattern detected", category: "PEOPLE", sev: 3, personLinkable: true },
  { id: "R5", title: "1:1 cadence slipping", category: "PEOPLE", sev: 2, personLinkable: true },
  { id: "R6", title: "Engagement survey score declining", category: "PEOPLE", sev: 2, personLinkable: true },
  { id: "R7", title: "Burnout risk flag", category: "PEOPLE", sev: 4, personLinkable: true },
  { id: "R8", title: "Unresolved interpersonal conflict", category: "PEOPLE", sev: 3, personLinkable: true },
  { id: "R9", title: "Key-person attrition risk (flight risk + sole owner of critical system)", category: "PEOPLE", sev: 5, personLinkable: true },
  { id: "R10", title: "Strong internal mobility (positive)", category: "PEOPLE", sev: 1, polarity: "positive" },
  { id: "R11", title: "High manager trust index (positive)", category: "PEOPLE", sev: 1, polarity: "positive" },

  // GOVERNANCE
  { id: "R85", title: "Decision rights ambiguous for new org unit", category: "GOVERNANCE", sev: 2 },
  { id: "R86", title: "Audit finding open past remediation date", category: "GOVERNANCE", sev: 3 },
  { id: "R87", title: "Board reporting cadence missed", category: "GOVERNANCE", sev: 2 },
  { id: "R88", title: "Compliance control non-conformant", category: "GOVERNANCE", sev: 4 },
  { id: "R89", title: "Conflict-of-interest disclosure overdue", category: "GOVERNANCE", sev: 3 },
  { id: "R90", title: "Remediation plan in motion (positive)", category: "GOVERNANCE", sev: 1, polarity: "positive" },

  // MARKET
  { id: "R50", title: "Churn ticked up in core segment", category: "MARKET", sev: 3 },
  { id: "R51", title: "New entrant undercutting on price", category: "MARKET", sev: 3 },
  { id: "R52", title: "Category demand softening", category: "MARKET", sev: 2 },
  { id: "R53", title: "Key channel partner wavering", category: "MARKET", sev: 3 },
  { id: "R54", title: "Win rate declining vs. named competitor", category: "MARKET", sev: 2 },
  { id: "R55", title: "Pricing power eroding", category: "MARKET", sev: 3 },

  // REPUTATIONAL
  { id: "R60", title: "Negative press coverage trending", category: "REPUTATIONAL", sev: 4 },
  { id: "R61", title: "Customer NPS detractor spike", category: "REPUTATIONAL", sev: 3 },
  { id: "R62", title: "Social sentiment negative swing", category: "REPUTATIONAL", sev: 2 },
  { id: "R63", title: "Public complaint unresolved past SLA", category: "REPUTATIONAL", sev: 3 },
  { id: "R64", title: "Executive public statement backlash", category: "REPUTATIONAL", sev: 4 },
  { id: "R65", title: "Employer-brand review score dropping", category: "REPUTATIONAL", sev: 2 },

  // RESILIENCE
  { id: "R95", title: "Single point of failure in critical system", category: "RESILIENCE", sev: 4 },
  { id: "R96", title: "Disaster-recovery test overdue", category: "RESILIENCE", sev: 3 },
  { id: "R97", title: "Supplier concentration risk", category: "RESILIENCE", sev: 3 },
  { id: "R98", title: "No backup owner for critical process", category: "RESILIENCE", sev: 3 },
  { id: "R99", title: "Insurance coverage gap identified", category: "RESILIENCE", sev: 2 },
  { id: "R100", title: "Business-continuity plan untested this year", category: "RESILIENCE", sev: 2 },
];

export const RULES_BY_ID: Record<string, RuleDef> = Object.fromEntries(
  RULE_CATALOG.map((r) => [r.id, r])
);
