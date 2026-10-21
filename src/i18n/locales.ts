/**
 * Locale registry (Section A). da-DK is a first-class citizen, not an
 * afterthought: both locales must have 100% key parity, enforced by
 * `npm run i18n:check`.
 *
 * `dir` is included (not currently "rtl" for either locale) so the layout
 * mechanics (see `src/app/layout.tsx` and `globals.css` logical properties)
 * are exercised through a real `dir` attribute today, which is what makes
 * them trustworthy if/when an RTL locale (e.g. Arabic for a Nordic employer
 * with international offices) is added later without a rewrite.
 */
export const SUPPORTED_LOCALES = ["en-US", "da-DK"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-US";

export const LOCALE_COOKIE = "LEADOS_LOCALE";

export const LOCALE_META: Record<AppLocale, { label: string; dir: "ltr" | "rtl"; timeZone: string; currency: string }> = {
  "en-US": { label: "English (US)", dir: "ltr", timeZone: "America/New_York", currency: "USD" },
  "da-DK": { label: "Dansk", dir: "ltr", timeZone: "Europe/Copenhagen", currency: "DKK" },
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
