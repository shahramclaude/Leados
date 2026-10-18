"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineSVG, type LineSVGAnomaly } from "@/components/leados/charts/LineSVG";
import { SparklineSVG } from "@/components/leados/charts/SparklineSVG";
import { HeatmapSVG } from "@/components/leados/charts/HeatmapSVG";

// ---------------------------------------------------------------------------
// Types mirroring the API responses
// ---------------------------------------------------------------------------

interface MetricDefinition {
  id: number;
  key: string;
  displayName: string;
  domain: string;
  unit: string | null;
  description: string;
  formula: string | null;
  target: number | null;
  benchmark: number | null;
  benchmarkSource: string | null;
  isLeading: boolean;
  isLagging: boolean;
  tags: string[] | null;
  createdAt: string;
}

interface LatestMetric {
  value: number;
  createdAt: string;
  domain: string;
  note: string | null;
  unit: string | null;
  target: number | null;
  benchmark: number | null;
  isLeading: boolean | null;
}

interface MetricHealth {
  status: "green" | "yellow" | "red";
  trend: "up" | "flat" | "down";
  vsTarget: number;
  vsBenchmark: number;
  momentum: number;
  explanation: string;
}

interface SparkPoint {
  date: string;
  value: number;
}

interface MetricsResponse {
  definitions: MetricDefinition[];
  latest: Record<string, LatestMetric>;
  health: Record<string, MetricHealth>;
  sparklines: Record<string, SparkPoint[]>;
}

interface HistoryRow {
  id: number;
  key: string;
  value: number;
  domain: string;
  note: string | null;
  createdAt: string;
}

interface ForecastValue {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

interface ForecastResponse {
  values: ForecastValue[];
  method: "linear" | "exponential_smoothing" | "holt_winters";
  accuracy: number;
  cached?: boolean;
  error?: string;
}

interface Anomaly {
  key: string;
  at: string;
  value: number;
  expected: number;
  zScore: number;
  type: "point" | "structural_break";
  severity: number;
}

interface CorrelationPair {
  a: string;
  b: string;
  pearson: number;
  spearman: number;
  n: number;
  flagged: boolean;
}

interface CorrelationMatrix {
  keys: string[];
  pearson: number[][];
  spearman: number[][];
  pairs: CorrelationPair[];
}

interface AnalyticsResponse {
  anomalies: Anomaly[];
  correlations: CorrelationMatrix;
}

type TabKey = "overview" | "correlations" | "catalog";

const STATUS_STYLES: Record<MetricHealth["status"], { ring: string; bg: string; text: string; dot: string }> = {
  green: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  yellow: { ring: "ring-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  red: { ring: "ring-rose-200", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
};

const TREND_ARROW: Record<MetricHealth["trend"], string> = { up: "▲", flat: "▶", down: "▼" };
const TREND_COLOR: Record<MetricHealth["trend"], string> = {
  up: "text-emerald-600",
  flat: "text-slate-400",
  down: "text-rose-600",
};

function fmtValue(v: number, unit: string | null): string {
  const abs = Math.abs(v);
  const body = abs >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(2);
  if (!unit) return body;
  if (unit === "%" || unit === "$") return unit === "%" ? `${body}%` : `$${body}`;
  return `${body} ${unit}`;
}

function domainBadgeColor(domain: string): string {
  const palette: Record<string, string> = {
    finance: "bg-indigo-100 text-indigo-700",
    ops: "bg-slate-100 text-slate-700",
    product: "bg-sky-100 text-sky-700",
    people: "bg-fuchsia-100 text-fuchsia-700",
    sales: "bg-teal-100 text-teal-700",
    general: "bg-slate-100 text-slate-700",
  };
  return palette[domain] ?? "bg-slate-100 text-slate-700";
}

export default function MetricsView() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState("");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [horizon, setHorizon] = useState(30);
  const [detailLoading, setDetailLoading] = useState(false);

  // log-a-reading form
  const [logKey, setLogKey] = useState("");
  const [logValue, setLogValue] = useState("");
  const [logDomain, setLogDomain] = useState("finance");
  const [logNote, setLogNote] = useState("");
  const [logStatus, setLogStatus] = useState<string | null>(null);

  // add-a-metric-definition form
  const [defKey, setDefKey] = useState("");
  const [defName, setDefName] = useState("");
  const [defDomain, setDefDomain] = useState("finance");
  const [defUnit, setDefUnit] = useState("");
  const [defTarget, setDefTarget] = useState("");
  const [defBenchmark, setDefBenchmark] = useState("");
  const [defStatus, setDefStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [metricsRes, analyticsRes] = await Promise.all([
      fetch("/api/metrics", { cache: "no-store" }),
      fetch("/api/metrics/analytics", { cache: "no-store" }),
    ]);
    setData(await metricsRes.json());
    setAnalytics(await analyticsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data && !logKey) {
      const firstKey = data.definitions[0]?.key ?? Object.keys(data.latest)[0] ?? "";
      setLogKey(firstKey);
    }
  }, [data, logKey]);

  const keys = useMemo(() => Object.keys(data?.latest ?? {}).sort(), [data]);

  const displayName = useCallback(
    (key: string) => data?.definitions.find((d) => d.key === key)?.displayName ?? key,
    [data],
  );

  // Top 6: leading indicators first, then most recently updated.
  const topKeys = useMemo(() => {
    if (!data) return [];
    const withMeta = keys.map((k) => ({
      key: k,
      isLeading: data.latest[k]?.isLeading ?? false,
      createdAt: new Date(data.latest[k]?.createdAt ?? 0).getTime(),
    }));
    withMeta.sort((a, b) => Number(b.isLeading) - Number(a.isLeading) || b.createdAt - a.createdAt);
    return withMeta.slice(0, 6).map((m) => m.key);
  }, [data, keys]);

  async function expand(key: string, h = horizon) {
    if (expandedKey === key && h === horizon) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    setDetailLoading(true);
    const [histRes, fcRes] = await Promise.all([
      fetch(`/api/metrics/history/${encodeURIComponent(key)}`, { cache: "no-store" }),
      fetch(`/api/metrics/forecast/${encodeURIComponent(key)}?horizon=${h}`, { cache: "no-store" }),
    ]);
    setHistory(await histRes.json());
    setForecast(await fcRes.json());
    setDetailLoading(false);
  }

  async function changeHorizon(h: number) {
    setHorizon(h);
    if (expandedKey) {
      setDetailLoading(true);
      const fcRes = await fetch(`/api/metrics/forecast/${encodeURIComponent(expandedKey)}?horizon=${h}`, {
        cache: "no-store",
      });
      setForecast(await fcRes.json());
      setDetailLoading(false);
    }
  }

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    const finalKey = logKey.trim();
    if (!finalKey || logValue === "") return;
    await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: finalKey, value: Number(logValue), domain: logDomain, note: logNote }),
    });
    setLogValue("");
    setLogNote("");
    setLogStatus("Logged.");
    await load();
    if (expandedKey === finalKey) await expand(finalKey, horizon);
    setTimeout(() => setLogStatus(null), 2000);
  }

  async function submitDefinition(e: React.FormEvent) {
    e.preventDefault();
    if (!defKey.trim() || !defName.trim()) return;
    await fetch("/api/metrics/definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: defKey.trim(),
        displayName: defName.trim(),
        domain: defDomain,
        unit: defUnit || null,
        target: defTarget === "" ? null : Number(defTarget),
        benchmark: defBenchmark === "" ? null : Number(defBenchmark),
      }),
    });
    setDefKey("");
    setDefName("");
    setDefUnit("");
    setDefTarget("");
    setDefBenchmark("");
    setDefStatus("Metric added to catalog.");
    await load();
    setTimeout(() => setDefStatus(null), 2000);
  }

  const filteredDefinitions = useMemo(() => {
    const defs = data?.definitions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return defs;
    return defs.filter(
      (d) =>
        d.key.toLowerCase().includes(q) ||
        d.displayName.toLowerCase().includes(q) ||
        d.domain.toLowerCase().includes(q) ||
        (d.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const correlationLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const k of analytics?.correlations.keys ?? []) map[k] = displayName(k);
    return map;
  }, [analytics, displayName]);

  if (loading && !data) {
    return <div className="p-8 text-sm text-slate-500">Loading metrics…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Metrics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time business intelligence — every number carries a benchmark, a trend, a forecast, and the so-what.
        </p>
      </header>

      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium w-fit">
        {([
          ["overview", "Overview"],
          ["correlations", "Correlations"],
          ["catalog", "Catalog"],
        ] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 transition ${
              tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          {/* --- KPI strip ------------------------------------------------- */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Top KPIs</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {topKeys.map((key) => {
                const latest = data!.latest[key];
                const health = data!.health[key];
                const spark = data!.sparklines[key] ?? [];
                const styles = STATUS_STYLES[health?.status ?? "yellow"];
                const target = latest.target;
                const progressPct =
                  target != null && target !== 0 ? Math.max(0, Math.min(130, (latest.value / target) * 100)) : null;
                return (
                  <button
                    key={key}
                    onClick={() => expand(key)}
                    className={`flex flex-col rounded-2xl border-0 p-4 text-left ring-1 transition hover:shadow-md ${styles.bg} ${styles.ring} ${
                      expandedKey === key ? "shadow-md ring-2" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs font-semibold text-slate-600">{displayName(key)}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-900">{fmtValue(latest.value, latest.unit)}</div>
                    {progressPct != null && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${styles.dot}`}
                          style={{ width: `${Math.min(100, progressPct)}%` }}
                        />
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${TREND_COLOR[health?.trend ?? "flat"]}`}>
                        {TREND_ARROW[health?.trend ?? "flat"]} {Math.abs(health?.momentum ?? 0).toFixed(1)}%
                      </span>
                      {target != null && <span className="text-slate-400">tgt {fmtValue(target, latest.unit)}</span>}
                    </div>
                    <div className="mt-2">
                      <SparklineSVG
                        values={spark.map((s) => s.value)}
                        width={140}
                        height={28}
                        color={health?.status === "red" ? "#dc2626" : health?.status === "yellow" ? "#d97706" : "#059669"}
                      />
                    </div>
                  </button>
                );
              })}
              {topKeys.length === 0 && (
                <p className="col-span-full text-sm text-slate-400">
                  No metrics logged yet — add a reading below to get started.
                </p>
              )}
            </div>
          </section>

          {/* --- Metric detail ---------------------------------------------- */}
          {expandedKey && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{displayName(expandedKey)}</h3>
                  {data!.health[expandedKey] && (
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">{data!.health[expandedKey].explanation}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Forecast horizon</span>
                  {[14, 30, 90].map((h) => (
                    <button
                      key={h}
                      onClick={() => changeHorizon(h)}
                      className={`rounded-full px-3 py-1 font-medium ${
                        horizon === h ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {h}d
                    </button>
                  ))}
                </div>
              </div>

              {detailLoading ? (
                <div className="py-10 text-center text-sm text-slate-400">Crunching forecast…</div>
              ) : (
                <>
                  <div className="mt-4">
                    <LineSVG
                      history={history.map((h) => ({ date: h.createdAt, value: h.value }))}
                      forecast={forecast?.values ?? []}
                      anomalies={(analytics?.anomalies ?? [])
                        .filter((a) => a.key === expandedKey)
                        .map((a): LineSVGAnomaly => ({ at: a.at, value: a.value, type: a.type }))}
                      target={data!.latest[expandedKey]?.target ?? null}
                      benchmark={data!.latest[expandedKey]?.benchmark ?? null}
                      unit={data!.latest[expandedKey]?.unit ?? null}
                    />
                  </div>
                  {forecast && !forecast.error && (
                    <p className="mt-2 text-xs text-slate-400">
                      Forecast method: <span className="font-medium text-slate-600">{forecast.method}</span> · holdout
                      accuracy <span className="font-medium text-slate-600">{forecast.accuracy.toFixed(1)}%</span>
                      {forecast.cached ? " · cached" : ""}
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {/* --- Anomaly feed ------------------------------------------------ */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Anomaly feed</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {(analytics?.anomalies ?? []).length === 0 && (
                <p className="py-3 text-sm text-slate-400">No anomalies detected across any tracked metric.</p>
              )}
              {(analytics?.anomalies ?? []).slice(0, 15).map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span>{a.type === "structural_break" ? "🚨" : "⚠️"}</span>
                    <button className="font-medium text-slate-800 hover:underline" onClick={() => expand(a.key)}>
                      {displayName(a.key)}
                    </button>
                    <span className="text-slate-400">
                      {a.type === "structural_break" ? "structural break" : "point anomaly"} on{" "}
                      {new Date(a.at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">
                    value {a.value.toFixed(2)} vs expected {a.expected.toFixed(2)} (z={a.zScore.toFixed(2)})
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* --- Log a reading ---------------------------------------------- */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Log a metric reading</h2>
            <form onSubmit={submitLog} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                value={logKey}
                onChange={(e) => setLogKey(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {(data?.definitions ?? []).map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.displayName}
                  </option>
                ))}
                {!data?.definitions.length && <option value="">No metrics yet — add one in Catalog</option>}
              </select>
              <input
                type="number"
                step="any"
                required
                placeholder="Value"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={logDomain}
                onChange={(e) => setLogDomain(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {["finance", "ops", "product", "people", "sales", "general"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                placeholder="Note (optional)"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Log reading
              </button>
            </form>
            {logStatus && <p className="mt-2 text-xs text-emerald-600">{logStatus}</p>}
          </section>
        </>
      )}

      {tab === "correlations" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Metric correlations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pearson correlation of daily values, lower-triangle only. Cells outlined in black are flagged (|r| &gt; 0.7).
          </p>
          <div className="mt-4 overflow-x-auto">
            <HeatmapSVG
              keys={analytics?.correlations.keys ?? []}
              matrix={analytics?.correlations.pearson ?? []}
              labels={correlationLabels}
            />
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Strongest relationships</h3>
          <div className="mt-3 divide-y divide-slate-100">
            {(analytics?.correlations.pairs ?? []).filter((p) => p.n >= 3).slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {displayName(p.a)} ↔ {displayName(p.b)}
                </span>
                <span className={`font-mono text-xs ${p.flagged ? "font-bold text-slate-900" : "text-slate-400"}`}>
                  pearson {p.pearson.toFixed(2)} · spearman {p.spearman.toFixed(2)} · n={p.n}
                </span>
              </div>
            ))}
            {(analytics?.correlations.pairs ?? []).length === 0 && (
              <p className="py-3 text-sm text-slate-400">Log at least two metrics with overlapping dates to see correlations.</p>
            )}
          </div>
        </section>
      )}

      {tab === "catalog" && (
        <>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a metric</h2>
            <form onSubmit={submitDefinition} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <input
                placeholder="key (e.g. nrr)"
                required
                value={defKey}
                onChange={(e) => setDefKey(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Display name"
                required
                value={defName}
                onChange={(e) => setDefName(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={defDomain}
                onChange={(e) => setDefDomain(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {["finance", "ops", "product", "people", "sales", "general"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                placeholder="Unit (%, $, days...)"
                value={defUnit}
                onChange={(e) => setDefUnit(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="any"
                placeholder="Target"
                value={defTarget}
                onChange={(e) => setDefTarget(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="any"
                placeholder="Benchmark"
                value={defBenchmark}
                onChange={(e) => setDefBenchmark(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="col-span-full w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add to catalog
              </button>
            </form>
            {defStatus && <p className="mt-2 text-xs text-emerald-600">{defStatus}</p>}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Metric definitions catalog</h2>
              <input
                placeholder="Search key, name, domain, tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">Key</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Domain</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Benchmark</th>
                    <th className="py-2 pr-3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDefinitions.map((d) => (
                    <tr key={d.key} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{d.key}</td>
                      <td className="py-2 pr-3">
                        <button className="font-medium text-slate-800 hover:underline" onClick={() => expand(d.key)}>
                          {d.displayName}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${domainBadgeColor(d.domain)}`}>{d.domain}</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{d.unit ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-500">{d.target ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-500">{d.benchmark ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">
                        {d.isLeading ? "Leading" : d.isLagging ? "Lagging" : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredDefinitions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-400">
                        No metric definitions match “{search}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
