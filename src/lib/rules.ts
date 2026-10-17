// Original 50-rule synthetic catalog across 8 categories.
// Not copied from any external source — see AI-SESSION-LOG.md. A handful of
// rules are deliberately designed to compose into named CAS scenarios
// (burnout loop, velocity death spiral, austerity trap, trust collapse) so
// the CAS engine has something real to detect; those scenario *names* are
// generic leadership/systems-thinking concepts, not IDs taken from any
// unverified pasted brief.
import type { Category, Rule, Severity } from "./types";

function r(id: string, category: Category, label: string, description: string, sev: Severity): Rule {
  return { id, category, label, description, defaultSeverity: sev };
}

export const RULES: Rule[] = [
  // People (R1-R7)
  r("R1", "People", "1:1 cadence slipping", "Scheduled 1:1s repeatedly moved or skipped.", 2),
  r("R2", "People", "Regretted attrition risk", "Exit-interview signals or market-rate gap detected.", 3),
  r("R3", "People", "Onboarding stall", "New hire has no shipped work after 30 days.", 2),
  r("R4", "People", "Sustained overtime", "Person logging >20% over baseline hours for 3+ weeks.", 3),
  r("R5", "People", "Manager span overload", "One manager has >8 direct reports.", 2),
  r("R6", "People", "Promotion backlog", "Promo case ready but unsubmitted for 2+ cycles.", 2),
  r("R7", "People", "Burnout signal", "Self-reported exhaustion or sustained after-hours activity spike.", 4),

  // Finance (R8-R14)
  r("R8", "Finance", "Runway under 6 months", "Cash runway has dropped below 6 months at current burn.", 4),
  r("R9", "Finance", "Budget variance", "Department spend >15% over forecast this quarter.", 3),
  r("R10", "Finance", "Vendor concentration", "Single vendor is >25% of operating spend.", 2),
  r("R11", "Finance", "Deferred revenue risk", "Large contract renewal uncertain within 60 days.", 3),
  r("R12", "Finance", "Margin compression", "Gross margin down 3+ points quarter-over-quarter.", 3),
  r("R13", "Finance", "Hiring freeze triggered", "Headcount plan frozen mid-cycle due to burn.", 3),
  r("R14", "Finance", "Austerity signal", "Non-essential spend cut >30% in a single cycle.", 2),

  // Delivery / Ops (R15-R21)
  r("R15", "Delivery", "Velocity decline", "Sprint velocity down 25%+ over 3 sprints.", 3),
  r("R16", "Delivery", "Deploy frequency drop", "Deploy frequency down 40%+ versus trailing average.", 2),
  r("R17", "Delivery", "Incident recurrence", "Same root cause recurs within 30 days.", 3),
  r("R18", "Delivery", "On-call fatigue", "Same engineer paged 5+ nights in a rolling 2 weeks.", 3),
  r("R19", "Delivery", "Scope creep", "Active sprint scope grew >20% after kickoff.", 2),
  r("R20", "Delivery", "Dependency block", "Critical path blocked on external team >5 days.", 2),
  r("R21", "Delivery", "Quality regression", "Escaped-defect rate up 2x month-over-month.", 3),

  // Strategy (R22-R27)
  r("R22", "Strategy", "Unowned roadmap bet", "A committed bet has no accountable owner.", 2),
  r("R23", "Strategy", "Strategy drift", "Quarterly OKRs diverge from stated annual strategy.", 2),
  r("R24", "Strategy", "Competitive surprise", "Competitor shipped a feature with no internal response plan.", 3),
  r("R25", "Strategy", "Pivot indecision", "A go/no-go decision open >45 days past target.", 3),
  r("R26", "Strategy", "Resourcing mismatch", "Top strategic bet has <10% of engineering capacity.", 3),
  r("R27", "Strategy", "North star ambiguity", "Leadership team gives conflicting answers on top priority.", 2),

  // Legal (R28-R33)
  r("R28", "Legal", "Contract renewal lapse risk", "Key contract renewal deadline inside 14 days, unresolved.", 3),
  r("R29", "Legal", "Compliance gap", "Required audit or certification is overdue.", 3),
  r("R30", "Legal", "IP assignment gap", "Contractor shipped code without signed IP assignment.", 3),
  r("R31", "Legal", "Data processing exposure", "New data flow lacks a reviewed DPA.", 3),
  r("R32", "Legal", "Litigation watch", "Open dispute with potential financial exposure.", 2),
  r("R33", "Legal", "Policy staleness", "Core policy document unreviewed for 18+ months.", 1),

  // Product (R34-R39)
  r("R34", "Product", "Churn uptick", "Customer churn up 0.5pp+ month-over-month in a cohort.", 3),
  r("R35", "Product", "Activation drop", "New-user activation rate down 10%+ after a release.", 3),
  r("R36", "Product", "Support ticket spike", "Support volume up 30%+ week-over-week, single root cause.", 2),
  r("R37", "Product", "Feature flag sprawl", ">20 stale flags left permanently on or off.", 1),
  r("R38", "Product", "NPS decline", "NPS down 10+ points over two surveys.", 2),
  r("R39", "Product", "Roadmap/feedback gap", "Top requested feature absent from next 2 roadmap cycles.", 2),

  // Culture (R40-R44)
  r("R40", "Culture", "Psych safety dip", "Anonymous survey shows declining safety-to-speak-up score.", 3),
  r("R41", "Culture", "Trust erosion", "Cross-team trust score drops after a visible leadership reversal.", 3),
  r("R42", "Culture", "Recognition gap", "No peer or manager recognition logged for a team in 60 days.", 1),
  r("R43", "Culture", "Blame pattern", "Postmortems increasingly name individuals over systems.", 2),
  r("R44", "Culture", "Meeting bloat", "Average calendar load up 25%+ with no decision throughput gain.", 2),

  // Security (R45-R50)
  r("R45", "Security", "Access review overdue", "Quarterly access review skipped for a production system.", 2),
  r("R46", "Security", "Patch backlog", "Critical CVEs unpatched past SLA.", 3),
  r("R47", "Security", "Incident response gap", "No on-call owner for a security incident class.", 3),
  r("R48", "Security", "Credential sprawl", "Shared/unrotated credentials found in active use.", 3),
  r("R49", "Security", "Vendor risk unreviewed", "New critical vendor lacks a completed security review.", 2),
  r("R50", "Security", "Trust collapse exposure", "Public-facing incident with no disclosed remediation plan.", 4),
];

export const RULES_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.id, r]));

export const SCENARIO_PRESETS: { id: string; label: string; description: string; ruleIds: string[] }[] = [
  {
    id: "burnout-loop",
    label: "Burnout feedback loop",
    description: "Overtime (R4) and burnout signal (R7) both active on the same person.",
    ruleIds: ["R4", "R7"],
  },
  {
    id: "velocity-spiral",
    label: "Velocity death spiral",
    description: "Velocity decline (R15) + incident recurrence (R17) + on-call fatigue (R18).",
    ruleIds: ["R15", "R17", "R18"],
  },
  {
    id: "austerity-trap",
    label: "Austerity trap",
    description: "Low runway (R8) forcing an austerity signal (R14) and hiring freeze (R13).",
    ruleIds: ["R8", "R13", "R14"],
  },
  {
    id: "trust-collapse",
    label: "Trust collapse",
    description: "Psych safety dip (R40) + trust erosion (R41) + blame pattern (R43).",
    ruleIds: ["R40", "R41", "R43"],
  },
  {
    id: "clear",
    label: "Clear all signals",
    description: "Reset the Signal Board to zero active rules.",
    ruleIds: [],
  },
];
