"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { useLocaleContext } from "@/components/providers/LocaleProvider";
import type { OrgProfile } from "@/lib/domain/types";

const STEPS = ["profile", "locale", "terminology", "admin", "review"] as const;
type Step = (typeof STEPS)[number];

const TERMINOLOGY_OPTIONS = ["default", "startup", "enterprise", "nonprofit"] as const;

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Copenhagen",
  "Europe/London",
  "Asia/Singapore",
];

/**
 * First-run / net-new-org wizard. Configures: domains (slug/org name),
 * roles (the admin account created at the end gets the `admin` role),
 * terminology glossary preset, locale/timezone, and the initial feature-flag
 * rule set (wired server-side in `src/lib/app/onboarding.ts`).
 */
export function OrgProfileWizard() {
  const { t, locale } = useLocaleContext();
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrgProfile>({
    slug: "",
    name: "",
    industry: "technology",
    defaultLocale: locale,
    timezone: "UTC",
    currency: "USD",
    accentColor: "#4f46e5",
    terminologyPreset: "default",
    sampleDataEnabled: true,
    adminName: "",
    adminEmail: "",
  });

  const step: Step = STEPS[stepIndex];

  function update<K extends keyof OrgProfile>(key: K, value: OrgProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create organization");
      setSuccess(true);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const stepLabel = (s: Step) => t(`onboarding.step.${s}`);

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("onboarding.title")}</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t("onboarding.subtitle")}</p>

      <ol className="mt-5 flex flex-wrap gap-2" aria-label={t("onboarding.title")}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === stepIndex
                ? "bg-indigo-600 text-white"
                : i < stepIndex
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {i + 1}. {stepLabel(s)}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col gap-4">
        {step === "profile" && (
          <>
            <Field label={t("onboarding.field.orgName")}>
              <input
                className="field"
                value={profile.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </Field>
            <Field label={t("onboarding.field.slug")}>
              <input
                className="field"
                value={profile.slug}
                onChange={(e) => update("slug", e.target.value)}
                placeholder="acme-inc"
              />
            </Field>
            <Field label={t("onboarding.field.industry")}>
              <select className="field" value={profile.industry} onChange={(e) => update("industry", e.target.value)}>
                <option value="technology">Technology</option>
                <option value="healthcare">Healthcare</option>
                <option value="finance">Finance</option>
                <option value="nonprofit">Nonprofit</option>
                <option value="manufacturing">Manufacturing</option>
              </select>
            </Field>
            <Field label={t("onboarding.field.accentColor")}>
              <input
                type="color"
                className="h-11 w-16 rounded border border-slate-300"
                value={profile.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === "locale" && (
          <>
            <Field label={t("onboarding.field.locale")}>
              <select
                className="field"
                value={profile.defaultLocale}
                onChange={(e) => update("defaultLocale", e.target.value)}
              >
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("onboarding.field.timezone")}>
              <select className="field" value={profile.timezone} onChange={(e) => update("timezone", e.target.value)}>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("onboarding.field.currency")}>
              <select className="field" value={profile.currency} onChange={(e) => update("currency", e.target.value)}>
                {["USD", "DKK", "EUR", "GBP"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === "terminology" && (
          <Field label={t("onboarding.field.terminologyPreset")}>
            <div className="flex flex-col gap-2">
              {TERMINOLOGY_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700"
                >
                  <input
                    type="radio"
                    name="terminologyPreset"
                    checked={profile.terminologyPreset === opt}
                    onChange={() => update("terminologyPreset", opt)}
                    className="h-5 w-5"
                  />
                  {t(`onboarding.terminology.${opt}`)}
                </label>
              ))}
            </div>
          </Field>
        )}

        {step === "admin" && (
          <>
            <Field label={t("onboarding.field.adminName")}>
              <input className="field" value={profile.adminName} onChange={(e) => update("adminName", e.target.value)} />
            </Field>
            <Field label={t("onboarding.field.adminEmail")}>
              <input
                type="email"
                className="field"
                value={profile.adminEmail}
                onChange={(e) => update("adminEmail", e.target.value)}
                required
              />
            </Field>
            <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <input
                type="checkbox"
                checked={profile.sampleDataEnabled}
                onChange={(e) => update("sampleDataEnabled", e.target.checked)}
                className="h-5 w-5"
              />
              <span>
                <span className="font-medium">{t("onboarding.field.sampleData")}</span>
                <br />
                <span className="text-xs text-slate-500">{t("onboarding.field.sampleData.hint")}</span>
              </span>
            </label>
          </>
        )}

        {step === "review" && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-slate-600 dark:text-slate-400">{t("onboarding.field.orgName")}</dt>
            <dd>{profile.name || "—"}</dd>
            <dt className="font-medium text-slate-600 dark:text-slate-400">{t("onboarding.field.locale")}</dt>
            <dd>{profile.defaultLocale}</dd>
            <dt className="font-medium text-slate-600 dark:text-slate-400">{t("onboarding.field.terminologyPreset")}</dt>
            <dd>{t(`onboarding.terminology.${profile.terminologyPreset}`)}</dd>
            <dt className="font-medium text-slate-600 dark:text-slate-400">{t("onboarding.field.adminEmail")}</dt>
            <dd>{profile.adminEmail || "—"}</dd>
          </dl>
        )}

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {success ? <p role="status" className="text-sm font-medium text-emerald-600">{t("onboarding.success")}</p> : null}

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
          >
            {t("onboarding.action.back")}
          </button>
          {step === "review" ? (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {t("onboarding.action.create")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              {t("onboarding.action.next")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
    </label>
  );
}
