"use client";

import { useCallback, useEffect, useState } from "react";
import type { FitnessResult } from "@/lib/fitness/types";

interface Snapshot {
  periodEnd: string;
  fitness: string;
}

const EVIDENCE_COLORS: Record<string, string> = {
  measured: "bg-emerald-100 text-emerald-800",
  derived: "bg-blue-100 text-blue-800",
  self_reported: "bg-amber-100 text-amber-800",
  proxy: "bg-rose-100 text-rose-800",
};

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function FitnessDashboardPage() {
  const [result, setResult] = useState<FitnessResult | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [openDim, setOpenDim] = useState<string | null>(null);
  const [showSensitivity, setShowSensitivity] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [computeRes, historyRes] = await Promise.all([
        fetch("/api/fitness/compute").then((r) => r.json()),
        fetch("/api/fitness/history").then((r) => r.json()),
      ]);
      if (!computeRes.ok) {
        setError(computeRes.error);
        setResult(null);
      } else {
        setResult(computeRes.result);
      }
      if (historyRes.ok) setHistory(historyRes.snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function seed() {
    setSeeding(true);
    try {
      await fetch("/api/fitness/seed", { method: "POST" });
      await load();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Fitness = Σ w_i · normalize(metric_i). Weights and raw metrics below are always visible.</p>
            {result ? (
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-6xl font-black text-indigo-700">{result.fitness.toFixed(3)}</span>
                <span className="text-slate-500">/ 1.000 · policy v{result.policyVersion}</span>
              </div>
            ) : (
              <p className="mt-2 text-slate-400">{loading ? "Computing…" : "No fitness computed yet."}</p>
            )}
          </div>
          <button
            onClick={seed}
            disabled={seeding}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {seeding ? "Seeding…" : "Seed demo data (6 periods)"}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error} — try &quot;Seed demo data&quot; above.
          </p>
        )}
        {history.length > 1 && (
          <div className="mt-4 flex items-end gap-1">
            {history.map((h) => (
              <div
                key={h.periodEnd}
                title={`${h.periodEnd}: ${Number(h.fitness).toFixed(3)}`}
                className="w-6 rounded-t bg-indigo-300"
                style={{ height: `${Math.max(4, Number(h.fitness) * 80)}px` }}
              />
            ))}
          </div>
        )}
      </section>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Decomposition tree (mandatory, never opaque)</h2>
            <button
              onClick={() => setShowSensitivity((s) => !s)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {showSensitivity ? "Hide sensitivity panel" : "Show sensitivity panel (∂Fitness/∂·)"}
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {result.dimensions.map((d) => (
              <div key={d.id} className="py-3">
                <button
                  onClick={() => setOpenDim(openDim === d.id ? null : d.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    <p className="text-sm text-slate-500">{d.description}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-slate-400">raw weight</p>
                      <p className="font-mono">{d.rawWeight.toFixed(3)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">normalized weight</p>
                      <p className="font-mono">{pct(d.normalizedWeight)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">dimension score D_i</p>
                      <p className="font-mono">{d.score.toFixed(3)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">contribution</p>
                      <p className="font-mono font-bold text-indigo-700">{d.contribution.toFixed(3)}</p>
                    </div>
                    {showSensitivity && (
                      <div className="text-right">
                        <p className="text-slate-400">∂Fitness/∂w_i</p>
                        <p className="font-mono">{d.weightSensitivity >= 0 ? "+" : ""}{d.weightSensitivity.toFixed(4)}</p>
                      </div>
                    )}
                    <span className="text-slate-400">{openDim === d.id ? "▲" : "▼"}</span>
                  </div>
                </button>
                <p className="mt-1 text-xs text-slate-400">Weight rationale: {d.weightRationale}</p>

                {openDim === d.id && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Metric</th>
                          <th className="px-3 py-2">Evidence</th>
                          <th className="px-3 py-2">Value</th>
                          <th className="px-3 py-2">Normalized</th>
                          {showSensitivity && <th className="px-3 py-2">∂Fitness/∂value</th>}
                          <th className="px-3 py-2">Goodhart risk</th>
                          <th className="px-3 py-2">Counter-metric</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.metrics.map((m) => (
                          <tr key={m.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 font-medium text-slate-800">{m.name}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${EVIDENCE_COLORS[m.evidenceClass]}`}>
                                {m.evidenceClass}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {m.value} {m.unit}
                            </td>
                            <td className="px-3 py-2 font-mono">{m.normalizedScore.toFixed(3)}</td>
                            {showSensitivity && (
                              <td className="px-3 py-2 font-mono">
                                {m.sensitivity >= 0 ? "+" : ""}
                                {m.sensitivity.toFixed(5)}
                              </td>
                            )}
                            <td className="px-3 py-2 max-w-xs text-slate-600">{m.goodhartRisk}</td>
                            <td className="px-3 py-2 max-w-xs text-slate-600">
                              <span className="font-medium text-slate-800">{m.counterMetricId}</span>
                              {m.counterValue !== null && (
                                <span className="font-mono"> = {m.counterValue}</span>
                              )}
                              <p className="text-xs text-slate-400">{m.counterRationale}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Decomposability check: Σ contribution = {result.dimensions.reduce((s, d) => s + d.contribution, 0).toFixed(6)} —
            must equal fitness ({result.fitness.toFixed(6)}). Verified automatically on every compute; see <code>npm run verify</code>.
          </p>
        </section>
      )}
    </div>
  );
}
