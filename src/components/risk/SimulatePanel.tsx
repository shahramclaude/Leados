"use client";

import { useState } from "react";
import type { LossSummary } from "@/lib/montecarlo";

function fmt(n: number, currency: string | null) {
  if (currency) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  }
  return n.toFixed(2);
}

export function SimulatePanel({ riskId }: { riskId: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inherent: LossSummary; residual: LossSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/risks/${riskId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trials: 20000 }),
      });
      if (!res.ok) throw new Error(`simulation failed (${res.status})`);
      const data = await res.json();
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-950">Annualized loss distribution (Monte Carlo)</h3>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Simulating..." : "Run 20,000-trial simulation"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <LossTable title="Inherent (before controls)" summary={result.inherent} />
          <LossTable title="Residual (after controls)" summary={result.residual} />
        </div>
      )}
      {!result && !error && (
        <p className="mt-3 text-sm text-slate-500">
          Run the simulation to see inherent vs residual VaR/TVaR percentiles with Monte Carlo standard-error
          disclosure.
        </p>
      )}
    </div>
  );
}

function LossTable({ title, summary }: { title: string; summary: LossSummary }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <h4 className="font-medium text-slate-900">{title}</h4>
      {summary.nonFinancialNote && (
        <p className="mt-1 text-xs italic text-amber-700">{summary.nonFinancialNote}</p>
      )}
      <dl className="mt-2 space-y-1 text-sm text-slate-700">
        <Row label="P(any loss this year)" value={`${(summary.probabilityOfAnyLoss * 100).toFixed(1)}%`} />
        <Row label="Mean" value={fmt(summary.mean, summary.currency)} />
        <Row label="P50" value={fmt(summary.p50, summary.currency)} />
        <Row label="P90" value={fmt(summary.p90, summary.currency)} />
        <Row label="VaR95" value={fmt(summary.p95, summary.currency)} />
        <Row label="VaR99" value={fmt(summary.p99, summary.currency)} />
        <Row label="TVaR95 (expected shortfall)" value={fmt(summary.tvar95, summary.currency)} />
        <Row label="TVaR99 (expected shortfall)" value={fmt(summary.tvar99, summary.currency)} />
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {summary.trials.toLocaleString()} trials · VaR95 Monte Carlo SE ≈ {fmt(summary.p95StandardError, summary.currency)}
        {" "}(wider than this near the tail — treat percentiles as indicative, not exact).
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
