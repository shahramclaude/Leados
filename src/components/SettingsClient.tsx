"use client";

import { useState } from "react";
import type { Organization } from "@/db/schema";
import type { FeatureFlagKey, Role } from "@/lib/domain/types";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/domain/types";
import { can } from "@/lib/domain/rbac";
import { useT } from "@/components/providers/LocaleProvider";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { A11yControls } from "@/components/A11yControls";

export function SettingsClient({
  role,
  org,
  flags,
}: {
  role: Role;
  org: Organization;
  flags: Record<FeatureFlagKey, boolean>;
}) {
  const t = useT();
  const canEdit = can(role, "settings:edit");
  const canEditFlags = can(role, "featureFlags:edit");

  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(org.accentColor);
  const [terminology, setTerminology] = useState<Record<string, string>>(org.terminology);
  const [defaultLocale, setDefaultLocale] = useState(org.defaultLocale);
  const [flagState, setFlagState] = useState(flags);
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl, accentColor, terminology, defaultLocale, flags: flagState }),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("settings.title")}</h1>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t("settings.branding.title")}</legend>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("settings.branding.logoUrl")}
          <input className="field" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("settings.branding.accentColor")}
          <input type="color" className="h-11 w-16 rounded border border-slate-300" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t("settings.terminology.title")}</legend>
        <p className="text-xs text-slate-500">{t("settings.terminology.hint")}</p>
        {Object.entries(terminology).map(([key, value]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-slate-500">{key}</span>
            <input
              className="field flex-1"
              value={value}
              onChange={(e) => setTerminology((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
      </fieldset>

      <fieldset disabled={!canEditFlags} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t("settings.flags.title")}</legend>
        {(Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[]).map((key) => (
          <label key={key} className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
            {t(`settings.flags.${key}`)}
            <input
              type="checkbox"
              checked={flagState[key]}
              onChange={(e) => setFlagState((prev) => ({ ...prev, [key]: e.target.checked }))}
              className="h-5 w-5"
            />
          </label>
        ))}
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t("settings.locale.title")}</legend>
        <select className="field" value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)}>
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel}
            </option>
          ))}
        </select>
      </fieldset>

      <A11yControls />

      {canEdit || canEditFlags ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            {t("settings.save")}
          </button>
          {saved ? <span className="text-sm text-emerald-700">{t("settings.saved")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
