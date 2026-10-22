// Locale-aware formatting — ported from the repo's `src/lib/format.ts`
// (Part 02/11). We keep the same Intl-first discipline: never hand-build a
// number/date/currency string. Narrowed to `en-US` for this sandbox build
// (the real repo also supports `da-DK`); the seam is the same `Locale`
// parameter so wiring in more locales later is additive, not a rewrite.
export type Locale = "en-US";

export function formatDate(date: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-US", opts ?? { year: "numeric", month: "long", day: "numeric" }).format(d);
}

export function formatShortDate(date: Date | string | number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    date instanceof Date ? date : new Date(date),
  );
}

export function formatCurrency(value: number, opts?: { compact?: boolean }): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: opts?.compact ? "compact" : "standard",
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: fractionDigits }).format(value / 100);
}

export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", opts).format(value);
}

export function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
];

export function formatRelativeTime(date: Date | string | number, now: Date = new Date()): string {
  const target = date instanceof Date ? date : new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === "minute") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(0, "minute");
}
