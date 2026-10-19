"use client";

import { useEffect, useState } from "react";
import type { MonteCarloRunwayResult, FundraisingReadiness } from "@/lib/financialIntel";

type FinancialApiResponse = {
  inputs: { cashBalance: number; burnRate: number; revenue: number; revenueGrowth: number };
  runway: MonteCarloRunwayResult;
  readiness: FundraisingReadiness;
};

export default function FinancialView() {
  const [data, setData] = useState<FinancialApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/financial")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading financial intelligence…</div>;

  const percentileRows: [string, number][] = [
    ["p5", data.runway.p5],
    ["p10", data.runway.p10],
    ["p25", data.runway.p25],
    ["p50", data.runway.p50],
    ["p75", data.runway.p75],
    ["p90", data.runway.p90],
    ["p95", data.runway.p95],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Financial Intelligence</h1>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Cash Balance</p>
          <p className="mt-1 text-xl font-semibold">${data.inputs.cashBalance.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Monthly Burn</p>
          <p className="mt-1 text-xl font-semibold">${data.inputs.burnRate.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Median Runway (Monte Carlo)</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{data.runway.p50RunwayMonths.toFixed(1)} mo</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Fundraising Readiness</p>
          <p className="mt-1 text-xl font-semibold text-indigo-400">{data.readiness.readinessScore.toFixed(0)}/100</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-300">Monte Carlo Runway Distribution ({data.runway.samples} paths)</h2>
        <div className="mt-3 flex items-end gap-2">
          {percentileRows.map(([label, value]) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-emerald-600" style={{ height: `${10 + Math.min(120, value * 4)}px` }} />
              <span className="text-[10px] text-slate-500">{label}</span>
              <span className="text-[10px] text-slate-400">{value.toFixed(1)}mo</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-300">Fundraising Readiness Breakdown</h2>
        <ul className="mt-3 space-y-2">
          {Object.entries(data.readiness.breakdown).map(([key, value]) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 text-slate-400">{key}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-indigo-500" style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
              <span className="w-10 text-right text-slate-400">{Math.round(value * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
