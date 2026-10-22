import type { Locale } from "@/lib/i18n";

// Locale-aware formatting. Never hand-build date/number strings — always go
// through Intl so en-US (M/D/YYYY, Sunday-start week, $) and da-DK
// (DD.MM.YYYY, Monday-start week, kr.) render correctly automatically.

const CURRENCY_BY_LOCALE: Record<Locale, string> = {
  "en-US": "USD",
  "da-DK": "DKK",
};

export function currencyForLocale(locale: Locale): string {
  return CURRENCY_BY_LOCALE[locale] ?? "USD";
}

export function formatDate(locale: Locale, date: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, opts ?? { year: "numeric", month: "long", day: "numeric" }).format(d);
}

export function formatShortDate(locale: Locale, date: Date | string | number): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date instanceof Date ? date : new Date(date),
  );
}

export function formatNumber(locale: Locale, value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(value);
}

export function formatCurrency(locale: Locale, value: number, currency?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency ?? currencyForLocale(locale),
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
];

export function formatRelativeTime(locale: Locale, date: Date | string | number, now: Date = new Date()): string {
  const target = date instanceof Date ? date : new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === "minute") {
      const value = Math.round(diffMs / ms);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(0, "minute");
}
