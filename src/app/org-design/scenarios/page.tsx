"use client";

import { useEffect, useState } from "react";

type SimRun = { id: number; label: string; createdAt: string };
type CompareRow = {
  simulationRunId: number;
  label: string;
  capacityChangePct: { value: number; low: number; high: number };
  cycleTimeChangeDays: { value: number; low: number; high: number };
  cohesionChange: { value: number; low: number; high: number };
  busFactor: { value: number };
  chokePointCount: number;
  totalPeopleAffected: number;
  severeOrHighCount: number;
  unsupportedSevereOrHigh: number;
};

export default function ScenariosPage() {
  const [runs, setRuns] = useState<SimRun[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [policy, setPolicy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/org-design/simulations").then((r) => r.json()).then((d) => setRuns(d.runs ?? []));
  }, []);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function compare() {
    setError("");
    if (selected.length < 2) {
      setError("Select at least 2 simulation runs to compare.");
      return;
    }
    const res = await fetch("/api/org-design/scenarios/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulationRunIds: selected }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRows(data.rows);
    setPolicy(data.policy);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Pick simulation runs to compare</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {runs.map((r) => (
            <label key={r.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${selected.includes(r.id) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"}`}>
              <input type="checkbox" className="mr-1" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
              #{r.id} {r.label}
            </label>
          ))}
          {runs.length === 0 && <p className="text-sm text-slate-400">Run some simulations in the Org Design Lab first.</p>}
        </div>
        <button onClick={compare} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Compare
        </button>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </section>

      {rows.length > 0 && (
        <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{policy}</p>
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Capacity change</th>
                <th className="py-2 pr-4">Cycle time change</th>
                <th className="py-2 pr-4">Cohesion change</th>
                <th className="py-2 pr-4">Bus factor</th>
                <th className="py-2 pr-4">Choke points</th>
                <th className="py-2 pr-4">People affected</th>
                <th className="py-2 pr-4">Severe/high</th>
                <th className="py-2 pr-4">Unsupported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.simulationRunId} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium">#{r.simulationRunId} {r.label}</td>
                  <td className="py-2 pr-4">
                    {r.capacityChangePct.value}% [{r.capacityChangePct.low}, {r.capacityChangePct.high}]
                  </td>
                  <td className="py-2 pr-4">
                    {r.cycleTimeChangeDays.value}d [{r.cycleTimeChangeDays.low}, {r.cycleTimeChangeDays.high}]
                  </td>
                  <td className="py-2 pr-4">
                    {r.cohesionChange.value} [{r.cohesionChange.low}, {r.cohesionChange.high}]
                  </td>
                  <td className="py-2 pr-4">{r.busFactor.value}</td>
                  <td className="py-2 pr-4">{r.chokePointCount}</td>
                  <td className="py-2 pr-4">{r.totalPeopleAffected}</td>
                  <td className="py-2 pr-4">{r.severeOrHighCount}</td>
                  <td className={`py-2 pr-4 font-semibold ${r.unsupportedSevereOrHigh > 0 ? "text-rose-600" : "text-emerald-600"}`}>{r.unsupportedSevereOrHigh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
