"use client";

import { useEffect, useState } from "react";
import type { ScenarioActivation, WarGameResult, CriticalPathResult, DecisionTree } from "@/lib/strategicIntel";

type StrategicApiResponse = {
  scenarios: ScenarioActivation[];
  wargame: WarGameResult;
  criticalPath: CriticalPathResult;
  decisionTree: DecisionTree;
};

const URGENCY_COLOR: Record<string, string> = {
  monitor: "text-emerald-400",
  prepare: "text-amber-400",
  act: "text-red-400",
};

export default function StrategicWarRoomView() {
  const [data, setData] = useState<StrategicApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategic")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading strategic war room…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Strategic War Room</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Scenario Activation</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.scenarios.map((s) => (
            <div key={s.metric} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <p className="text-xs text-slate-400">{s.metric}</p>
              <p className={`mt-1 text-lg font-semibold uppercase ${URGENCY_COLOR[s.urgency]}`}>{s.urgency}</p>
              <p className="text-[10px] text-slate-500">{s.deviationInStdDevs.toFixed(2)}σ deviation</p>
            </div>
          ))}
          {data.scenarios.length === 0 && <p className="text-sm text-slate-500">No metrics tracked yet.</p>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Critical Path</h2>
          <p className="mt-2 text-xs text-slate-400">Chain: {data.criticalPath.chain.join(" → ")}</p>
          <p className="text-xs text-slate-400">Total duration: {data.criticalPath.totalDurationDays} days</p>
          <p className="text-xs text-slate-400">Bottleneck project ID: {data.criticalPath.bottleneckProject ?? "—"}</p>
          {data.criticalPath.cyclesDetected.length > 0 ? (
            <p className="mt-2 text-xs text-red-400">⚠ Cycles: {data.criticalPath.cyclesDetected.map((c) => c.join("→")).join(" | ")}</p>
          ) : (
            <p className="mt-2 text-xs text-emerald-400">No dependency cycles detected.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-300">War Game Simulation</h2>
          <p className="mt-2 text-xs text-slate-400">
            {data.wargame.rounds} rounds · completed in {data.wargame.durationMs}ms
          </p>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-slate-500">
            {data.wargame.moves.slice(0, 12).map((m, i) => (
              <li key={i}>
                R{m.round} · {m.actor}: {m.action}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-300">Auto-Generated Decision Tree</h2>
        <p className="mt-1 text-xs text-slate-500">{data.decisionTree.decision}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.decisionTree.branches.map((b, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs">
              <p className="font-semibold text-slate-200">{b.label}</p>
              <p className="mt-1 text-slate-500">{b.outcome}</p>
              <p className="mt-1 text-slate-400">EV: {(b.expectedValue * 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
