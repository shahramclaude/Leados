// src/i18n/locales.ts — supported locale registry. Adding a locale means
// adding one entry here + one catalog file pair; `npm run i18n:check`
// enforces that every catalog stays complete relative to this list.

export interface LocaleMeta {
  code: string;
  labelKey: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
  currency: string;
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { code: "en-US", labelKey: "locale.en-US", nativeLabel: "English (US)", dir: "ltr", currency: "USD" },
  { code: "da-DK", labelKey: "locale.da-DK", nativeLabel: "Dansk", dir: "ltr", currency: "DKK" },
];

export const DEFAULT_LOCALE = "en-US";

export function isSupportedLocale(code: string | null | undefined): boolean {
  return !!code && SUPPORTED_LOCALES.some((l) => l.code === code);
}

export function localeMeta(code: string): LocaleMeta {
  return SUPPORTED_LOCALES.find((l) => l.code === code) ?? SUPPORTED_LOCALES[0];
}

/**
 * RTL-ready: layout direction is derived from this table, not hard-coded
 * `dir="ltr"` in the markup. No RTL locale ships yet (en-US/da-DK are both
 * LTR), but `<html dir={...}>` in layout.tsx and all flex/grid directional
 * utilities read from here so adding e.g. `ar-SA` later needs zero layout
 * rewrites — only a catalog + this one entry.
 */
export function dirFor(code: string): "ltr" | "rtl" {
  return localeMeta(code).dir;
}
