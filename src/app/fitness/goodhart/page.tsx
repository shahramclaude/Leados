"use client";

import { useCallback, useEffect, useState } from "react";

interface Pair {
  metricId: string;
  metricName: string;
  counterMetricId: string;
  counterMetricName: string;
  goodhartRisk: string;
  counterRationale: string;
}

interface Finding {
  metricId: string;
  metricName: string;
  counterMetricId: string;
  counterMetricName: string;
  metricDeltaPct: number;
  counterDeltaPct: number;
  severity: "info" | "watch" | "high";
  suspicious: boolean;
  note: string;
}

interface Alert {
  id: number;
  metricId: string;
  counterMetricId: string;
  periodStart: string;
  periodEnd: string;
  severity: string;
  note: string;
  createdAt: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  info: "border-slate-200 bg-slate-50",
  watch: "border-amber-300 bg-amber-50",
  high: "border-rose-400 bg-rose-50",
};

export default function GoodhartWatchPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [periods, setPeriods] = useState<{ previous: string; current: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [gh, al] = await Promise.all([
      fetch("/api/fitness/goodhart").then((r) => r.json()),
      fetch("/api/fitness/goodhart/alerts").then((r) => r.json()),
    ]);
    if (gh.ok) {
      setPairs(gh.pairs);
      setFindings(gh.findings ?? []);
      setPeriods(gh.periods ?? null);
      setNote(gh.note ?? null);
    }
    if (al.ok) setAlerts(al.alerts);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runDetection() {
    setRunning(true);
    try {
      await fetch("/api/fitness/goodhart", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Goodhart Watch</h2>
            <p className="text-sm text-slate-500">
              Every metric that feeds Fitness is paired with a counter-metric that should move WITH genuine improvement.
              {periods && ` Comparing ${periods.previous} → ${periods.current}.`}
            </p>
          </div>
          <button
            onClick={runDetection}
            disabled={running}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {running ? "Running…" : "Run joint-movement detection"}
          </button>
        </div>
        {note && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{note}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-bold text-slate-900">Latest joint-movement findings</h3>
        <div className="mt-3 space-y-3">
          {findings.length === 0 && <p className="text-sm text-slate-400">No findings yet — seed demo data and run detection.</p>}
          {findings.map((f) => (
            <div key={`${f.metricId}-${f.counterMetricId}`} className={`rounded-xl border p-4 ${SEVERITY_STYLE[f.severity]}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">
                  {f.metricName} ↔ {f.counterMetricName}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold uppercase text-slate-700">{f.severity}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{f.note}</p>
              <p className="mt-1 text-xs font-mono text-slate-500">
                Δ{f.metricName} {f.metricDeltaPct >= 0 ? "+" : ""}
                {f.metricDeltaPct.toFixed(1)}% · Δ{f.counterMetricName} {f.counterDeltaPct >= 0 ? "+" : ""}
                {f.counterDeltaPct.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-bold text-slate-900">Persisted alerts (history)</h3>
        <div className="mt-3 space-y-2">
          {alerts.length === 0 && <p className="text-sm text-slate-400">No alerts persisted yet.</p>}
          {alerts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-mono text-xs text-slate-400">
                {a.periodStart} → {a.periodEnd} · {a.severity}
              </p>
              <p className="text-slate-700">{a.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-bold text-slate-900">All declared metric pairs ({pairs.length})</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {pairs.map((p) => (
            <div key={p.metricId} className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {p.metricName} <span className="text-slate-400">↔</span> {p.counterMetricName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-semibold">Gaming risk:</span> {p.goodhartRisk}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-semibold">Why the pairing works:</span> {p.counterRationale}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
