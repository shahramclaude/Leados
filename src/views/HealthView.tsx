"use client";
import React, { useEffect, useState } from "react";
import type { HealthSuiteReport } from "@/lib/types";

export function HealthView() {
  const [report, setReport] = useState<HealthSuiteReport | null>(null);

  useEffect(() => {
    fetch("/api/system-health").then((r) => r.json()).then(setReport);
  }, []);

  if (!report) return <div className="text-sm text-slate-500">Running self-tests…</div>;

  const sorted = [...report.tests].sort((a, b) => Number(a.pass) - Number(b.pass));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">System Health — Self-Test Suite</h1>

      {report.allPass ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300">ALL SYSTEMS NOMINAL</div>
      ) : (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">SYSTEM INTEGRITY CHECK FAILED</div>
      )}

      <div className="text-sm text-slate-400">
        {report.passing}/{report.total} passing · {report.totalMs.toFixed(1)}ms
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-500">
              <th className="px-3 py-2">Test ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Pass/Fail</th>
              <th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className={`border-t border-slate-800 ${t.pass ? "bg-emerald-500/5" : "bg-rose-500/10"}`}>
                <td className="px-3 py-1.5 font-mono text-slate-300">{t.id}</td>
                <td className="px-3 py-1.5 text-slate-300">{t.name}</td>
                <td className={`px-3 py-1.5 font-semibold ${t.pass ? "text-emerald-400" : "text-rose-400"}`}>{t.pass ? "PASS" : "FAIL"}</td>
                <td className="px-3 py-1.5 text-slate-400">{t.actual}</td>
                <td className="px-3 py-1.5 text-slate-500">{t.expected}</td>
                <td className="px-3 py-1.5 text-slate-500">{t.durationMs.toFixed(2)}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
