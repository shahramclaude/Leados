"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type OnboardingProgress = { completed: number; total: number; isComplete: boolean };

/**
 * First-run guidance banner (Section E). Shows real progress (not a vague
 * "finish setup"), links straight to the wizard, and a session-scoped
 * dismiss (it returns next visit until setup is actually complete — no
 * permanent dead end).
 */
export default function OnboardingBanner({ orgName }: { orgName: string }) {
  const t = useTranslations("onboarding");
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem("leados.onboarding.dismissed") === "1");
    fetch("/api/onboarding/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setProgress(data.progress))
      .catch(() => undefined);
  }, []);

  if (!progress || progress.isComplete || dismissed) return null;

  return (
    <div className="mx-4 mt-4 flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{t("bannerTitle", { orgName })}</p>
        <p className="text-sm">{t("bannerBody", { completed: progress.completed, total: progress.total })}</p>
      </div>
      <div className="flex gap-2">
        <Link
          href="/onboarding"
          className="touch-target inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t("bannerCta")}
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem("leados.onboarding.dismissed", "1");
            setDismissed(true);
          }}
          className="touch-target inline-flex items-center justify-center rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-900"
        >
          {t("bannerDismiss")}
        </button>
      </div>
    </div>
  );
}
