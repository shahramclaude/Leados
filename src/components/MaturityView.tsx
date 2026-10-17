import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { computeMaturityProfile } from "../lib/maturity";
import { PRESETS } from "../lib/presets";
import { RadarChart } from "./RadarChart";
import { DimensionCard } from "./DimensionCard";
import { cn } from "../utils/cn";

const PATTERN_COLORS: Record<string, string> = {
  ADVANCED_LEADER: "from-emerald-500 to-teal-600",
  BALANCED_PRACTITIONER: "from-sky-500 to-blue-600",
  SPECIALIST: "from-amber-500 to-orange-600",
  EMERGING_PRACTITIONER: "from-indigo-500 to-violet-600",
  BEGINNING: "from-slate-600 to-slate-700",
};

export function MaturityView({
  state,
  onApplyPreset,
  onReset,
  onRenameOrg,
}: {
  state: AppState;
  onApplyPreset: (id: string) => void;
  onReset: () => void;
  onRenameOrg: (name: string) => void;
}) {
  const profile = useMemo(() => computeMaturityProfile(state.events), [state.events]);
  const dims = Object.values(profile.dimensions);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <input
            value={state.orgName}
            onChange={(e) => onRenameOrg(e.target.value)}
            className="w-80 max-w-full border-b border-transparent bg-transparent text-2xl font-bold text-white outline-none transition-colors focus:border-violet-500"
          />
          <p className="mt-1 text-sm text-slate-400">
            {state.events.length} events logged · computed from this organization's own event log only
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              title={p.description}
              onClick={() => onApplyPreset(p.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                state.presetApplied === p.id
                  ? "border-violet-500 bg-violet-600/20 text-violet-200"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-violet-600 hover:text-white"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={onReset}
            className="rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60"
          >
            Reset
          </button>
        </div>
      </div>

      <div className={cn("rounded-2xl bg-gradient-to-r p-5 shadow-lg", PATTERN_COLORS[profile.pattern.name])}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Maturity Pattern</p>
            <p className="text-xl font-bold text-white">{profile.pattern.name.replace(/_/g, " ")}</p>
          </div>
          <div className="flex gap-6 text-white">
            <div>
              <p className="text-xs text-white/70">Mean maturity</p>
              <p className="text-2xl font-bold">{profile.meanMaturity} / 5</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Variance</p>
              <p className="text-2xl font-bold">{profile.variance}</p>
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-white/90">{profile.pattern.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <RadarChart dimensions={dims} />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="mb-3 text-sm font-semibold text-white">Priority gaps (lowest scoring, capped at 3)</p>
            {profile.priorityGaps.length === 0 ? (
              <p className="text-sm text-slate-400">No dimension is below Level 3 — no urgent gaps flagged.</p>
            ) : (
              <ul className="space-y-2">
                {profile.priorityGaps.map((g) => (
                  <li
                    key={g.key}
                    className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-200">{g.name}</span>
                    <span className="font-mono text-amber-300">L{g.score} · gap {g.gap}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-white">All twelve dimensions</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dims.map((d) => (
            <DimensionCard key={d.key} d={d} />
          ))}
        </div>
      </div>

      <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-xs leading-relaxed text-slate-500">
        Labeled: every score above is a function of which event types exist in this organization's own log —
        nothing here is calibrated against external organizations, benchmarks, or validated organizational-science
        thresholds. This mirrors the "single-tenant meta-cognition" framing of the pasted brief this view is modeled
        on, which is itself treated as an unverified specification, not as a feature confirmed to exist in
        github.com/wbweve/Leados (see About / Provenance).
      </p>
    </div>
  );
}
