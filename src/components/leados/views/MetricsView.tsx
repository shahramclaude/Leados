"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface MetricValueRow {
  id: number;
  value: string;
  recordedAt: string;
}

interface MetricRow {
  key: string;
  label: string;
  domain: string;
  unit: string;
  target: string;
  benchmark: string;
  direction: string;
  series: MetricValueRow[];
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8 w-full text-xs text-slate-600">Not enough data</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / range) * 28}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full">
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={2} />
    </svg>
  );
}

export default function MetricsView() {
  const { metricsHealth, loading, refetch, toast } = useAppContext();
  const { data: metrics, setData, refetch: refetchMetrics } = useFetchResource<MetricRow[]>("/api/metrics");
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addValue = async (metric: MetricRow) => {
    const raw = valueDrafts[metric.key];
    const value = Number(raw);
    if (raw === undefined || raw.trim() === "" || Number.isNaN(value)) {
      setErrors((prev) => ({ ...prev, [metric.key]: "Enter a numeric value." }));
      return;
    }
    setErrors((prev) => ({ ...prev, [metric.key]: "" }));
    const optimisticRow: MetricValueRow = { id: -Date.now(), value: String(value), recordedAt: new Date().toISOString() };
    setData((prev) =>
      prev?.map((m) => (m.key === metric.key ? { ...m, series: [...m.series, optimisticRow] } : m)) ?? prev
    );
    try {
      await postJson(`/api/metrics/${metric.key}/values`, { value });
      toast(`${metric.label} updated`, 1);
      setValueDrafts((prev) => ({ ...prev, [metric.key]: "" }));
      void refetchMetrics();
      refetch();
    } catch (err) {
      setData((prev) =>
        prev?.map((m) => (m.key === metric.key ? { ...m, series: m.series.filter((s) => s.id !== optimisticRow.id) } : m)) ?? prev
      );
      toast(err instanceof Error ? err.message : "Failed to add value", 4);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Metrics</h1>
        <p className="text-sm text-slate-500">KPI tracking with z-score and MAPE-vs-target health.</p>
      </header>

      {loading && !metrics ? (
        <SkeletonList rows={5} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(metrics ?? []).map((m) => {
            const health = metricsHealth[m.key];
            const values = m.series.map((s) => parseFloat(s.value));
            return (
              <div key={m.key} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-100">{m.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                      health?.status === "critical"
                        ? "bg-red-500/15 text-red-300"
                        : health?.status === "warning"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {health?.status ?? "healthy"}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-slate-100">
                  {health?.currentValue !== null && health?.currentValue !== undefined ? health.currentValue.toLocaleString() : "—"}
                  <span className="ml-1 text-xs text-slate-500">{m.unit}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Target {m.target} · Benchmark {m.benchmark}
                  {health?.mapeVsTarget !== null && health?.mapeVsTarget !== undefined ? ` · ${health.mapeVsTarget}% from target` : ""}
                </p>
                <div className="mt-2">
                  <Sparkline values={values} />
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={valueDrafts[m.key] ?? ""}
                    onChange={(e) => setValueDrafts((prev) => ({ ...prev, [m.key]: e.target.value }))}
                    placeholder="New value"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <button onClick={() => void addValue(m)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500">
                    Add
                  </button>
                </div>
                {errors[m.key] && <p className="mt-1 text-xs text-red-400">{errors[m.key]}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
