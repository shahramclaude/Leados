"use client";

// src/components/adaptation/TransparencyPanel.tsx
//
// "This view is adapted because…" — Phase 2 requirement. Shows every
// adaptation class, whether it was applied, its rationale + counterfactual,
// and gives one-click reset-to-default and pause-adaptation controls.

import { useCallback, useEffect, useState } from "react";
import type { Domain } from "@/lib/familiarity";
import { useAdaptation } from "@/components/adaptation/AdaptationProvider";

interface CoverageEntry {
  class: "presentation" | "emphasis" | "sequence";
  applied: boolean;
  blocked: boolean;
  examples: Array<{
    id: string;
    description: string;
    rationale: string | null;
    counterfactual: string | null;
    blocked: boolean;
    blockReason: string | null;
  }>;
  explanation: string;
}

interface TransparencyResponse {
  ok: boolean;
  paused: boolean;
  densityOverride: string | null;
  coverage: CoverageEntry[];
  registry: Array<{ id: string; title: string; description: string; status: string; verifiedBy: string }>;
  bannedPatterns: Array<{ id: string; title: string; description: string }>;
}

const CLASS_LABEL: Record<CoverageEntry["class"], string> = {
  presentation: "Presentation (density & layout)",
  emphasis: "Emphasis (highlighting)",
  sequence: "Sequence (ordering)",
};

export function TransparencyPanel({ domain }: { domain: Domain }) {
  const { userId, ready, setPaused, resetToDefault, profile, refreshProfile } = useAdaptation();
  const [data, setData] = useState<TransparencyResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    const res = await fetch(`/api/adaptation/transparency?userId=${encodeURIComponent(userId)}&domain=${domain}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [ready, userId, domain]);

  useEffect(() => {
    void load();
  }, [load, profile?.profile.adaptationPaused, profile?.profile.densityModeOverride, profile?.eventCount]);

  if (!data) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading adaptation explanation…</div>;
  }

  const paused = data.paused;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4" data-testid="transparency-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-indigo-900">
          {paused ? "Adaptation is paused — showing the default view" : "This view is adapted because…"}
        </span>
        <span className="text-xs text-indigo-700">{open ? "Hide details ▲" : "Show details ▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {data.coverage.map((entry) => (
            <div key={entry.class} className="rounded-lg border border-indigo-100 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{CLASS_LABEL[entry.class]}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    entry.applied ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {entry.applied ? "Applied" : "Not applied in this view"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{entry.explanation}</p>
              {entry.examples.map((ex) => (
                <div key={ex.id} className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                  <p>{ex.description}</p>
                  {ex.rationale && <p className="mt-1 text-slate-500">Why: {ex.rationale}</p>}
                  {ex.counterfactual && <p className="text-slate-500">Default would show: {ex.counterfactual}</p>}
                  {ex.blocked && <p className="mt-1 font-semibold text-rose-600">Blocked by manipulation guard: {ex.blockReason}</p>}
                </div>
              ))}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                await resetToDefault();
                await load();
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Reset to default
            </button>
            <button
              type="button"
              onClick={async () => {
                await setPaused(!paused);
                await load();
              }}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              {paused ? "Resume adaptation" : "Pause adaptation"}
            </button>
            <button
              type="button"
              onClick={() => setShowRegistry((v) => !v)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {showRegistry ? "Hide assurance registry" : "Show assurance registry"}
            </button>
          </div>

          {showRegistry && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700">Controls that keep this honest</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {data.registry.map((control) => (
                  <li key={control.id}>
                    <span className="font-semibold">{control.title}</span>: {control.description}{" "}
                    <span className="text-slate-400">({control.verifiedBy})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs font-semibold text-slate-700">Banned adaptations (each has a detector)</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {data.bannedPatterns.map((pattern) => (
                  <li key={pattern.id}>
                    <span className="font-semibold">{pattern.title}</span>: {pattern.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
