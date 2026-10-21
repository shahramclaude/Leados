/**
 * Formatting helpers. Every function here returns digits meant for a
 * `.tabular-nums` / `[data-metric]` surface — see docs/DESIGN-SYSTEM.md §2.2.
 */

const numberFormatter = new Intl.NumberFormat("en-US");
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatCurrency(value: number, currency = "USD", fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value * 100)}%`;
}

/** Signed delta, e.g. "+4.2%" / "−1.8%" (real minus sign, not hyphen). */
export function formatDelta(value: number, opts: { percent?: boolean; fractionDigits?: number } = {}): string {
  const { percent = true, fractionDigits = 1 } = opts;
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "\u00B1";
  const magnitude = percent ? formatPercent(Math.abs(value), fractionDigits) : formatNumber(Math.abs(value), fractionDigits);
  return `${sign}${magnitude}`;
}

export function formatDate(value: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", ...opts }).format(date);
}

export function formatDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(value: Date | string | number, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = diffSec;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return rtf.format(Math.round(duration), "year");
}

export { numberFormatter };
