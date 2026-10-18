import type { Domain } from "@/lib/types";

export const DOMAINS: Domain[] = [
  "people",
  "decisions",
  "metrics",
  "execution",
  "finance",
  "product",
  "culture",
  "risk",
];

export const DOMAIN_LABELS: Record<Domain, string> = {
  people: "People",
  decisions: "Decisions",
  metrics: "Metrics",
  execution: "Execution",
  finance: "Finance",
  product: "Product",
  culture: "Culture",
  risk: "Risk",
};

export function isDomain(value: string): value is Domain {
  return (DOMAINS as string[]).includes(value);
}

export const SEVERITY_COLORS: Record<number, string> = {
  1: "#64748b",
  2: "#3b82f6",
  3: "#eab308",
  4: "#f97316",
  5: "#ef4444",
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Info",
  2: "Minor",
  3: "Moderate",
  4: "High",
  5: "Critical",
};
