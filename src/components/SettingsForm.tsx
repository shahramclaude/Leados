"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useApp } from "@/components/providers/AppProviders";

type Props = {
  name: string;
  orgLocale: Locale;
  accentColor: string;
  terminology: Record<string, string>;
};

export function SettingsForm({ name, orgLocale, accentColor, terminology }: Props) {
  const { locale } = useApp();
  const router = useRouter();
  const [form, setForm] = useState({
    name,
    locale: orgLocale,
    accentColor,
    people: terminology.people ?? "",
    finance: terminology.finance ?? "",
    strategy: terminology.strategy ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        locale: form.locale,
        accentColor: form.accentColor,
        terminology: { people: form.people, finance: form.finance, strategy: form.strategy },
      }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="lx-surface space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{t(locale, "settings.locale")}</h2>

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-name">
        {t(locale, "onboarding.step1.name")}
      </label>
      <input
        id="settings-name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        className="lx-tap-target w-full rounded-lg border border-slate-300 px-3 py-2"
      />

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-locale">
        {t(locale, "onboarding.step1.locale")}
      </label>
      <select
        id="settings-locale"
        value={form.locale}
        onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value as Locale }))}
        className="lx-tap-target w-full rounded-lg border border-slate-300 px-3 py-2"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium text-slate-700" htmlFor="settings-accent">
        {t(locale, "settings.accentColor")}
      </label>
      <input
        id="settings-accent"
        type="color"
        value={form.accentColor}
        onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
        className="lx-tap-target h-11 w-20 rounded-lg border border-slate-300"
      />

      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t(locale, "settings.terminology")}</h3>
        <p className="lx-muted text-sm text-slate-500">{t(locale, "settings.terminologyHint")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <input
            aria-label={t(locale, "onboarding.step3.peopleLabel")}
            value={form.people}
            onChange={(e) => setForm((f) => ({ ...f, people: e.target.value }))}
            placeholder={t(locale, "nav.people")}
            className="lx-tap-target rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            aria-label={t(locale, "onboarding.step3.financeLabel")}
            value={form.finance}
            onChange={(e) => setForm((f) => ({ ...f, finance: e.target.value }))}
            placeholder={t(locale, "nav.finance")}
            className="lx-tap-target rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            aria-label={t(locale, "onboarding.step3.strategyLabel")}
            value={form.strategy}
            onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value }))}
            placeholder={t(locale, "nav.strategy")}
            className="lx-tap-target rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="lx-tap-target rounded-lg bg-[color:var(--accent)] px-5 py-2 text-sm font-semibold text-white"
      >
        {saving ? t(locale, "common.loading") : t(locale, "common.save")}
      </button>
      {saved && <p className="text-sm font-medium text-green-700">{t(locale, "settings.saved")}</p>}
    </div>
  );
}
