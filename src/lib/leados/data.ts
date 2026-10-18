import type { DomainKey, SeverityKey } from "@/components/leados/ui/tokens";

export interface Finding {
  id: string;
  title: string;
  domain: DomainKey;
  severity: SeverityKey;
  summary: string;
  recurrence: number;
  owner: string;
  createdAt: string;
  status: "open" | "monitoring" | "resolved";
}

export interface Person {
  id: string;
  name: string;
  role: string;
  domain: DomainKey;
  riskScore: number;
  tenureMonths: number;
  lastReview: string;
}

export interface Metric {
  id: string;
  label: string;
  domain: DomainKey;
  value: number;
  unit: string;
  delta: number;
  deltaDir: "up" | "down" | "flat";
  status: "green" | "yellow" | "red";
  history: number[];
}

export interface Decision {
  id: string;
  title: string;
  domain: DomainKey;
  status: "pending" | "approved" | "blocked";
  owner: string;
  dueDate: string;
}

export interface Playbook {
  id: string;
  name: string;
  domain: DomainKey;
  description: string;
  steps: number;
}

export const domains: DomainKey[] = [
  "domain-people",
  "domain-finance",
  "domain-sales",
  "domain-ops",
  "domain-strategy",
];

export const findings: Finding[] = [
  {
    id: "F-1042",
    title: "Attrition risk spike in Platform Engineering",
    domain: "domain-people",
    severity: "sev5",
    summary: "3 senior ICs flagged elevated flight-risk signals within a 14-day window.",
    recurrence: 4,
    owner: "A. Mensah",
    createdAt: "2026-02-11",
    status: "open",
  },
  {
    id: "F-1039",
    title: "Gross margin compression — EU region",
    domain: "domain-finance",
    severity: "sev4",
    summary: "COGS variance exceeds forecast by 6.2pp for the second consecutive month.",
    recurrence: 2,
    owner: "R. Okafor",
    createdAt: "2026-02-10",
    status: "monitoring",
  },
  {
    id: "F-1037",
    title: "Pipeline coverage below threshold — Enterprise",
    domain: "domain-sales",
    severity: "sev4",
    summary: "Coverage ratio fell to 2.1x against a 3x target for Q2 bookings.",
    recurrence: 1,
    owner: "L. Fischer",
    createdAt: "2026-02-09",
    status: "open",
  },
  {
    id: "F-1033",
    title: "Vendor SLA breach — logistics partner",
    domain: "domain-ops",
    severity: "sev3",
    summary: "On-time delivery dropped to 91.4%, breaching the 95% contractual floor.",
    recurrence: 3,
    owner: "S. Park",
    createdAt: "2026-02-07",
    status: "monitoring",
  },
  {
    id: "F-1028",
    title: "Strategic bet misalignment — APAC expansion",
    domain: "domain-strategy",
    severity: "sev3",
    summary: "Resourcing plan diverges from board-approved roadmap by two quarters.",
    recurrence: 1,
    owner: "N. Ibrahim",
    createdAt: "2026-02-05",
    status: "open",
  },
  {
    id: "F-1021",
    title: "Onboarding velocity improved",
    domain: "domain-people",
    severity: "sev2",
    summary: "Time-to-productivity down 18% after revised ramp program.",
    recurrence: 0,
    owner: "A. Mensah",
    createdAt: "2026-02-03",
    status: "resolved",
  },
  {
    id: "F-1015",
    title: "Cash conversion cycle trending favorably",
    domain: "domain-finance",
    severity: "sev1",
    summary: "DSO improved by 4 days quarter over quarter.",
    recurrence: 0,
    owner: "R. Okafor",
    createdAt: "2026-01-29",
    status: "resolved",
  },
];

export const people: Person[] = [
  { id: "P-001", name: "Amara Mensah", role: "VP People", domain: "domain-people", riskScore: 28, tenureMonths: 34, lastReview: "2026-01-12" },
  { id: "P-002", name: "Ravi Okafor", role: "CFO", domain: "domain-finance", riskScore: 41, tenureMonths: 52, lastReview: "2026-01-20" },
  { id: "P-003", name: "Lena Fischer", role: "VP Sales", domain: "domain-sales", riskScore: 63, tenureMonths: 18, lastReview: "2026-02-01" },
  { id: "P-004", name: "Soo-ah Park", role: "Dir. Operations", domain: "domain-ops", riskScore: 35, tenureMonths: 27, lastReview: "2026-01-28" },
  { id: "P-005", name: "Noor Ibrahim", role: "Chief Strategy Officer", domain: "domain-strategy", riskScore: 22, tenureMonths: 61, lastReview: "2026-01-15" },
  { id: "P-006", name: "Devon Akintola", role: "Staff Engineer", domain: "domain-people", riskScore: 71, tenureMonths: 9, lastReview: "2026-02-08" },
  { id: "P-007", name: "Priya Chandran", role: "Controller", domain: "domain-finance", riskScore: 19, tenureMonths: 44, lastReview: "2026-01-05" },
  { id: "P-008", name: "Marcus Lund", role: "Enterprise AE", domain: "domain-sales", riskScore: 54, tenureMonths: 15, lastReview: "2026-02-04" },
];

export const metrics: Metric[] = [
  { id: "M-01", label: "Composite Health", domain: "domain-strategy", value: 78, unit: "/100", delta: 2.4, deltaDir: "up", status: "green", history: [70, 72, 71, 74, 76, 75, 78] },
  { id: "M-02", label: "Attrition Risk Index", domain: "domain-people", value: 61, unit: "/100", delta: 9, deltaDir: "up", status: "red", history: [40, 44, 48, 52, 55, 58, 61] },
  { id: "M-03", label: "Gross Margin", domain: "domain-finance", value: 58.3, unit: "%", delta: -2.1, deltaDir: "down", status: "yellow", history: [63, 62, 61, 60, 59.5, 59, 58.3] },
  { id: "M-04", label: "Pipeline Coverage", domain: "domain-sales", value: 2.1, unit: "x", delta: -0.6, deltaDir: "down", status: "yellow", history: [3.1, 3.0, 2.8, 2.6, 2.4, 2.2, 2.1] },
  { id: "M-05", label: "On-Time Delivery", domain: "domain-ops", value: 91.4, unit: "%", delta: -1.8, deltaDir: "down", status: "yellow", history: [96, 95, 94.5, 93, 92.5, 92, 91.4] },
  { id: "M-06", label: "Strategic Alignment", domain: "domain-strategy", value: 84, unit: "%", delta: 0, deltaDir: "flat", status: "green", history: [82, 83, 83, 84, 84, 84, 84] },
];

export const decisions: Decision[] = [
  { id: "D-201", title: "Approve retention package — Platform Eng", domain: "domain-people", status: "pending", owner: "A. Mensah", dueDate: "2026-02-14" },
  { id: "D-198", title: "Reprice EU enterprise contracts", domain: "domain-finance", status: "pending", owner: "R. Okafor", dueDate: "2026-02-16" },
  { id: "D-194", title: "Reallocate Q2 pipeline targets", domain: "domain-sales", status: "approved", owner: "L. Fischer", dueDate: "2026-02-10" },
  { id: "D-190", title: "Replace logistics vendor", domain: "domain-ops", status: "blocked", owner: "S. Park", dueDate: "2026-02-20" },
  { id: "D-187", title: "Re-sequence APAC expansion roadmap", domain: "domain-strategy", status: "pending", owner: "N. Ibrahim", dueDate: "2026-02-25" },
];

export const playbooks: Playbook[] = [
  { id: "PB-01", name: "Flight-risk intervention", domain: "domain-people", description: "Structured retention conversation + comp review within 5 business days.", steps: 6 },
  { id: "PB-02", name: "Margin recovery sprint", domain: "domain-finance", description: "COGS audit, vendor renegotiation, and pricing review cycle.", steps: 5 },
  { id: "PB-03", name: "Pipeline acceleration", domain: "domain-sales", description: "Reallocate SDR coverage and launch targeted outbound surge.", steps: 4 },
  { id: "PB-04", name: "Vendor SLA remediation", domain: "domain-ops", description: "Formal breach notice, corrective action plan, and backup sourcing.", steps: 7 },
  { id: "PB-05", name: "Roadmap realignment", domain: "domain-strategy", description: "Cross-functional working session to reconcile roadmap vs. resourcing.", steps: 5 },
];

export interface RiskCategory {
  id: string;
  name: string;
  domain: DomainKey;
  description: string;
  severity: SeverityKey;
  exposure: number;
}

export const riskCategories: RiskCategory[] = [
  { id: "R-01", name: "Talent & Retention", domain: "domain-people", description: "Concentrated flight-risk in senior engineering cohort.", severity: "sev5", exposure: 82 },
  { id: "R-02", name: "Financial Control", domain: "domain-finance", description: "Margin compression driven by COGS variance in EU region.", severity: "sev4", exposure: 64 },
  { id: "R-03", name: "Revenue Pipeline", domain: "domain-sales", description: "Enterprise coverage below target threshold for Q2.", severity: "sev4", exposure: 58 },
  { id: "R-04", name: "Vendor & Supply", domain: "domain-ops", description: "Logistics SLA breach trending for second month.", severity: "sev3", exposure: 41 },
  { id: "R-05", name: "Strategic Execution", domain: "domain-strategy", description: "APAC roadmap misaligned with resourcing plan.", severity: "sev3", exposure: 37 },
  { id: "R-06", name: "Regulatory & Compliance", domain: "domain-finance", description: "No open breaches; quarterly audit scheduled.", severity: "sev1", exposure: 12 },
  { id: "R-07", name: "Technology & Continuity", domain: "domain-ops", description: "Platform uptime nominal; one failover drill overdue.", severity: "sev2", exposure: 24 },
  { id: "R-08", name: "Reputation & Brand", domain: "domain-strategy", description: "Sentiment stable; no active escalations.", severity: "sev1", exposure: 9 },
];

export function compositeHealth() {
  const byDomain = domains.map((domain) => {
    const domainMetrics = metrics.filter((m) => m.domain === domain);
    const avg =
      domainMetrics.reduce((sum, m) => sum + (m.status === "green" ? 90 : m.status === "yellow" ? 60 : 30), 0) /
      (domainMetrics.length || 1);
    return { domain, score: Math.round(avg) };
  });
  const composite = Math.round(byDomain.reduce((sum, d) => sum + d.score, 0) / byDomain.length);
  return { byDomain, composite };
}
