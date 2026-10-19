"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MetricDef,
  MetricsIntelligenceReport,
  MetricHealthFull,
  Forecast,
  Anomaly,
  MetricAlert,
  CorrelationPair,
  MetricCausalHypothesis,
  MetricStatus,
} from "@/lib/types";

// The API route returns the typed MetricsIntelligenceReport plus two small
// extensions the UI needs (metric definitions for naming, and a trimmed
// recent-values window for sparklines).
interface MetricsApiPayload extends MetricsIntelligenceReport {
  metricDefs: MetricDef[];
  recentValues: Record<string, { recordedAt: string; value: number }[]>;
}

interface SeriesPayload {
  metricDef: MetricDef;
  values: { recordedAt: string; value: number }[];
}

interface MemoryNodePayload {
  id: number;
  key: string;
  label: string;
  domain: string;
  linkedMetricKeys: string[];
  content: string;
  importance: number;
}

const STATUS_COLOR: Record<MetricStatus, string> = {
  healthy: "#16a34a",
  warning: "#d97706",
  critical: "#dc2626",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 1) return `${Math.max(0, Math.round(days * 24))}h ago`;
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const ALERT_TYPE_LABEL: Record<MetricAlert["type"], string> = {
  anomaly: "Anomaly",
  target_miss: "Target miss",
  trend_reversal: "Trend reversal",
  structural_break: "Structural break",
  forecast_threshold: "Forecast risk",
};

function severityColor(severity: number): string {
  if (severity >= 5) return "#991b1b";
  if (severity >= 4) return "#dc2626";
  if (severity >= 3) return "#d97706";
  if (severity >= 2) return "#2563eb";
  return "#64748b";
}

// ---------------------------------------------------------------------------
// Sparkline: last 12 actual points (solid, colored by health) + a dashed
// continuation of the forecast's p50 for the next few points (dimmer color).
// ---------------------------------------------------------------------------
function Sparkline({
  values,
  forecast,
  anomalyDates,
  color,
}: {
  values: { recordedAt: string; value: number }[];
  forecast: Forecast | undefined;
  anomalyDates: Set<string>;
  color: string;
}) {
  const width = 120;
  const height = 40;
  const actual = values.slice(-12);
  const forecastHead = forecast ? forecast.points.slice(0, 6).map((p) => p.p50) : [];

  if (actual.length < 2) {
    return (
      <svg width={width} height={height} className="block">
        <text x={4} y={24} fontSize="10" fill="#94a3b8">
          not enough data
        </text>
      </svg>
    );
  }

  const allValues = [...actual.map((a) => a.value), ...forecastHead];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const actualWidth = width * 0.65;
  const forecastWidth = width - actualWidth;

  const actualPoints = actual.map((a, i) => {
    const x = (i / (actual.length - 1)) * actualWidth;
    const y = height - ((a.value - min) / range) * height;
    return { x, y, recordedAt: a.recordedAt, value: a.value };
  });

  const forecastPoints = forecastHead.map((v, i) => {
    const x = actualWidth + ((i + 1) / forecastHead.length) * forecastWidth;
    const y = height - ((v - min) / range) * height;
    return { x, y };
  });

  const actualPath = actualPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const forecastPath = [actualPoints[actualPoints.length - 1], ...forecastPoints]
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="block overflow-visible">
      {forecastHead.length > 0 && (
        <polyline
          points={forecastPath}
          fill="none"
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1.5}
          strokeDasharray="3,2"
        />
      )}
      <polyline points={actualPath} fill="none" stroke={color} strokeWidth={1.75} />
      {actualPoints.map((p, i) =>
        anomalyDates.has(p.recordedAt.slice(0, 10)) ? (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#dc2626" stroke="white" strokeWidth={0.5} />
        ) : null,
      )}
    </svg>
  );
}

function MetricCard({
  def,
  health,
  recent,
  forecast,
  anomalies,
  onClick,
}: {
  def: MetricDef;
  health: MetricHealthFull | undefined;
  recent: { recordedAt: string; value: number }[];
  forecast: Forecast | undefined;
  anomalies: Anomaly[];
  onClick: () => void;
}) {
  const color = health ? STATUS_COLOR[health.status] : "#94a3b8";
  const anomalyDates = useMemo(
    () => new Set(anomalies.map((a) => a.detectedAt.slice(0, 10))),
    [anomalies],
  );

  const favorable =
    health?.vsTargetPct === null || health?.vsTargetPct === undefined
      ? null
      : def.higherIsBetter
      ? health.vsTargetPct >= 0
      : health.vsTargetPct <= 0;

  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">
          {def.key}
        </span>
        <span className="text-base leading-none" title={health?.trend ?? "unknown"}>
          {health?.trendArrow ?? "→"}
        </span>
      </div>

      <div className="text-[28px] font-semibold leading-none" style={{ color }}>
        {health ? fmtNum(health.currentValue) : "—"}
        <span className="ml-1 text-xs font-normal text-slate-400">{def.unit}</span>
      </div>

      <Sparkline values={recent} forecast={forecast} anomalyDates={anomalyDates} color={color} />

      <div className="flex items-center justify-between text-xs">
        <span
          className={
            favorable === null
              ? "text-slate-400"
              : favorable
              ? "font-medium text-emerald-600"
              : "font-medium text-red-600"
          }
        >
          vs target: {fmtPct(health?.vsTargetPct ?? null)}
        </span>
        <span className="text-slate-400">{health ? timeAgo(health.lastUpdated) : ""}</span>
      </div>
    </button>
  );
}

function AlertCard({ alert, defs }: { alert: MetricAlert; defs: Record<string, MetricDef> }) {
  const def = defs[alert.metricKey];
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border-l-4 bg-white p-3 shadow-sm"
      style={{ borderLeftColor: severityColor(alert.severity) }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{def?.name ?? alert.metricKey}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: severityColor(alert.severity) }}
        >
          S{alert.severity}
        </span>
      </div>
      <div className="text-xs font-medium text-slate-500">{ALERT_TYPE_LABEL[alert.type]}</div>
      <div className="text-xs text-slate-600">
        value {fmtNum(alert.value)}
        {alert.threshold !== null ? ` · threshold ${fmtNum(alert.threshold)}` : ""}
      </div>
      <div className="text-[11px] text-slate-400">{timeAgo(alert.detectedAt.toString())}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function TimeSeriesChart({
  seriesValues,
  forecast,
  target,
  anomalies,
}: {
  seriesValues: { recordedAt: string; value: number }[];
  forecast: Forecast | undefined;
  target: number | null;
  anomalies: Anomaly[];
}) {
  const width = 520;
  const height = 260;
  const padding = 24;

  const forecastWindow = forecast ? forecast.points.slice(0, 90) : [];

  const allDates = [
    ...seriesValues.map((v) => new Date(v.recordedAt).getTime()),
    ...forecastWindow.map((p) => new Date(p.date).getTime()),
  ];
  if (allDates.length < 2) {
    return <div className="text-sm text-slate-400">Not enough data to chart.</div>;
  }
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateRange = maxDate - minDate || 1;

  const allValues = [
    ...seriesValues.map((v) => v.value),
    ...forecastWindow.flatMap((p) => [p.p10, p.p90]),
    ...(target !== null ? [target] : []),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;

  const x = (t: number) => padding + ((t - minDate) / dateRange) * (width - padding * 2);
  const y = (v: number) => height - padding - ((v - minVal) / valRange) * (height - padding * 2);

  const actualPath = seriesValues
    .map((v) => `${x(new Date(v.recordedAt).getTime())},${y(v.value)}`)
    .join(" ");

  const p10Path = forecastWindow.map((p) => `${x(new Date(p.date).getTime())},${y(p.p10)}`).join(" ");
  const p50Path = forecastWindow.map((p) => `${x(new Date(p.date).getTime())},${y(p.p50)}`).join(" ");
  const p90Path = forecastWindow.map((p) => `${x(new Date(p.date).getTime())},${y(p.p90)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="rounded-lg bg-slate-50">
      {target !== null && (
        <line
          x1={padding}
          x2={width - padding}
          y1={y(target)}
          y2={y(target)}
          stroke="#94a3b8"
          strokeDasharray="4,3"
          strokeWidth={1}
        />
      )}

      {forecastWindow.length > 0 && (
        <>
          <polyline points={p10Path} fill="none" stroke="#a5b4fc" strokeDasharray="3,3" strokeWidth={1} />
          <polyline points={p90Path} fill="none" stroke="#a5b4fc" strokeDasharray="3,3" strokeWidth={1} />
          <polyline points={p50Path} fill="none" stroke="#6366f1" strokeDasharray="5,3" strokeWidth={1.5} />
        </>
      )}

      <polyline points={actualPath} fill="none" stroke="#0f172a" strokeWidth={1.75} />

      {anomalies.map((a, i) => {
        const t = new Date(a.detectedAt).getTime();
        if (t < minDate || t > maxDate) return null;
        return (
          <text key={i} x={x(t)} y={padding - 8} fontSize="11" textAnchor="middle">
            ⚠
          </text>
        );
      })}
    </svg>
  );
}

function monthlyForecastTable(forecast: Forecast) {
  const buckets: { label: string; p10: number; p50: number; p90: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const slice = forecast.points.slice(m * 30, m * 30 + 30);
    if (slice.length === 0) break;
    buckets.push({
      label: `Month ${m + 1} (${slice[0].date} → ${slice[slice.length - 1].date})`,
      p10: slice.reduce((s, p) => s + p.p10, 0) / slice.length,
      p50: slice.reduce((s, p) => s + p.p50, 0) / slice.length,
      p90: slice.reduce((s, p) => s + p.p90, 0) / slice.length,
    });
  }
  return buckets;
}

function DetailPanel({
  def,
  health,
  forecast,
  anomalies,
  correlations,
  causal,
  onClose,
}: {
  def: MetricDef;
  health: MetricHealthFull | undefined;
  forecast: Forecast | undefined;
  anomalies: Anomaly[];
  correlations: CorrelationPair[];
  causal: MetricCausalHypothesis[];
  onClose: () => void;
}) {
  const [series, setSeries] = useState<SeriesPayload | null>(null);
  const [nodes, setNodes] = useState<MemoryNodePayload[]>([]);
  // `loading` is derived from `series` rather than tracked separately. The
  // parent mounts <DetailPanel key={def.key} .../>, so this component
  // remounts (resetting series/nodes to their initial null/[] values)
  // whenever a different metric is selected — no manual reset needed here.
  const loading = series === null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/metrics/series/${def.key}`).then((r) => r.json()),
      fetch(`/api/metrics/context/${def.key}`).then((r) => r.json()),
    ]).then(([seriesData, contextData]) => {
      if (cancelled) return;
      setSeries(seriesData);
      setNodes(contextData.nodes ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [def.key]);

  const monthly = forecast ? monthlyForecastTable(forecast) : [];

  return (
    <div className="fixed inset-y-0 right-0 z-30 flex w-[560px] max-w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <div className="font-mono text-xs uppercase text-slate-400">{def.domain}</div>
          <h2 className="text-xl font-semibold text-slate-900">{def.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{def.description}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">360-day history & forecast</h3>
          {loading ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : (
            <TimeSeriesChart
              seriesValues={series?.values ?? []}
              forecast={forecast}
              target={def.target}
              anomalies={anomalies}
            />
          )}
          {forecast && (
            <p className="mt-2 text-xs text-slate-500">
              Method: <span className="font-mono">{forecast.method}</span> · accuracy{" "}
              {forecast.accuracy.toFixed(1)}% (MAPE {forecast.mape.toFixed(1)}%)
            </p>
          )}
          {health && (
            <p className="text-xs text-slate-500">
              Current {fmtNum(health.currentValue)} {def.unit} · vs target {fmtPct(health.vsTargetPct)} ·
              status <span className="font-semibold">{health.status}</span>
            </p>
          )}
        </section>

        {forecast && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Forecast — next 12 months</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 font-normal">Period</th>
                  <th className="py-1 font-normal">p10</th>
                  <th className="py-1 font-normal">p50</th>
                  <th className="py-1 font-normal">p90</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="py-1 text-slate-600">{row.label}</td>
                    <td className="py-1">{fmtNum(row.p10)}</td>
                    <td className="py-1 font-medium">{fmtNum(row.p50)}</td>
                    <td className="py-1">{fmtNum(row.p90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Anomalies ({anomalies.length})</h3>
          {anomalies.length === 0 ? (
            <p className="text-xs text-slate-400">No anomalies detected.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {anomalies.map((a, i) => (
                <li key={i} className="rounded-lg bg-slate-50 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {a.type === "structural_break" ? "Structural break" : "Point anomaly"}
                    </span>
                    <span className="text-slate-400">{new Date(a.detectedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-1 text-slate-500">
                    value {fmtNum(a.value)} vs expected {fmtNum(a.expected)}
                    {a.zScore !== null ? ` · z=${a.zScore.toFixed(2)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Correlations</h3>
          {correlations.length === 0 ? (
            <p className="text-xs text-slate-400">No significant correlations (|r| &gt; 0.6) found.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs text-slate-600">
              {correlations.map((c, i) => {
                const other = c.metricA === def.key ? c.metricB : c.metricA;
                return (
                  <li key={i}>
                    Moves with <span className="font-semibold">{other}</span> (r={c.r.toFixed(2)})
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Causal hypotheses</h3>
          {causal.length === 0 ? (
            <p className="text-xs text-slate-400">
              No causal hypotheses involve this metric yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {causal.map((h, i) => (
                <li key={i} className="rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-xs text-indigo-900">
                  {h.interpretation}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Knowledge graph context</h3>
          {nodes.length === 0 ? (
            <p className="text-xs text-slate-400">No linked memory nodes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {nodes.map((n) => (
                <li key={n.id} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  <div className="font-semibold">{n.label}</div>
                  <div>{n.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root view
// ---------------------------------------------------------------------------

export default function MetricsView() {
  const [data, setData] = useState<MetricsApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const defsByKey = useMemo(() => {
    const map: Record<string, MetricDef> = {};
    for (const d of data?.metricDefs ?? []) map[d.key] = d;
    return map;
  }, [data]);

  if (error) {
    return <div className="p-8 text-sm text-red-600">Failed to load metrics: {error}</div>;
  }

  if (!data) {
    return <div className="p-8 text-sm text-slate-400">Loading metrics intelligence…</div>;
  }

  const topAlerts = [...data.alertQueue]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  const selectedDef = selectedKey ? defsByKey[selectedKey] : null;

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Metrics Intelligence OS</h1>
          <p className="text-sm text-slate-500">
            Forecasts, anomaly detection, correlations and composite domain scores.
          </p>
        </div>
        <span className="text-xs text-slate-400">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </span>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Active alerts
        </h2>
        {topAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">No active alerts. Everything looks nominal.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {topAlerts.map((a, i) => (
              <AlertCard key={i} alert={a} defs={defsByKey} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Domain composite scores
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.values(data.compositeScores).map((d) => (
            <div key={d.domain} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="font-mono text-[11px] uppercase text-slate-400">{d.domain}</div>
              <div className="text-xl font-semibold text-slate-800">{d.score.toFixed(0)}</div>
              <div className="text-[11px] text-slate-500">{d.trend}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Metrics ({data.metricDefs.length})
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.metricDefs.map((def) => (
            <MetricCard
              key={def.key}
              def={def}
              health={data.metricHealthMap[def.key]}
              recent={data.recentValues[def.key] ?? []}
              forecast={data.forecasts[def.key]}
              anomalies={data.anomalies.filter((a) => a.metricKey === def.key)}
              onClick={() => setSelectedKey(def.key)}
            />
          ))}
        </div>
      </section>

      {selectedDef && (
        <>
          <div
            className="fixed inset-0 z-20 bg-slate-900/20"
            onClick={() => setSelectedKey(null)}
          />
          <DetailPanel
            key={selectedDef.key}
            def={selectedDef}
            health={data.metricHealthMap[selectedDef.key]}
            forecast={data.forecasts[selectedDef.key]}
            anomalies={data.anomalies.filter((a) => a.metricKey === selectedDef.key)}
            correlations={data.correlationMatrix.significantPairs.filter(
              (p) => p.metricA === selectedDef.key || p.metricB === selectedDef.key,
            )}
            causal={data.causalHypotheses.filter(
              (h) => h.leadMetric === selectedDef.key || h.lagMetric === selectedDef.key,
            )}
            onClose={() => setSelectedKey(null)}
          />
        </>
      )}
    </main>
  );
}
