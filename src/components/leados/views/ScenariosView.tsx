"use client";

import { useState, type ReactNode } from "react";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { useAppContext } from "@/lib/AppContext";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface ScenarioRow {
  id: number;
  name: string;
  assumptions: Record<string, number>;
  results: Record<string, number>;
  createdAt: string;
}

export default function ScenariosView() {
  const { toast } = useAppContext();
  const { data: scenarios, setData } = useFetchResource<ScenarioRow[]>("/api/scenarios");
  const [name, setName] = useState("");
  const [startingCash, setStartingCash] = useState(1500000);
  const [monthlyBurn, setMonthlyBurn] = useState(120000);
  const [monthlyRevenue, setMonthlyRevenue] = useState(40000);
  const [revenueGrowthRate, setRevenueGrowthRate] = useState(4);
  const [burnVolatility, setBurnVolatility] = useState(10);
  const [months, setMonths] = useState(18);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim() === "") {
      setError("Scenario name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await postJson<ScenarioRow>("/api/scenarios", {
        name,
        assumptions: {
          startingCash,
          monthlyBurn,
          monthlyRevenue,
          revenueGrowthRate: revenueGrowthRate / 100,
          burnVolatility: burnVolatility / 100,
          months,
        },
      });
      setData((prev) => (prev ? [created, ...prev] : [created]));
      toast("Scenario simulated", 1);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scenario");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Scenarios</h1>
        <p className="text-sm text-slate-500">Monte Carlo runway projections (Box–Muller sampled burn volatility).</p>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Scenario name"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
          <Field label="Starting cash ($)"><input type="number" value={startingCash} onChange={(e) => setStartingCash(Number(e.target.value))} className="input" /></Field>
          <Field label="Monthly burn ($)"><input type="number" value={monthlyBurn} onChange={(e) => setMonthlyBurn(Number(e.target.value))} className="input" /></Field>
          <Field label="Monthly revenue ($)"><input type="number" value={monthlyRevenue} onChange={(e) => setMonthlyRevenue(Number(e.target.value))} className="input" /></Field>
          <Field label="Revenue growth (%/mo)"><input type="number" value={revenueGrowthRate} onChange={(e) => setRevenueGrowthRate(Number(e.target.value))} className="input" /></Field>
          <Field label="Burn volatility (%)"><input type="number" value={burnVolatility} onChange={(e) => setBurnVolatility(Number(e.target.value))} className="input" /></Field>
          <Field label="Horizon (months)"><input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="input" /></Field>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <button disabled={submitting} onClick={() => void submit()} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
          {submitting ? "Simulating 2,000 runs…" : "Run simulation"}
        </button>
      </div>

      {!scenarios ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {scenarios.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="font-medium text-slate-100">{s.name}</p>
              <p className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <p>Projected runway: <span className="text-slate-100">{s.results.projectedRunwayMonths}mo</span></p>
                <p>P10 / P90: <span className="text-slate-100">{s.results.runwayP10} / {s.results.runwayP90}mo</span></p>
                <p>P(cash-out in horizon): <span className="text-slate-100">{Math.round((s.results.probabilityOfRunningOutWithinHorizon ?? 0) * 100)}%</span></p>
                <p>Simulations: <span className="text-slate-100">{s.results.simulations}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`.input { width: 100%; border-radius: 0.5rem; border: 1px solid #1e293b; background: rgba(2,6,23,0.5); padding: 0.4rem 0.6rem; font-size: 0.8rem; color: #f1f5f9; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}
