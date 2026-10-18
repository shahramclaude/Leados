"use client";

import { useCallback, useEffect, useState } from "react";

interface MetricLatest {
  value: number;
  createdAt: string;
  domain: string;
  note: string | null;
}

interface MetricReading {
  id: number;
  key: string;
  value: number;
  domain: string;
  note: string | null;
  createdAt: string;
}

type Direction = "higher-is-better" | "lower-is-better";

interface MetricConfig {
  key: string;
  label: string;
  domain: string;
  unit: string;
  direction: Direction;
  good: number; // threshold where value is "on target"
  critical: number; // threshold where value is critical
  thresholdLabel: string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  { key: "runway_months", label: "Runway", domain: "finance", unit: "mo", direction: "higher-is-better", good: 12, critical: 6, thresholdLabel: "Target: ≥12mo" },
  { key: "mrr_growth_pct", label: "MRR Growth", domain: "finance", unit: "%", direction: "higher-is-better", good: 0, critical: -10, thresholdLabel: "Target: ≥0%" },
  { key: "pipeline_coverage_x", label: "Pipeline Coverage", domain: "sales", unit: "×", direction: "higher-is-better", good: 3, critical: 1.5, thresholdLabel: "Target: ≥3×" },
  { key: "win_rate_pct", label: "Win Rate", domain: "sales", unit: "%", direction: "higher-is-better", good: 30, critical: 20, thresholdLabel: "Target: ≥30%" },
  { key: "churn_pct", label: "Churn", domain: "sales", unit: "%", direction: "lower-is-better", good: 2, critical: 5, thresholdLabel: "Threshold: <2%" },
  { key: "ltv_cac", label: "LTV:CAC", domain: "finance", unit: "×", direction: "higher-is-better", good: 3, critical: 1, thresholdLabel: "Target: ≥3×" },
  { key: "deploy_freq_delta_pct", label: "Deploy Freq Δ", domain: "ops", unit: "%", direction: "higher-is-better", good: -30, critical: -50, thresholdLabel: "Threshold: ≥-30%" },
  { key: "nps", label: "NPS", domain: "sales", unit: "", direction: "higher-is-better", good: 30, critical: 0, thresholdLabel: "Target: ≥30" },
  { key: "headcount", label: "Headcount", domain: "people", unit: "", direction: "higher-is-better", good: 0, critical: -1, thresholdLabel: "Informational" },
];

const DOMAIN_COLOR: Record<string, string> = {
  people: "bg-sky-500",
  finance: "bg-amber-500",
  sales: "bg-emerald-500",
  ops: "bg-fuchsia-500",
  strategy: "bg-indigo-500",
};

function statusOf(cfg: MetricConfig, value: number): "good" | "warn" | "critical" {
  if (cfg.key === "headcount") return "good";
  if (cfg.direction === "higher-is-better") {
    if (value < cfg.critical) return "critical";
    if (value < cfg.good) return "warn";
    return "good";
  }
  if (value > cfg.critical) return "critical";
  if (value > cfg.good) return "warn";
  return "good";
}

const STATUS_TEXT: Record<string, string> = {
  good: "text-emerald-300",
  warn: "text-amber-300",
  critical: "text-rose-300",
};

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function HistoryChart({ readings, cfg }: { readings: MetricReading[]; cfg: MetricConfig }) {
  const width = 300;
  const height = 80;
  const pad = 8;
  if (readings.length === 0) return <p className="text-xs text-slate-500">No history yet.</p>;

  const values = readings.map((r) => r.value);
  const min = Math.min(...values, cfg.critical, cfg.good);
  const max = Math.max(...values, cfg.critical, cfg.good);
  const range = max - min || 1;

  const x = (i: number) => pad + (i / Math.max(1, readings.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  const path = readings.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(" ");
  const thresholdY = y(cfg.good);

  return (
    <svg width={width} height={height} className="mt-2 rounded bg-slate-950">
      <line x1={pad} x2={width - pad} y1={thresholdY} y2={thresholdY} stroke="#f43f5e" strokeDasharray="4 3" strokeWidth={1} />
      <path d={path} fill="none" stroke="#818cf8" strokeWidth={1.5} />
      {readings.map((r, i) => {
        const st = statusOf(cfg, r.value);
        return (
          <circle
            key={r.id}
            cx={x(i)}
            cy={y(r.value)}
            r={2.5}
            fill={st === "good" ? "#34d399" : st === "warn" ? "#fbbf24" : "#fb7185"}
          />
        );
      })}
    </svg>
  );
}

export default function MetricsView({ onChanged }: { onChanged: () => void }) {
  const [latest, setLatest] = useState<Record<string, MetricLatest>>({});
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<MetricReading[]>([]);

  const [key, setKey] = useState(METRIC_CONFIGS[0].key);
  const [customKey, setCustomKey] = useState("");
  const [value, setValue] = useState("");
  const [domain, setDomain] = useState("finance");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/metrics", { cache: "no-store" });
    setLatest(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function expand(k: string) {
    if (expandedKey === k) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(k);
    const res = await fetch(`/api/metrics/history/${k}`, { cache: "no-store" });
    setHistory(await res.json());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalKey = key === "other" ? customKey.trim() : key;
    if (!finalKey || value === "") return;
    await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: finalKey, value: Number(value), domain, note }),
    });
    setValue("");
    setNote("");
    setStatus("Logged.");
    await load();
    onChanged();
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-white">Metrics</h2>
      <p className="mb-6 text-sm text-slate-400">Business health indicators that feed the intelligence engine.</p>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {METRIC_CONFIGS.map((cfg) => {
            const m = latest[cfg.key];
            const st = m ? statusOf(cfg, m.value) : "warn";
            return (
              <button
                key={cfg.key}
                onClick={() => expand(cfg.key)}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left hover:border-slate-700"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${DOMAIN_COLOR[cfg.domain]}`} />
                  <span className="text-xs font-semibold text-slate-300">{cfg.label}</span>
                </div>
                <p className={`mt-2 text-2xl font-bold ${m ? STATUS_TEXT[st] : "text-slate-600"}`}>
                  {m ? `${m.value}${cfg.unit}` : "—"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{cfg.thresholdLabel}</p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {m ? `${daysSince(m.createdAt)}d since last entry` : "no data yet"}
                </p>

                {expandedKey === cfg.key && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <HistoryChart readings={history} cfg={cfg} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Log a metric reading</h3>
      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div>
          <label className="block text-xs text-slate-500">Metric key</label>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            {METRIC_CONFIGS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.key})
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
        </div>
        {key === "other" && (
          <div>
            <label className="block text-xs text-slate-500">Custom key</label>
            <input
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
              placeholder="e.g. cash_buffer_months"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500">Value</label>
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            {["finance", "sales", "ops", "people", "strategy"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          />
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Log metric
        </button>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </form>
    </div>
  );
}
