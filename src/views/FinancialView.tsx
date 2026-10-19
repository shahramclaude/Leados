"use client";

import { useAppContext } from "@/lib/AppContext";
import { Card, EmptyPanel, ErrorPanel, LoadingPanel, SevBadge, ViewHeader } from "@/components/ui";

export default function FinancialView() {
  const { result, error } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const decisions = result.decisions.filter((d) => d.domain === "financial" && d.status === "open");
  const scenarios = result.scenarios.filter((s) => s.domain === "financial" && s.status === "active");
  const okrs = result.okrs.filter((o) => o.domain === "financial");

  return (
    <div className="space-y-6">
      <ViewHeader title="Financial" subtitle="Runway simulation, financial decisions, and OKRs." />

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Runway (Monte Carlo, 1,000 trials)</p>
        {result.monteCarlo ? (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-mono text-2xl text-red-400">{result.monteCarlo.p10.toFixed(1)}</p>
              <p className="text-xs text-slate-500">p10 months</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-slate-100">{result.monteCarlo.p50.toFixed(1)}</p>
              <p className="text-xs text-slate-500">p50 months</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-emerald-400">{result.monteCarlo.p90.toFixed(1)}</p>
              <p className="text-xs text-slate-500">p90 months</p>
            </div>
          </div>
        ) : (
          <EmptyPanel message="No finance snapshot recorded." />
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">OKRs</p>
        {okrs.length === 0 && <EmptyPanel message="No financial OKRs." />}
        <ul className="space-y-2">
          {okrs.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-200">{o.title}</p>
              <span className="text-xs font-mono uppercase text-slate-400">{o.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Open decisions</p>
        {decisions.length === 0 && <EmptyPanel message="No open financial decisions." />}
        <ul className="divide-y divide-slate-800">
          {decisions.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-200">{d.title}</span>
              <SevBadge sev={d.sev} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Active scenarios</p>
        {scenarios.length === 0 && <EmptyPanel message="No active financial scenarios." />}
        <ul className="divide-y divide-slate-800">
          {scenarios.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-200">{s.title}</span>
              <SevBadge sev={s.sev} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
