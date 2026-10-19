"use client";
import React, { useEffect, useState } from "react";
import { Sparkline, LineChart, CalibrationPlot } from "@/components/ui/svgCharts";
import type { CalibrationReport, CrossMetricHypothesis, ForecastResult, MetricDefinition } from "@/lib/types";

type Tab = "grid" | "calibration" | "causality";

interface GridRow extends MetricDefinition {
  series: { ts: string; value: number }[];
  latest: number;
}

export function MetricsView() {
  const [tab, setTab] = useState<Tab>("grid");
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [crossMetric, setCrossMetric] = useState<CrossMetricHypothesis[]>([]);
  const [calibration, setCalibration] = useState<CalibrationReport[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ metricKey: string; forecast: ForecastResult; breaks: { ts: string; isBreak: boolean }[] } | null>(null);

  useEffect(() => {
    fetch("/api/metrics").then((r) => r.json()).then((d) => {
      setGrid(d.grid ?? []);
      setCrossMetric(d.crossMetric ?? []);
      setCalibration(d.calibration ?? []);
    });
  }, []);

  async function openDetail(key: string) {
    setSelected(key);
    const r = await fetch(`/api/metrics?metric=${key}`);
    const d = await r.json();
    setDetail(d.detail);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Metrics Intelligence</h1>
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {(["grid", "calibration", "causality"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-xs capitalize ${tab === t ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "grid" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grid.map((m) => (
            <button key={m.key} onClick={() => openDetail(m.key)} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-left hover:border-slate-700">
              <div className="text-sm font-semibold text-slate-100">{m.label}</div>
              <div className="text-2xl font-bold text-slate-200">
                {m.latest.toFixed(2)} <span className="text-xs font-normal text-slate-500">{m.unit}</span>
              </div>
              <Sparkline values={m.series.map((p) => p.value)} />
              <div className="text-[10px] text-slate-500">baseline {m.baseline} ± {m.stdev}</div>
            </button>
          ))}
          {grid.length === 0 && <div className="text-xs text-slate-500">No metrics recorded yet.</div>}
        </div>
      )}

      {tab === "grid" && selected && detail && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">{selected} — Holt-Winters forecast (Holt 1957; Winters 1960)</div>
          <LineChart series={[...detail.forecast.history, ...detail.forecast.forecast]} splitIndex={detail.forecast.history.length} width={520} height={160} />
          <div className="mt-2 text-xs text-slate-500">
            level={detail.forecast.level.toFixed(2)}, trend={detail.forecast.trend.toFixed(3)}. CUSUM structural breaks (Page 1954): {detail.breaks.filter((b) => b.isBreak).length} detected.
          </div>
        </div>
      )}

      {tab === "calibration" && (
        <div className="space-y-4">
          <p className="max-w-3xl text-xs text-slate-400">
            If the calibration curve deviates significantly from the diagonal, the rule&apos;s confidence scores are miscalibrated and should be
            treated with skepticism.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {calibration.map((c) => (
              <div key={c.ruleId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-1 text-xs font-semibold text-slate-200">{c.ruleId}</div>
                <CalibrationPlot points={c.points} width={200} height={200} />
                <div className="mt-1 text-[11px] text-slate-500">
                  {c.confirmed}/{c.predictions} confirmed ({Math.round(c.confirmationRate * 100)}%) —{" "}
                  <span
                    className={
                      c.status === "good" ? "text-emerald-400" : c.status === "insufficient data" ? "text-slate-400" : "text-amber-400"
                    }
                  >
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
            {calibration.length === 0 && <div className="text-xs text-slate-500">No rule has 5+ resolutions yet.</div>}
          </div>
        </div>
      )}

      {tab === "causality" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Cross-Metric Causal Hypotheses (lagged Pearson correlation)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1">A leads B</th>
                <th className="pb-1">Lag (days)</th>
                <th className="pb-1">r</th>
                <th className="pb-1">Statement</th>
              </tr>
            </thead>
            <tbody>
              {crossMetric.map((h, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">
                    {h.metricA} → {h.metricB}
                  </td>
                  <td className="py-1 text-slate-400">{h.lagDays}</td>
                  <td className="py-1 text-slate-400">{h.correlation.toFixed(2)}</td>
                  <td className="py-1 text-slate-500">{h.statement}</td>
                </tr>
              ))}
              {crossMetric.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-slate-500">
                    No significant lagged correlations (|r| ≥ 0.5) detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
