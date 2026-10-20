"use client";

import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { useLocaleContext } from "@/components/providers/LocaleProvider";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocaleContext();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="sr-only">{t("locale.switcher.label")}</span>
      <select
        value={locale}
        onChange={(e) => void setLocale(e.target.value)}
        className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        aria-label={t("locale.switcher.label")}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
