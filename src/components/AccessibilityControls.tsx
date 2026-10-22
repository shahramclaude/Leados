"use client";

import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { TEXT_SCALE_STEPS, type TextScale } from "@/lib/a11y";

export function AccessibilityControls() {
  const { locale, highContrast, setHighContrast, textScale, setTextScale, plainLanguage, setPlainLanguage } = useApp();

  return (
    <div className="lx-surface space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{t(locale, "settings.accessibility")}</h2>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">{t(locale, "a11y.highContrast")}</p>
        </div>
        <Toggle checked={highContrast} onChange={setHighContrast} label={t(locale, "a11y.highContrast")} />
      </div>

      <div>
        <p className="font-medium text-slate-900">{t(locale, "a11y.textScale")}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t(locale, "a11y.textScale")}>
          {TEXT_SCALE_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => setTextScale(step as TextScale)}
              aria-pressed={textScale === step}
              className={`lx-tap-target rounded-lg border px-4 py-2 text-sm font-semibold ${
                textScale === step
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {step}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">{t(locale, "a11y.plainLanguage")}</p>
          <p className="lx-muted text-sm text-slate-500">{t(locale, "a11y.plainLanguageHint")}</p>
        </div>
        <Toggle checked={plainLanguage} onChange={setPlainLanguage} label={t(locale, "a11y.plainLanguage")} />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`lx-tap-target relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
        checked ? "bg-[color:var(--accent)]" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}
