"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: string;
  name: string;
  company: string;
  stage: string;
  score: number;
  dealValue: string;
}

interface Forecast {
  id: string;
  leadId: string;
  period: string;
  stageAtForecast: string;
  scoreAtForecast: number;
  probability: string;
  dealValue: string;
  weightedValue: string;
  method: string;
  rationale: string;
  createdAt: string;
}

interface ForecastRow {
  forecast: Forecast;
  lead: Lead;
}

interface Summary {
  leadsForecast: number;
  totalDealValue: number;
  totalWeightedValue: number;
  byPeriod: Record<string, number>;
  byStage: Record<string, number>;
}

function fmtMoney(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ForecastPage() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  async function load() {
    setLoading(true);
    const [forecastsRes, summaryRes] = await Promise.all([
      fetch("/api/forecasts"),
      fetch("/api/forecasts/summary"),
    ]);
    const forecastsData = await forecastsRes.json();
    const summaryData = await summaryRes.json();
    setRows(forecastsData.forecasts ?? []);
    setSummary(summaryData);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function recomputeAll() {
    setRecomputing(true);
    await fetch("/api/forecasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await load();
    setRecomputing(false);
  }

  // Keep only the most recent forecast per lead for the table view.
  const latestByLead = new Map<string, ForecastRow>();
  for (const row of rows) {
    const existing = latestByLead.get(row.lead.id);
    if (!existing || row.forecast.createdAt > existing.forecast.createdAt) {
      latestByLead.set(row.lead.id, row);
    }
  }
  const latestRows = Array.from(latestByLead.values()).sort(
    (a, b) => Number(b.forecast.weightedValue) - Number(a.forecast.weightedValue),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">Part 59</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Pipeline forecasting &amp; revenue attribution
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Close probability is a transparent 50/50 blend of pipeline stage and the lead&apos;s
            deterministic score — never a black-box model. Each forecast is persisted and logged to the
            evidence ledger.
          </p>
        </div>
        <button
          onClick={recomputeAll}
          disabled={recomputing}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {recomputing ? "Recomputing…" : "Recompute all forecasts"}
        </button>
      </div>

      {summary && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Leads forecast" value={String(summary.leadsForecast)} />
          <SummaryCard label="Total deal value" value={fmtMoney(summary.totalDealValue)} />
          <SummaryCard label="Weighted pipeline value" value={fmtMoney(summary.totalWeightedValue)} accent />
        </div>
      )}

      {summary && Object.keys(summary.byStage).length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Weighted value by stage
          </h2>
          <div className="mt-3 space-y-2">
            {Object.entries(summary.byStage).map(([stage, value]) => (
              <div key={stage} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-700">{stage}</span>
                <span className="font-semibold text-slate-950">{fmtMoney(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading forecasts…</p>}
        {!loading && latestRows.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            No forecasts yet — add leads, then click &quot;Recompute all forecasts&quot;.
          </p>
        )}
        {latestRows.map(({ forecast, lead }) => (
          <div key={forecast.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-950">
                {lead.name} <span className="font-normal text-slate-500">· {lead.company}</span>
              </p>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                  {forecast.stageAtForecast}
                </span>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                  {Number(forecast.probability)}%
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>Deal value: {fmtMoney(Number(forecast.dealValue))}</span>
              <span>Weighted value: {fmtMoney(Number(forecast.weightedValue))}</span>
              <span>Period: {forecast.period}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{forecast.rationale}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        accent ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${accent ? "text-slate-300" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
