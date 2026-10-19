"use client";

import { useEffect, useState } from "react";
import type { Anomaly, ForecastResult } from "@/lib/metricsEngine";

type MetricSeries = {
  metric: { id: number; name: string; unit: string; baseline: number; stdDev: number };
  points: { id: number; metricId: number; ts: string; value: number }[];
  anomalies: Anomaly[];
  forecast: ForecastResult;
};

type MetricsApiResponse = { series: MetricSeries[]; correlation: number | null };

export default function MetricsView() {
  const [data, setData] = useState<MetricsApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading metrics intelligence…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Metrics Intelligence</h1>

      {data.correlation !== null && (
        <p className="text-xs text-slate-400">
          Pearson correlation between tracked metrics: <span className="text-slate-200">{data.correlation.toFixed(3)}</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.series.map((s) => {
          const max = Math.max(...s.points.map((p) => p.value), 1);
          return (
            <div key={s.metric.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">{s.metric.name}</h2>
                <span className="text-[10px] uppercase text-slate-500">{s.forecast.method.replace("_", " ")}</span>
              </div>
              <div className="mt-3 flex h-16 items-end gap-0.5">
                {s.points.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex-1 rounded-t ${s.anomalies.some((a) => a.index === i) ? "bg-red-500" : "bg-indigo-600"}`}
                    style={{ height: `${Math.max(4, (p.value / max) * 60)}px` }}
                    title={`${p.value.toFixed(2)}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Forecast accuracy: {s.forecast.accuracy.toFixed(0)}% · Anomalies: {s.anomalies.length}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
