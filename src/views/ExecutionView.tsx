"use client";

import { useEffect, useState } from "react";
import type { CriticalPathResult } from "@/lib/strategicIntel";
import type { ProjectRow } from "@/lib/clientTypes";

type ExecutionApiResponse = {
  projects: ProjectRow[];
  criticalPath: CriticalPathResult;
  confidences: { projectId: number; name: string; computedConfidence: number }[];
};

export default function ExecutionView() {
  const [data, setData] = useState<ExecutionApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/execution")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading execution intelligence…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Execution Intelligence</h1>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-300">Critical Path</h2>
        <p className="mt-2 text-xs text-slate-400">
          {data.criticalPath.chain.length} projects · {data.criticalPath.totalDurationDays} days ·{" "}
          bottleneck: project #{data.criticalPath.bottleneckProject ?? "—"}
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-500">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Dependencies</th>
              <th className="px-3 py-2">Delivery Confidence</th>
              <th className="px-3 py-2">On Critical Path</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => {
              const conf = data.confidences.find((c) => c.projectId === p.id);
              const onPath = data.criticalPath.chain.includes(p.id);
              return (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="px-3 py-1.5 text-slate-200">{p.name}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.status}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.durationDays}d</td>
                  <td className="px-3 py-1.5 text-slate-500">{p.dependencies.join(", ") || "—"}</td>
                  <td className={`px-3 py-1.5 ${conf && conf.computedConfidence < 0.4 ? "text-red-400" : "text-slate-300"}`}>
                    {conf ? `${Math.round(conf.computedConfidence * 100)}%` : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {onPath ? <span className="text-amber-400">●</span> : <span className="text-slate-700">○</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
