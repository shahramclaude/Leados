import type { AppState } from "../lib/types";
import { computeInnovationPortfolio } from "../lib/innovationPortfolio";
import { Card, Stat, Bar, Badge } from "./ui";
import { useMemo } from "react";

export function InnovationPortfolioView({ state }: { state: AppState }) {
  const result = useMemo(() => computeInnovationPortfolio(state.initiatives), [state.initiatives]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Three-Horizons Innovation Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/innovation_portfolio.js</code> (pt-O spec) → <code>src/lib/innovationPortfolio.ts</code>. McKinsey Three
          Horizons framework (Baghai, Coley & White, 2000); ~70/20/10 target band used as a reference, not a hard rule.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat label="Total investment" value={`$${result.totalInvestment}k`} /></Card>
        <Card><Stat label="Imbalance score" value={result.imbalanceScore} tone={result.imbalanceScore < 10 ? "emerald" : "amber"} /></Card>
        <Card><Stat label="Blended ROI" value={`${result.blendedRoi}%`} tone={result.blendedRoi >= 0 ? "emerald" : "rose"} /></Card>
      </div>

      <Card title="Allocation vs target">
        <div className="space-y-4">
          {result.horizons.map((h) => (
            <div key={h.horizon}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{h.label}</span>
                <span className="text-xs text-slate-400">{h.allocationPct}% actual · {h.targetPct}% target · {h.count} initiatives</span>
              </div>
              <Bar value={h.allocationPct} tone={Math.abs(h.allocationPct - h.targetPct) < 10 ? "emerald" : "amber"} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Verdict"><Badge tone={result.imbalanceScore < 10 ? "emerald" : "amber"}>{result.verdict}</Badge></Card>

      <Card title="Initiative catalog">
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr><th className="p-2 text-left">Initiative</th><th className="p-2 text-center">Horizon</th><th className="p-2 text-right">Investment</th><th className="p-2 text-right">Exp. return</th><th className="p-2 text-right">Risk</th></tr>
            </thead>
            <tbody>
              {state.initiatives.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="p-2">{i.name}</td>
                  <td className="p-2 text-center">H{i.horizon}</td>
                  <td className="p-2 text-right tabular-nums">${i.investment}k</td>
                  <td className="p-2 text-right tabular-nums">${i.expectedReturn}k</td>
                  <td className="p-2 text-right tabular-nums">{i.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
