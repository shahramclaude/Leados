"use client";

import { useEffect, useState } from "react";

interface Legacy {
  id: string;
  label: string;
  formerLocation: string;
  formulaSummary: string;
  gamingNotes: string;
  actionabilityNotes: string;
  mappedDimensionId: string | null;
  deprecated: boolean;
  deprecatedNote: string;
}

export default function LegacyAuditPage() {
  const [legacy, setLegacy] = useState<Legacy[]>([]);

  useEffect(() => {
    fetch("/api/fitness/legacy")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setLegacy(d.legacy);
      });
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Phase 0 audit — legacy health/score concepts</h2>
        <p className="text-sm text-slate-500">
          Every pre-existing &quot;health score&quot; concept found across the product (brain, decision, metric, rule health) is
          catalogued here with what it measured, how it could be gamed, whether anyone could act on it, and how it has
          been consolidated into — or retired in favor of — the Part 39 Fitness model.
        </p>
      </section>

      <div className="space-y-4">
        {legacy.map((l) => (
          <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{l.label}</h3>
              {l.deprecated && (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">DEPRECATED</span>
              )}
            </div>
            <p className="text-xs text-slate-400">Formerly: {l.formerLocation}</p>

            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-700">What it measured</dt>
                <dd className="text-slate-600">{l.formulaSummary}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">How it could be gamed</dt>
                <dd className="text-slate-600">{l.gamingNotes}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">Was it actionable?</dt>
                <dd className="text-slate-600">{l.actionabilityNotes}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">Disposition</dt>
                <dd className="text-slate-600">
                  {l.mappedDimensionId ? (
                    <>
                      Mapped into <span className="font-mono">{l.mappedDimensionId}</span> dimension.
                    </>
                  ) : (
                    "Retired outright — no direct successor dimension."
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{l.deprecatedNote}</p>
          </div>
        ))}
        {legacy.length === 0 && <p className="text-sm text-slate-400">Loading / seed demo data from the Dashboard.</p>}
      </div>
    </div>
  );
}
