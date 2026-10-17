export function uid(prefix = "ev"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function daysBetween(ts: string, today: string): number {
  const a = new Date(ts).getTime();
  const b = new Date(today).getTime();
  return Math.round((b - a) / 86400000);
}

export function fmtDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ts;
  }
}

export function fmtDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function isoDaysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
