// src/lib/format.ts — locale-aware number/date/currency formatting. Every
// formatter takes `locale` explicitly (no implicit `undefined` -> host
// locale like older single-locale code did) so server and client always
// render the same string for the same input, and so Danish users see
// `1.234,56 kr.` while US users see `$1,234.56` for the same underlying
// value.

export function formatNumber(value: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatCurrency(value: number, locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${formatNumber(value, locale, 2)}`;
  }
}

export function formatPercent(value: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDate(
  date: Date | string | number,
  locale: string,
  timeZone: string = "UTC",
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(date));
}

export function formatDateTime(
  date: Date | string | number,
  locale: string,
  timeZone: string = "UTC",
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(date));
}

export function formatRelative(
  date: Date | string | number,
  locale: string,
  now: Date = new Date(),
): string {
  const diffMs = new Date(date).getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}
