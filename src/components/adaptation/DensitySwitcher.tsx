"use client";

// src/components/adaptation/DensitySwitcher.tsx
//
// User-controlled density presets with an adaptive default ("Auto"). Picking
// a preset is a one-click, fully reversible override — "Auto" hands control
// back to the expertise model.

import { useAdaptation } from "@/components/adaptation/AdaptationProvider";
import { DENSITY_MODES, DENSITY_TOKENS, type DensityMode } from "@/lib/design/tokens";

export function DensitySwitcher() {
  const { profile, setDensityOverride } = useAdaptation();
  const current = profile?.profile.densityModeOverride ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="density-switcher">
      <span className="text-xs font-semibold text-slate-500">Density:</span>
      <button
        type="button"
        onClick={() => setDensityOverride(null)}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          current === null ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        Auto (adaptive)
      </button>
      {DENSITY_MODES.map((mode: DensityMode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setDensityOverride(mode)}
          title={DENSITY_TOKENS[mode].description}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            current === mode ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {DENSITY_TOKENS[mode].label}
        </button>
      ))}
    </div>
  );
}
