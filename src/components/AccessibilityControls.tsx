"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_A11Y_PREFS, type A11yPrefs } from "@/lib/a11yPrefs";

function applyToDocument(prefs: A11yPrefs) {
  document.documentElement.dataset.theme = prefs.highContrast ? "high-contrast" : "default";
  document.documentElement.style.setProperty("--text-scale", String(prefs.textScale));
}

/**
 * High-contrast theme, text scaling to 200%, and plain-language mode
 * (Section F) — all three are user-controlled toggles persisted in a
 * cookie so SSR renders them correctly on the next request, and applied
 * immediately client-side so there's no flash/reload needed.
 */
export default function AccessibilityControls({ initial }: { initial: A11yPrefs }) {
  const t = useTranslations("accessibility");
  const [prefs, setPrefs] = useState<A11yPrefs>(initial ?? DEFAULT_A11Y_PREFS);

  useEffect(() => {
    applyToDocument(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(patch: Partial<A11yPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyToDocument(next);
    await fetch("/api/settings/a11y", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">{t("settingsTitle")}</h2>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="a11y-contrast" className="text-sm">
          {t("highContrast")}
        </label>
        <input
          id="a11y-contrast"
          type="checkbox"
          className="h-6 w-11 touch-target"
          checked={prefs.highContrast}
          onChange={(e) => update({ highContrast: e.target.checked })}
        />
      </div>

      <div>
        <label htmlFor="a11y-textscale" className="text-sm">
          {t("textScale")}: {Math.round(prefs.textScale * 100)}%
        </label>
        <input
          id="a11y-textscale"
          type="range"
          min={1}
          max={2}
          step={0.1}
          value={prefs.textScale}
          onChange={(e) => update({ textScale: Number(e.target.value) })}
          className="touch-target w-full"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="a11y-plain" className="text-sm">
          {t("plainLanguage")}
        </label>
        <input
          id="a11y-plain"
          type="checkbox"
          className="h-6 w-11 touch-target"
          checked={prefs.plainLanguage}
          onChange={(e) => update({ plainLanguage: e.target.checked })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="a11y-motion" className="text-sm">
          {t("reduceMotion")}
        </label>
        <input
          id="a11y-motion"
          type="checkbox"
          className="h-6 w-11 touch-target"
          checked={prefs.reduceMotion}
          onChange={(e) => update({ reduceMotion: e.target.checked })}
        />
      </div>
    </div>
  );
}
