"use client";

import { useCallback, useEffect, useState } from "react";
import ProactiveRail from "./ProactiveRail";
import WorkQueueView from "./views/WorkQueueView";

interface RunSummary {
  id: number;
  ranAt: string;
  findingsCount: number;
  actionsTaken: number;
  escalations: number;
  durationMs: number;
  summary: string;
}

export default function Dashboard() {
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/autonomous/runs");
    if (!res.ok) return;
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const runNow = useCallback(async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/autonomous/trigger", { method: "POST" });
      const data = await res.json();
      setLastResult(res.ok ? data.summary : data.error ?? "Run failed");
      await loadRuns();
    } catch {
      setLastResult("Run failed — check server logs.");
    } finally {
      setRunning(false);
    }
  }, [loadRuns]);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LeadOS</p>
          <h1 className="text-2xl font-semibold text-slate-900">Autonomous Operations</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            A server-side intelligence loop continuously scans the event log, maintains a persistent work queue,
            and pushes live updates over SSE — no polling, no refresh required.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={runNow}
            disabled={running}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Running cycle…" : "Run autonomous cycle now"}
          </button>
          {lastResult && <p className="max-w-xs text-right text-xs text-slate-500">{lastResult}</p>}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <WorkQueueView />
        </div>
        <div className="flex flex-col gap-4">
          <ProactiveRail />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Recent autonomous runs</h2>
            {runs.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                No cycles have run yet. Click &quot;Run autonomous cycle now&quot;, or point an external scheduler at
                <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">POST /api/autonomous/run</code>
                every few minutes.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {runs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{new Date(r.ranAt).toLocaleString()}</span>
                      <span className="text-slate-400">{r.durationMs}ms</span>
                    </div>
                    <p className="mt-0.5">{r.summary}</p>
                    <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
                      <span>{r.findingsCount} findings</span>
                      <span>{r.actionsTaken} actions</span>
                      <span>{r.escalations} escalations</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
