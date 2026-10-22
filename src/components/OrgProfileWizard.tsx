"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useApp } from "@/components/providers/AppProviders";

type Props = {
  initialName: string;
  initialLocale: Locale;
  initialAccent: string;
  initialEmoji: string;
};

const EMOJI_CHOICES = ["🏛️", "🧭", "🚀", "🌱", "⚡", "🛡️"];
const ACCENT_CHOICES = ["#2563eb", "#0f766e", "#9333ea", "#dc2626", "#ca8a04", "#0b3d91"];

export function OrgProfileWizard({ initialName, initialLocale, initialAccent, initialEmoji }: Props) {
  const { locale } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [orgLocale, setOrgLocale] = useState<Locale>(initialLocale);
  const [accent, setAccent] = useState(initialAccent);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [peopleTerm, setPeopleTerm] = useState("");
  const [financeTerm, setFinanceTerm] = useState("");
  const [strategyTerm, setStrategyTerm] = useState("");
  const [addSample, setAddSample] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = 4;

  async function finish() {
    setSubmitting(true);
    const terminology: Record<string, string> = {};
    if (peopleTerm.trim()) terminology.people = peopleTerm.trim();
    if (financeTerm.trim()) terminology.finance = financeTerm.trim();
    if (strategyTerm.trim()) terminology.strategy = strategyTerm.trim();

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, locale: orgLocale, accentColor: accent, logoEmoji: emoji, terminology }),
    });

    await fetch(addSample ? "/api/onboarding/seed" : "/api/onboarding/complete", { method: "POST" });

    setSubmitting(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center gap-2" aria-label={`Step ${step} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-2 flex-1 rounded-full ${n <= step ? "bg-[color:var(--accent)]" : "bg-slate-200"}`}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="lx-surface rounded-2xl border border-slate-200 bg-white p-6">
        {step === 1 && (
          <fieldset>
            <legend className="text-lg font-semibold text-slate-900">{t(locale, "onboarding.step1.title")}</legend>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="org-name">
              {t(locale, "onboarding.step1.name")}
            </label>
            <input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="lx-tap-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="org-locale">
              {t(locale, "onboarding.step1.locale")}
            </label>
            <select
              id="org-locale"
              value={orgLocale}
              onChange={(e) => setOrgLocale(e.target.value as Locale)}
              className="lx-tap-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="text-lg font-semibold text-slate-900">{t(locale, "onboarding.step2.title")}</legend>
            <p className="mt-4 text-sm font-medium text-slate-700">{t(locale, "onboarding.step2.accentColor")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCENT_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  aria-pressed={accent === c}
                  aria-label={c}
                  className="lx-tap-target h-11 w-11 rounded-full border-4"
                  style={{ backgroundColor: c, borderColor: accent === c ? "#0f172a" : "transparent" }}
                />
              ))}
            </div>

            <p className="mt-5 text-sm font-medium text-slate-700">{t(locale, "onboarding.step2.logoEmoji")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-pressed={emoji === e}
                  className={`lx-tap-target rounded-lg border-2 px-3 py-2 text-xl ${
                    emoji === e ? "border-[color:var(--accent)]" : "border-slate-200"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset>
            <legend className="text-lg font-semibold text-slate-900">{t(locale, "onboarding.step3.title")}</legend>
            <p className="lx-muted mt-2 text-sm text-slate-600">{t(locale, "onboarding.step3.hint")}</p>

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="term-people">
              {t(locale, "onboarding.step3.peopleLabel")}
            </label>
            <input
              id="term-people"
              value={peopleTerm}
              onChange={(e) => setPeopleTerm(e.target.value)}
              placeholder={t(locale, "nav.people")}
              className="lx-tap-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="term-finance">
              {t(locale, "onboarding.step3.financeLabel")}
            </label>
            <input
              id="term-finance"
              value={financeTerm}
              onChange={(e) => setFinanceTerm(e.target.value)}
              placeholder={t(locale, "nav.finance")}
              className="lx-tap-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="term-strategy">
              {t(locale, "onboarding.step3.strategyLabel")}
            </label>
            <input
              id="term-strategy"
              value={strategyTerm}
              onChange={(e) => setStrategyTerm(e.target.value)}
              placeholder={t(locale, "nav.strategy")}
              className="lx-tap-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </fieldset>
        )}

        {step === 4 && (
          <fieldset>
            <legend className="text-lg font-semibold text-slate-900">{t(locale, "onboarding.step4.title")}</legend>
            <p className="lx-muted mt-2 text-sm text-slate-600">{t(locale, "onboarding.step4.hint")}</p>
            <label className="mt-4 flex items-center gap-3">
              <input
                type="checkbox"
                checked={addSample}
                onChange={(e) => setAddSample(e.target.checked)}
                className="lx-tap-target h-5 w-5"
              />
              <span className="text-sm font-medium text-slate-800">{t(locale, "onboarding.step4.toggle")}</span>
            </label>
          </fieldset>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="lx-tap-target rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {t(locale, "common.back")}
          </button>

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              className="lx-tap-target rounded-lg bg-[color:var(--accent)] px-5 py-2 text-sm font-semibold text-white"
            >
              {t(locale, "common.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={submitting}
              className="lx-tap-target rounded-lg bg-[color:var(--accent)] px-5 py-2 text-sm font-semibold text-white"
            >
              {submitting ? t(locale, "common.loading") : t(locale, "onboarding.complete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
