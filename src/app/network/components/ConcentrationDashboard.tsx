"use client";

import { useEffect, useState } from "react";
import { getJson } from "../lib/api";

type Dimension = "spend" | "revenue" | "skill" | "partner";

interface ConcentrationResponse {
  dimension: string;
  period: string;
  capability: string | null;
  hhi: number;
  topShare: number;
  band: "low" | "moderate" | "high";
  shares: { key: string; share: number; name: string }[];
  alertFired: { message: string; severity: string } | null;
  trend: { period: string; hhi: number; topShare: number; computedAt: string }[];
}

const BAND_STYLES: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-100 text-amber-800 border-amber-300",
  high: "bg-red-100 text-red-800 border-red-300",
};

export function ConcentrationDashboard() {
  const [dimension, setDimension] = useState<Dimension>("spend");
  const [period, setPeriod] = useState("2026-Q1");
  const [capability, setCapability] = useState("Kubernetes Infra Ops");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [data, setData] = useState<ConcentrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJson<{ capabilities: string[] }>("/api/network/metrics/bus-factor")
      .then((r) => setCapabilities(r.capabilities))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ dimension, period });
    if (dimension === "skill") params.set("capability", capability);
    getJson<ConcentrationResponse>(`/api/network/metrics/concentration?${params.toString()}`)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load concentration data"))
      .finally(() => setLoading(false));
  }, [dimension, period, capability]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col text-sm">
          <span className="font-medium text-slate-700">Dimension</span>
          <select
            className="mt-1 rounded-md border border-slate-300 px-2 py-1"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as Dimension)}
          >
            <option value="spend">Spend (by partner)</option>
            <option value="revenue">Revenue (by customer)</option>
            <option value="skill">Skill coverage (by capability)</option>
            <option value="partner">Partner relationship share</option>
          </select>
        </label>

        {dimension === "skill" && (
          <label className="flex flex-col text-sm">
            <span className="font-medium text-slate-700">Capability</span>
            <select
              className="mt-1 rounded-md border border-slate-300 px-2 py-1"
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
            >
              {capabilities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        {(dimension === "spend" || dimension === "revenue") && (
          <label className="flex flex-col text-sm">
            <span className="font-medium text-slate-700">Period</span>
            <input
              className="mt-1 rounded-md border border-slate-300 px-2 py-1"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
        )}
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading && <p aria-live="polite">Computing HHI…</p>}

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">HHI (Σ sᵢ²)</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{data.hhi.toFixed(4)}</p>
            <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${BAND_STYLES[data.band]}`}>
              {data.band} concentration
            </span>
            <p className="mt-2 text-xs text-slate-500">
              Thresholds: &lt;0.15 low · 0.15–0.25 moderate · &gt;0.25 high (internal risk bands, adapted from
              antitrust practice — not a legal determination).
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Top share</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{(data.topShare * 100).toFixed(1)}%</p>
            <p className="mt-2 text-xs text-slate-500">Largest single entity&apos;s share of this dimension.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Alert status</p>
            {data.alertFired ? (
              <p className="mt-1 text-sm font-medium text-red-700">{data.alertFired.message}</p>
            ) : (
              <p className="mt-1 text-sm text-emerald-700">No threshold breach on this run.</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 md:col-span-3">
            <h3 className="text-sm font-semibold text-slate-800">Shares breakdown</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-1">Entity</th>
                  <th scope="col" className="py-1">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.shares.map((s) => (
                  <tr key={s.key} className="border-t border-slate-100">
                    <td className="py-1">{s.name}</td>
                    <td className="py-1">{(s.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-3">
            <h3 className="text-sm font-semibold text-slate-800">HHI trend (this dimension)</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {data.trend.map((t, i) => (
                <li key={i}>
                  {t.period}: HHI {t.hhi.toFixed(4)}, top share {(t.topShare * 100).toFixed(1)}% (computed{" "}
                  {new Date(t.computedAt).toLocaleString()})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
