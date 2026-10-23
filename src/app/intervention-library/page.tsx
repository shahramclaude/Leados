"use client";

import { useEffect, useState } from "react";

interface LibraryEntry {
  intervention: {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    cost: { unit: string; amount: number };
    reversibility: string;
    effort: string;
    evidenceClass: string;
  };
  measuredContexts: Array<{
    contextKey: string;
    effect: { value: number; interval: [number, number]; evidenceClass: string; sampleSize: number };
    sourceType: string;
  }>;
  bestEvidenceClass: string;
  totalMeasuredSamples: number;
}

const EVIDENCE_COLORS: Record<string, string> = {
  anecdotal: "bg-slate-200 text-slate-700",
  correlational: "bg-amber-100 text-amber-800",
  experimental: "bg-sky-100 text-sky-800",
  causal_replicated: "bg-emerald-100 text-emerald-800",
};

export default function InterventionLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/recommender/library")
      .then((r) => r.json())
      .then((json) => setEntries(json.entries));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm text-slate-600">
        <a href="/" className="hover:underline">
          Home
        </a>
        <a href="/action-desk" className="hover:underline">
          Action Desk
        </a>
        <a href="/intervention-library" className="font-semibold text-slate-950">
          Intervention Library
        </a>
        <a href="/impact-history" className="hover:underline">
          Impact History
        </a>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">Intervention Library</h1>
      <p className="mt-1 text-sm text-slate-600">
        Every play in the marketplace, with measured-outcome badges and sample sizes per context it has been tried
        in. No measurements yet = labelled honestly as prior-only.
      </p>

      {!entries && <p className="mt-6 text-slate-500">Loading…</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {entries?.map((e) => (
          <div key={e.intervention.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                {e.intervention.category}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${EVIDENCE_COLORS[e.bestEvidenceClass]}`}>
                best evidence: {e.bestEvidenceClass}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-950">{e.intervention.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{e.intervention.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              Cost: {e.intervention.cost.amount} {e.intervention.cost.unit.replace("_", " ")} · Reversibility:{" "}
              {e.intervention.reversibility} · Effort: {e.intervention.effort}
            </p>

            <div className="mt-3 border-t border-slate-100 pt-3">
              {e.measuredContexts.length === 0 ? (
                <p className="text-xs italic text-slate-400">No measured outcomes yet — prior evidence only.</p>
              ) : (
                <ul className="space-y-1.5">
                  {e.measuredContexts.map((m) => (
                    <li key={m.contextKey} className="text-xs text-slate-600">
                      <span className="font-mono text-[11px] text-slate-500">{m.contextKey}</span>
                      <br />
                      ~{Math.round(m.effect.value * 100)}% ({Math.round(m.effect.interval[0] * 100)}–
                      {Math.round(m.effect.interval[1] * 100)}%), n={m.effect.sampleSize}, {m.effect.evidenceClass}{" "}
                      ({m.sourceType})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
