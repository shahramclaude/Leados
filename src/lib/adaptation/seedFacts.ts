// src/lib/adaptation/seedFacts.ts
//
// Seeded domain facts for the adaptive demo surface. These are deliberately
// static/deterministic so content-parity tests can assert the exact same
// fact set survives every adaptation state.

import type { Domain } from "@/lib/familiarity";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface DomainFact {
  id: string;
  domain: Domain;
  label: string;
  value: string;
  severity: Severity;
  detail: string;
}

export const SEED_FACTS: DomainFact[] = [
  { id: "fin-1", domain: "finance", label: "Runway", value: "7.2 months", severity: "high", detail: "At current net burn of £410k/month, cash runs out in 7.2 months absent new revenue or financing." },
  { id: "fin-2", domain: "finance", label: "Burn trend", value: "+9% MoM", severity: "medium", detail: "Net burn increased 9% month-over-month, driven by a one-off infrastructure migration cost." },
  { id: "fin-3", domain: "finance", label: "Gross margin", value: "61%", severity: "low", detail: "Gross margin is stable at 61%, in line with the last two quarters." },
  { id: "fin-4", domain: "finance", label: "Receivables overdue", value: "£128k", severity: "medium", detail: "£128k of receivables are more than 60 days overdue, concentrated in two accounts." },

  { id: "people-1", domain: "people", label: "Regrettable attrition", value: "14% (TTM)", severity: "high", detail: "Regrettable attrition over the trailing twelve months is 14%, concentrated in the engineering team." },
  { id: "people-2", domain: "people", label: "Engagement score", value: "68/100", severity: "medium", detail: "Engagement score has declined 6 points this quarter, led by the operations team." },
  { id: "people-3", domain: "people", label: "Succession coverage", value: "3 of 9 key roles", severity: "high", detail: "Only 3 of 9 key leadership roles have an identified internal successor." },
  { id: "people-4", domain: "people", label: "Open requisitions", value: "11", severity: "info", detail: "11 roles are open, 4 of which have been open longer than 90 days." },

  { id: "risk-1", domain: "risk", label: "Largest unmitigated exposure", value: "Single-vendor payments dependency", severity: "critical", detail: "A single payments vendor processes 94% of transaction volume with no tested failover." },
  { id: "risk-2", domain: "risk", label: "Open compliance breaches", value: "1 (data retention)", severity: "critical", detail: "One open data-retention policy breach is unresolved past its remediation deadline." },
  { id: "risk-3", domain: "risk", label: "Vendor concentration", value: "Top 3 vendors = 61% of spend", severity: "medium", detail: "Vendor concentration has increased from 52% to 61% of total spend over two quarters." },
  { id: "risk-4", domain: "risk", label: "Insurance coverage gap", value: "Cyber coverage lapses in 18 days", severity: "high", detail: "The current cyber liability policy lapses in 18 days with no renewal yet signed." },

  { id: "tech-1", domain: "tech", label: "Critical security findings", value: "2 open", severity: "critical", detail: "Two critical-severity security findings remain open past their SLA remediation window." },
  { id: "tech-2", domain: "tech", label: "Production incidents", value: "5 this month (+2)", severity: "medium", detail: "Production incidents rose from 3 to 5 this month, concentrated in the payments service." },
  { id: "tech-3", domain: "tech", label: "Technical debt blocking delivery", value: "Checkout service", severity: "medium", detail: "The checkout service's test coverage (41%) is slowing every related delivery by an estimated 30%." },
  { id: "tech-4", domain: "tech", label: "Uptime (90d)", value: "99.92%", severity: "low", detail: "Uptime over the trailing 90 days is 99.92%, within the contracted SLA." },
];

export function factsForDomain(domain: Domain): DomainFact[] {
  return SEED_FACTS.filter((f) => f.domain === domain);
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** The neutral default order: severity descending, then stable by original id order. */
export function defaultOrderFor(facts: DomainFact[]): string[] {
  return [...facts]
    .map((f, index) => ({ f, index }))
    .sort((a, b) => {
      const sevDiff = SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.index - b.index;
    })
    .map((x) => x.f.id);
}
