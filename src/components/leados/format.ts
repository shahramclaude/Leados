export function formatUSD(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
}

export function formatMillions(n: number): string {
  return `$${n.toFixed(2)}M`;
}

export function formatPercent(n: number): string {
  return `${n.toFixed(0)}%`;
}

export function formatPeople(n: number): string {
  return n.toLocaleString();
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonth(iso: string): string {
  return new Date(`${iso}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
