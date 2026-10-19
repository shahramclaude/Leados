"use client";
import React, { useEffect, useState } from "react";
import { GaugeRing, Histogram } from "@/components/ui/svgCharts";
import type { CapitalEfficiencyReport, FundraisingReadiness, RunwayReport, UnitEconomics } from "@/lib/types";
import type { FinanceSnapshotState } from "@/lib/eventBrain";

interface FinancialData {
  snapshot: FinanceSnapshotState | null;
  runway: RunwayReport;
  unitEconomics: UnitEconomics;
  capitalEfficiency: CapitalEfficiencyReport;
  fundraising: FundraisingReadiness;
  arrGrowthRate: number;
}

const HEALTH_COLOR: Record<string, string> = { healthy: "text-emerald-400", watch: "text-amber-400", critical: "text-rose-400" };

export function FinancialView() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [sim, setSim] = useState({ cash: 650000, monthlyBurn: 155000, arrGrowthRate: 0.02, newCustomers: 5 });
  const [simResult, setSimResult] = useState<{ runway: RunwayReport; unitEconomics: UnitEconomics; fundraising: FundraisingReadiness } | null>(null);

  useEffect(() => {
    fetch("/api/financial").then((r) => r.json()).then((d) => {
      if (d.snapshot) {
        setData(d);
        setSim({ cash: d.snapshot.cash, monthlyBurn: d.snapshot.monthlyBurn, arrGrowthRate: d.arrGrowthRate, newCustomers: d.snapshot.newCustomers });
      }
    });
  }, []);

  async function runSimulation(next: typeof sim) {
    setSim(next);
    const r = await fetch("/api/financial/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    setSimResult(await r.json());
  }

  if (!data) return <div className="text-sm text-slate-500">No finance.snapshot events recorded yet.</div>;

  const active = simResult ?? { runway: data.runway, unitEconomics: data.unitEconomics, fundraising: data.fundraising };

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Financial Intelligence</h1>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Runway — Monte Carlo (Box-Muller GBM, n={active.runway.monteCarlo.n})</div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <Histogram
              data={active.runway.monteCarlo.histogram}
              annotations={[
                { label: "p10", value: active.runway.monteCarlo.p10, color: "#38bdf8" },
                { label: "p50", value: active.runway.monteCarlo.p50, color: "#f472b6" },
                { label: "p90", value: active.runway.monteCarlo.p90, color: "#38bdf8" },
              ]}
            />
            <div className="mt-1 text-xs text-slate-500">Months to zero cash. Bankruptcy risk (≤1mo): {Math.round(active.runway.bankruptcyRisk * 100)}%</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">5 sample GBM cash paths</div>
            <svg width={320} height={140}>
              {active.runway.paths.map((p, i) => {
                const maxCash = Math.max(...p.cash, 1);
                const pts = p.cash.map((c, j) => `${(j / Math.max(1, p.cash.length - 1)) * 320},${140 - (c / maxCash) * 130}`).join(" ");
                return <polyline key={i} points={pts} fill="none" stroke={`hsl(${200 + i * 30},70%,60%)`} strokeWidth={1.5} opacity={0.8} />;
              })}
            </svg>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Unit Economics</div>
          <table className="w-full text-xs">
            <tbody>
              <Row label="LTV" value={`$${Math.round(active.unitEconomics.ltv).toLocaleString()}`} />
              <Row label="CAC" value={`$${Math.round(active.unitEconomics.cac).toLocaleString()}`} />
              <Row label="LTV:CAC" value={`${active.unitEconomics.ltvCacRatio.toFixed(1)}x`} />
              <Row label="Gross Margin" value={`${Math.round(active.unitEconomics.grossMargin * 100)}%`} />
              <Row label="Payback Period" value={`${active.unitEconomics.paybackPeriodMonths.toFixed(1)} mo`} />
            </tbody>
          </table>
          <div className={`mt-2 text-xs font-semibold uppercase ${HEALTH_COLOR[active.unitEconomics.health]}`}>{active.unitEconomics.health}</div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Capital Efficiency</div>
          <div className="flex items-center gap-4">
            <GaugeRing value={data.capitalEfficiency.score} color="#a78bfa" label="score / 100" />
            <div>
              <div className="text-lg font-bold capitalize text-slate-100">{data.capitalEfficiency.overallRating}</div>
              <div className="text-xs text-slate-500">burn multiple {data.capitalEfficiency.burnMultiple.toFixed(2)}x</div>
            </div>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
            {data.capitalEfficiency.narrativeBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Fundraising Readiness</div>
        <div className="flex flex-wrap items-center gap-4">
          <GaugeRing value={active.fundraising.score} color="#34d399" label="readiness" />
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${
              active.fundraising.raiseNowOrWait === "raise_now" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : active.fundraising.raiseNowOrWait === "urgent" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            {active.fundraising.raiseNowOrWait.replace("_", " ")}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-400">Strengths</div>
            <ul className="list-disc pl-4 text-xs text-slate-300">
              {active.fundraising.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-rose-400">Weaknesses</div>
            <ul className="list-disc pl-4 text-xs text-slate-300">
              {active.fundraising.weaknesses.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">What-If Simulator</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumInput label="Cash ($)" value={sim.cash} onChange={(v) => runSimulation({ ...sim, cash: v })} />
          <NumInput label="Monthly Burn ($)" value={sim.monthlyBurn} onChange={(v) => runSimulation({ ...sim, monthlyBurn: v })} />
          <NumInput label="ARR Growth Rate" value={sim.arrGrowthRate} step={0.01} onChange={(v) => runSimulation({ ...sim, arrGrowthRate: v })} />
          <NumInput label="New Customers / mo" value={sim.newCustomers} onChange={(v) => runSimulation({ ...sim, newCustomers: v })} />
        </div>
        {simResult && <div className="mt-2 text-[11px] text-slate-500">Recalculated: median runway {simResult.runway.monteCarlo.p50.toFixed(1)} months, LTV:CAC {simResult.unitEconomics.ltvCacRatio.toFixed(1)}x.</div>}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-800/60">
      <td className="py-1 text-slate-500">{label}</td>
      <td className="py-1 text-right font-semibold text-slate-200">{value}</td>
    </tr>
  );
}

function NumInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        type="number"
        step={step}
        defaultValue={value}
        onBlur={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500"
      />
    </label>
  );
}
