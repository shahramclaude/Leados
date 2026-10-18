/**
 * Central lookup for severity / domain / status colors.
 * Every value resolves to a CSS custom property defined in globals.css —
 * components should never hard-code a hex value directly.
 */

export type SeverityKey = "sev1" | "sev2" | "sev3" | "sev4" | "sev5";
export type DomainKey =
  | "domain-people"
  | "domain-finance"
  | "domain-sales"
  | "domain-ops"
  | "domain-strategy";
export type BadgeVariant = SeverityKey | DomainKey | "neutral";
export type StatusKey = "green" | "yellow" | "red";

export const severityColor: Record<SeverityKey, string> = {
  sev5: "var(--sev5)",
  sev4: "var(--sev4)",
  sev3: "var(--sev3)",
  sev2: "var(--sev2)",
  sev1: "var(--sev1)",
};

export const severityLabel: Record<SeverityKey, string> = {
  sev5: "Critical",
  sev4: "High",
  sev3: "Medium",
  sev2: "Low",
  sev1: "Info",
};

export const domainColor: Record<DomainKey, string> = {
  "domain-people": "var(--domain-people)",
  "domain-finance": "var(--domain-finance)",
  "domain-sales": "var(--domain-sales)",
  "domain-ops": "var(--domain-ops)",
  "domain-strategy": "var(--domain-strategy)",
};

export const domainLabel: Record<DomainKey, string> = {
  "domain-people": "People",
  "domain-finance": "Finance",
  "domain-sales": "Sales",
  "domain-ops": "Operations",
  "domain-strategy": "Strategy",
};

export const statusColor: Record<StatusKey, string> = {
  green: "var(--status-green)",
  yellow: "var(--status-yellow)",
  red: "var(--status-red)",
};

export function variantColor(variant: BadgeVariant): string {
  if (variant === "neutral") return "var(--text-secondary)";
  if (variant in severityColor) return severityColor[variant as SeverityKey];
  return domainColor[variant as DomainKey];
}

export function variantLabel(variant: BadgeVariant): string {
  if (variant === "neutral") return "Neutral";
  if (variant in severityLabel) return severityLabel[variant as SeverityKey];
  return domainLabel[variant as DomainKey];
}

/** Lightweight deterministic fuzzy-match scorer used by the command palette. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  if (t.includes(q)) return 200;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 8 : 4;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}
