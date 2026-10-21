"use client";

import { useLocale, useTranslations } from "next-intl";
import { SUPPORTED_LOCALES, LOCALE_META, type AppLocale } from "@/i18n/locales";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");

  async function changeLocale(next: AppLocale) {
    await fetch("/api/settings/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    window.location.reload();
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t("search")}</span>
      <select
        aria-label="Language / Sprog"
        value={locale}
        onChange={(e) => changeLocale(e.target.value as AppLocale)}
        className="touch-target rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].label}
          </option>
        ))}
      </select>
    </label>
  );
}
