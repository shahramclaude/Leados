import enUS from "./messages/en-US.json";
import daDK from "./messages/da-DK.json";

export const SUPPORTED_LOCALES = ["en-US", "da-DK"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-US";

export const LOCALE_LABELS: Record<Locale, string> = {
  "en-US": "English (US)",
  "da-DK": "Dansk (Danmark)",
};

// All catalogs are RTL-ready even though neither shipped locale is RTL today:
// every surface that renders text reads `dir` from `localeDirection()` instead
// of hard-coding "ltr", so adding e.g. ar-SA later only means adding a catalog.
const RTL_LOCALES = new Set<string>([]);

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

type Catalog = Record<string, string>;

const CATALOGS: Record<Locale, Catalog> = {
  "en-US": enUS as Catalog,
  "da-DK": daDK as Catalog,
};

export function getCatalog(locale: Locale): Catalog {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}

export type MessageParams = Record<string, string | number>;

/**
 * Minimal ICU-subset formatter: supports {var} interpolation and
 * {var, plural, one {...} other {...}} blocks with `#` substitution.
 * This is intentionally small (no external dependency) but is exercised by
 * `scripts/i18n-check.ts`, which fails the build if a catalog uses a plural
 * form or placeholder that the formatter / sibling locale doesn't support.
 */
export function formatMessage(template: string, params: MessageParams = {}): string {
  let out = template.replace(
    /\{(\w+),\s*plural,\s*((?:\w+\s*\{[^{}]*\}\s*)+)\}/g,
    (_match, varName: string, branches: string) => {
      const count = Number(params[varName] ?? 0);
      const branchMap: Record<string, string> = {};
      const branchRe = /(\w+)\s*\{([^{}]*)\}/g;
      let branchMatch: RegExpExecArray | null;
      while ((branchMatch = branchRe.exec(branches))) {
        branchMap[branchMatch[1]] = branchMatch[2];
      }
      const form = count === 1 ? "one" : "other";
      const chosen = branchMap[form] ?? branchMap.other ?? "";
      return chosen.replace(/#/g, String(count));
    },
  );

  out = out.replace(/\{(\w+)\}/g, (_match, varName: string) => {
    const value = params[varName];
    return value === undefined ? `{${varName}}` : String(value);
  });

  return out;
}

export function t(locale: Locale, key: string, params?: MessageParams): string {
  const catalog = getCatalog(locale);
  const template = catalog[key];
  if (!template) {
    // Fail loudly in dev-like usage but never crash a render in production.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    }
    return key;
  }
  return formatMessage(template, params);
}

export function createTranslator(locale: Locale) {
  return (key: string, params?: MessageParams) => t(locale, key, params);
}
