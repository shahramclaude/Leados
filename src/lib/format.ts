export function formatUsd(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { dateStyle: "medium" });
}
