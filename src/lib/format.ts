import { LOCALE_META, type AppLocale } from "@/i18n/locales";

/**
 * Centralized locale-aware formatting. Everything here uses the platform
 * `Intl` APIs (never hand-rolled date math) so da-DK gets correct Danish
 * conventions (DD.MM.YYYY-style ordering, "kr." currency, 24-hour clock)
 * for free, and so RTL-ready layout mechanics stay separate from number
 * shaping.
 */
export function formatDate(date: Date | string, locale: AppLocale, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: LOCALE_META[locale].timeZone,
    ...opts,
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: AppLocale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LOCALE_META[locale].timeZone,
  }).format(d);
}

export function formatNumber(value: number, locale: AppLocale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(value);
}

export function formatCurrency(value: number, locale: AppLocale, currency?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency ?? LOCALE_META[locale].currency,
  }).format(value);
}

export function formatPercent(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
];

/**
 * Produces "3 days ago" / "3 dage siden" from a single Intl call — no
 * hand-written pluralization strings, so it is correct in every supported
 * locale automatically, including ones added later.
 */
export function formatRelativeTime(date: Date | string, locale: AppLocale, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === "minute") {
      const value = Math.round(diffMs / ms);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(0, "minute");
}
