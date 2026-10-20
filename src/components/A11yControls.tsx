"use client";

import { useA11y } from "@/components/providers/A11yProvider";
import { useT } from "@/components/providers/LocaleProvider";

export function A11yControls() {
  const { highContrast, textScale, plainLanguage, setHighContrast, setTextScale, setPlainLanguage } = useA11y();
  const t = useT();

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t("a11y.title")}</legend>

      <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-300">
        {t("a11y.highContrast")}
        <input
          type="checkbox"
          checked={highContrast}
          onChange={(e) => setHighContrast(e.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
        <span className="flex items-center justify-between">
          <span>{t("a11y.textSize")}</span>
          <span aria-hidden="true">{textScale}%</span>
        </span>
        <input
          type="range"
          min={100}
          max={200}
          step={25}
          value={textScale}
          onChange={(e) => setTextScale(Number(e.target.value))}
          aria-label={t("a11y.textSize")}
          className="h-[44px] w-full accent-indigo-600"
        />
      </label>

      <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-300">
        {t("a11y.plainLanguage")}
        <input
          type="checkbox"
          checked={plainLanguage}
          onChange={(e) => setPlainLanguage(e.target.checked)}
          className="h-5 w-5"
        />
      </label>
    </fieldset>
  );
}
