const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return currencyFormatter.format(n);
}

export function formatPercent(value: number | string, digits = 1): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${n.toFixed(digits)}%`;
}

export function formatNumber(value: number | string, digits = 0): string {
  const n = typeof value === "string" ? Number(value) : value;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelativeToAnchor(value: string | Date, anchor: Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diffDays = Math.round((d.getTime() - anchor.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return diffDays > 0 ? `In ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
}
