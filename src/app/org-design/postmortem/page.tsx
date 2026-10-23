"use client";

import { useEffect, useState } from "react";

type SimRun = { id: number; label: string; deliveryImpact: { capacityChangePct: { value: number }; cycleTimeChangeDays: { value: number } } };
type TrackedRow = {
  id: number;
  simulationRunId: number;
  predicted: { capacityChangePct: number; cycleTimeChangeDays: number };
  realized: { capacityChangePct: number; cycleTimeChangeDays: number };
  variance: { capacityErrorPct: number; cycleTimeErrorDays: number; withinDeclaredError: boolean };
  newParamsVersion: number | null;
  createdAt: string;
};

export default function PostmortemPage() {
  const [runs, setRuns] = useState<SimRun[]>([]);
  const [tracked, setTracked] = useState<TrackedRow[]>([]);
  const [simulationRunId, setSimulationRunId] = useState<number | "">("");
  const [realizedCapacity, setRealizedCapacity] = useState(0);
  const [realizedCycle, setRealizedCycle] = useState(0);
  const [lastResult, setLastResult] = useState<{ before: { version: number; coefficient: number }; after: { version: number; coefficient: number } } | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/org-design/simulations").then((r) => r.json()).then((d) => setRuns(d.runs ?? []));
    fetch("/api/org-design/post-change").then((r) => r.json()).then((d) => setTracked(d.rows ?? []));
  }

  useEffect(load, []);

  async function recordRealized() {
    setError("");
    if (!simulationRunId) {
      setError("Choose a simulation run first.");
      return;
    }
    const res = await fetch("/api/org-design/post-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulationRunId,
        realizedCapacityChangePct: realizedCapacity,
        realizedCycleTimeChangeDays: realizedCycle,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setLastResult({ before: data.before, after: data.after });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Record a realized outcome</h2>
        <p className="mt-1 text-sm text-slate-500">
          Predicted vs. realized feeds a damped recalibration loop: the twin nudges its coefficients toward what actually
          happened, without over-fitting to a single reorg.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select value={simulationRunId} onChange={(e) => setSimulationRunId(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Choose simulation…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} {r.label} (predicted {r.deliveryImpact.capacityChangePct.value}% / {r.deliveryImpact.cycleTimeChangeDays.value}d)
              </option>
            ))}
          </select>
          <input type="number" step="0.1" value={realizedCapacity} onChange={(e) => setRealizedCapacity(Number(e.target.value))} placeholder="Realized capacity change %" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" step="0.1" value={realizedCycle} onChange={(e) => setRealizedCycle(Number(e.target.value))} placeholder="Realized cycle-time change (days)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button onClick={recordRealized} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Record &amp; recalibrate
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        {lastResult && (
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            Twin coefficient for this move type moved from {lastResult.before.coefficient.toFixed(3)} (v{lastResult.before.version}) to{" "}
            {lastResult.after.coefficient.toFixed(3)} (v{lastResult.after.version}).
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Predicted vs. realized history</h2>
        <table className="mt-3 w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2 pr-4">Run</th>
              <th className="py-2 pr-4">Predicted capacity / cycle</th>
              <th className="py-2 pr-4">Realized capacity / cycle</th>
              <th className="py-2 pr-4">Variance</th>
              <th className="py-2 pr-4">Within declared error?</th>
              <th className="py-2 pr-4">New params version</th>
            </tr>
          </thead>
          <tbody>
            {tracked.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2 pr-4">#{t.simulationRunId}</td>
                <td className="py-2 pr-4">
                  {t.predicted.capacityChangePct}% / {t.predicted.cycleTimeChangeDays}d
                </td>
                <td className="py-2 pr-4">
                  {t.realized.capacityChangePct}% / {t.realized.cycleTimeChangeDays}d
                </td>
                <td className="py-2 pr-4">
                  {t.variance.capacityErrorPct.toFixed(2)}pp / {t.variance.cycleTimeErrorDays.toFixed(2)}d
                </td>
                <td className={`py-2 pr-4 font-semibold ${t.variance.withinDeclaredError ? "text-emerald-600" : "text-amber-600"}`}>{String(t.variance.withinDeclaredError)}</td>
                <td className="py-2 pr-4">{t.newParamsVersion}</td>
              </tr>
            ))}
            {tracked.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No post-change tracking recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
