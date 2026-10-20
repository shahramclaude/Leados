// src/lib/i18n.ts — the i18n runtime core.
//
// Why not next-intl: next-intl is a great fit for a *greenfield* app built
// around its `[locale]` segment convention, but retrofitting it onto this
// slice would force every existing and future route under
// `src/app/[locale]/**`, a disproportionate, high-risk restructuring for a
// part that lands independently of the other 13 parts of this build (see
// AI-SESSION-LOG.md Part 0 for why structural churn is treated as a cost
// here). This slice instead keeps locale as a cookie-negotiated value (like
// `settings.orgTimezone` already is for time — see `src/lib/time.ts`),
// implements a small ICU-lite interpolator (`{name}` placeholders, no runtime
// dependency), and — critically — reuses the exact same catalog mechanism
// for UI strings AND for engine-generated narratives
// (`src/lib/domain/narratives.ts`), which next-intl has no first-class
// concept of (it is UI-component oriented, not "server-side text generator"
// oriented). Formatting (dates/numbers/currency) goes straight through
// native `Intl`, so there is zero extra runtime dependency for the common
// case. If a future part needs nested ICU plurals/selects beyond what this
// file does, upgrading to next-intl's message format (or `intl-messageformat`
// directly) is a contained, additive change — nothing here needs to be
// un-done to adopt it.

import enUS from "@/i18n/catalogs/en-US.json";
import daDK from "@/i18n/catalogs/da-DK.json";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

export type Catalog = Record<string, string>;

const CATALOGS: Record<string, Catalog> = {
  "en-US": enUS,
  "da-DK": daDK,
};

export const LOCALE_COOKIE = "leados_locale";

export function normalizeLocale(code: string | null | undefined): string {
  return isSupportedLocale(code) ? (code as string) : DEFAULT_LOCALE;
}

export function getCatalog(locale: string): Catalog {
  return CATALOGS[normalizeLocale(locale)];
}

/** `{name}` / `{count}` style interpolation — intentionally not full ICU MessageFormat. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function createTranslator(locale: string) {
  const catalog = getCatalog(locale);
  return function t(key: string, params?: Record<string, string | number>): string {
    const template = catalog[key];
    if (!template) {
      // Fail loudly in development instead of silently leaking the key,
      // but never crash a render in production.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
      }
      return key;
    }
    return interpolate(template, params);
  };
}

/** Parse the `Accept-Language` header into our supported-locale space. */
export function negotiateLocale(acceptLanguage: string | null | undefined): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim());
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) return candidate;
    const base = candidate.split("-")[0];
    const match = Object.keys(CATALOGS).find((code) => code.startsWith(base));
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
