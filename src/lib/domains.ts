import type { Domain } from "@/lib/types";

// Static metadata for each domain axis on the radar + nav badges.
// Colors are drawn from the design-system palette in globals.css
// (see --domain-* custom properties).
export const DOMAIN_META: Record<
  Domain,
  { label: string; short: string; color: string; route: string | null }
> = {
  people: { label: "People", short: "PPL", color: "var(--domain-people)", route: "/people" },
  strategic: { label: "Strategic", short: "STR", color: "var(--domain-strategic)", route: "/strategic" },
  financial: { label: "Financial", short: "FIN", color: "var(--domain-financial)", route: "/financial" },
  execution: { label: "Execution", short: "EXE", color: "var(--domain-execution)", route: "/execution" },
  signals: { label: "Signals", short: "SIG", color: "var(--domain-signals)", route: "/signals" },
  legal: { label: "Legal", short: "LEG", color: "var(--domain-legal)", route: null },
  product: { label: "Product", short: "PRD", color: "var(--domain-product)", route: null },
  culture: { label: "Culture", short: "CUL", color: "var(--domain-culture)", route: null },
};

export const DOMAIN_ORDER: Domain[] = [
  "people",
  "strategic",
  "financial",
  "execution",
  "signals",
  "legal",
  "product",
  "culture",
];

export function severityColor(sev: number): string {
  if (sev >= 5) return "var(--sev-5)";
  if (sev === 4) return "var(--sev-4)";
  if (sev === 3) return "var(--sev-3)";
  return "var(--sev-low)";
}

export function healthColor(score: number): string {
  if (score < 40) return "var(--sev-5)";
  if (score < 70) return "var(--sev-4)";
  return "var(--good)";
}

export function timeUntil(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - nowMs;
  if (diffMs <= 0) return "overdue";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

export function timeAgo(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const diffMs = nowMs - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
