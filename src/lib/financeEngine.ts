// financeEngine — plan vs. actual variance analysis with drill-down to a
// root-cause ranking, and headcount-driven baseline burn so runway
// projections are conditioned on the real hiring plan + people data instead
// of a hand-typed burn number.
import type { FinancialEventRecord } from "@/lib/financialOS";

export interface PlanLine {
  periodMonth: string; // ISO date, first-of-month
  domain?: string | null;
  team?: string | null;
  category: string;
  type: "revenue" | "expense";
  plannedAmount: number;
}

export interface PersonRecord {
  name: string;
  role: string;
  domain: string;
  team: string;
  monthlySalary: number | null;
  active: boolean;
}

/** DESIGN PARAMETER: fallback fully-loaded monthly cost by role keyword when
 * a person has no monthlySalary on file (contractors, new reqs, redacted
 * comp). Fully-loaded = base + ~28% benefits/taxes overhead, pre-applied. */
const ROLE_COST_FALLBACK: Array<{ match: RegExp; monthlyCost: number }> = [
  { match: /chief|vp|head of/i, monthlyCost: 26000 },
  { match: /principal|staff/i, monthlyCost: 23000 },
  { match: /senior|lead|manager/i, monthlyCost: 19000 },
  { match: /engineer|scientist|developer/i, monthlyCost: 15500 },
  { match: /.*/, monthlyCost: 12500 },
];

export function estimateMonthlyCost(person: Pick<PersonRecord, "role" | "monthlySalary">): number {
  if (person.monthlySalary && person.monthlySalary > 0) return person.monthlySalary;
  const fallback = ROLE_COST_FALLBACK.find((r) => r.match.test(person.role));
  return fallback ? fallback.monthlyCost : 12500;
}

export interface HeadcountCostBreakdown {
  totalMonthlyCost: number;
  activeHeadcount: number;
  byDomain: Record<string, number>;
  estimatedCount: number; // how many people used the fallback estimate
}

/** Sums fully-loaded monthly cost across active people, by domain. */
export function computeHeadcountCost(people: PersonRecord[]): HeadcountCostBreakdown {
  const active = people.filter((p) => p.active);
  const byDomain: Record<string, number> = {};
  let estimatedCount = 0;
  let totalMonthlyCost = 0;
  for (const p of active) {
    const cost = estimateMonthlyCost(p);
    if (!p.monthlySalary) estimatedCount += 1;
    totalMonthlyCost += cost;
    byDomain[p.domain] = (byDomain[p.domain] ?? 0) + cost;
  }
  return { totalMonthlyCost, activeHeadcount: active.length, byDomain, estimatedCount };
}

export interface VarianceLine {
  key: string;
  domain: string | null;
  team: string | null;
  category: string;
  type: "revenue" | "expense";
  planned: number;
  actual: number;
  variance: number; // actual - planned (for expense, positive = overspend; for revenue, positive = beat)
  variancePct: number;
}

export interface VarianceReport {
  month: string;
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  lines: VarianceLine[];
  topDrivers: VarianceLine[]; // root-cause ranked, biggest absolute contribution first
  narrative: string[];
}

function monthKeyOf(d: string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Plan vs. actual variance with drill-down: groups both sides by
 * (domain, team, category), computes signed variance per line, and ranks
 * lines by absolute dollar contribution to the total variance — a simple,
 * transparent root-cause engine (the biggest lines are "why" the top-line
 * number moved).
 */
export function buildVarianceReport(plan: PlanLine[], actuals: FinancialEventRecord[], month: string): VarianceReport {
  const planForMonth = plan.filter((p) => monthKeyOf(p.periodMonth) === month);
  const actualsForMonth = actuals.filter((a) => monthKeyOf(a.date) === month && a.type !== "funding" && a.type !== "pl_summary");

  const lineKey = (domain: string | null | undefined, team: string | null | undefined, category: string) =>
    `${domain ?? "—"}::${team ?? "—"}::${category}`;

  const lines = new Map<string, VarianceLine>();
  for (const p of planForMonth) {
    const key = lineKey(p.domain, p.team, p.category);
    lines.set(key, {
      key,
      domain: p.domain ?? null,
      team: p.team ?? null,
      category: p.category,
      type: p.type,
      planned: p.plannedAmount,
      actual: 0,
      variance: 0,
      variancePct: 0,
    });
  }
  for (const a of actualsForMonth) {
    const type: "revenue" | "expense" = a.type === "revenue" ? "revenue" : "expense";
    const key = lineKey(a.domain, a.team, a.category);
    if (!lines.has(key)) {
      lines.set(key, { key, domain: a.domain ?? null, team: a.team ?? null, category: a.category, type, planned: 0, actual: 0, variance: 0, variancePct: 0 });
    }
    lines.get(key)!.actual += a.amount;
  }

  for (const line of lines.values()) {
    const sign = line.type === "revenue" ? 1 : -1;
    line.variance = sign * (line.actual - line.planned);
    line.variancePct = line.planned !== 0 ? (line.actual - line.planned) / Math.abs(line.planned) : line.actual === 0 ? 0 : 1;
  }

  const allLines = [...lines.values()];
  const totalPlanned = planForMonth.reduce((s, p) => s + (p.type === "revenue" ? p.plannedAmount : -p.plannedAmount), 0);
  const totalActual = actualsForMonth.reduce((s, a) => s + (a.type === "revenue" ? a.amount : -a.amount), 0);
  const totalVariance = totalActual - totalPlanned;
  const totalVariancePct = totalPlanned !== 0 ? totalVariance / Math.abs(totalPlanned) : 0;

  const topDrivers = [...allLines].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5);

  const narrative = topDrivers
    .filter((d) => Math.abs(d.variance) > 1)
    .map((d) => {
      const direction = d.variance < 0 ? "unfavorable" : "favorable";
      return `${d.team ?? d.domain ?? d.category} / ${d.category}: ${direction} variance of $${Math.abs(Math.round(d.variance)).toLocaleString()} (${(d.variancePct * 100).toFixed(0)}% vs plan).`;
    });

  return { month, totalPlanned, totalActual, totalVariance, totalVariancePct, lines: allLines, topDrivers, narrative };
}
