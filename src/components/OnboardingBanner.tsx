"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";

export function OnboardingBanner({ seededCount }: { seededCount: number }) {
  const { locale } = useApp();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  if (seededCount === 0) return null;

  async function removeSample() {
    if (!window.confirm(t(locale, "onboarding.removeSampleConfirm"))) return;
    setRemoving(true);
    await fetch("/api/onboarding/remove-sample", { method: "POST" });
    setRemoving(false);
    router.refresh();
  }

  return (
    <div className="lx-surface mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4">
      <div>
        <p className="font-semibold text-indigo-900">{t(locale, "onboarding.bannerTitle")}</p>
        <p className="lx-muted text-sm text-indigo-800">{t(locale, "onboarding.bannerBody", { count: seededCount })}</p>
      </div>
      <button
        type="button"
        onClick={removeSample}
        disabled={removing}
        className="lx-tap-target rounded-lg border-2 border-indigo-700 bg-white px-4 py-2 text-sm font-semibold text-indigo-900"
      >
        {removing ? t(locale, "common.loading") : t(locale, "onboarding.removeSample")}
      </button>
    </div>
  );
}
