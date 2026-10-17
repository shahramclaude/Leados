import type { AppState } from "../lib/types";
import { computeCompetitiveIntel } from "../lib/competitiveIntel";
import { Card, Stat, Badge, Bar } from "./ui";
import { useMemo } from "react";

export function CompetitiveIntelView({ state }: { state: AppState }) {
  const result = useMemo(() => computeCompetitiveIntel(state.competitors), [state.competitors]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Competitive Intelligence Aggregator</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/competitive_intel.js</code> (pt-O spec) → <code>src/lib/competitiveIntel.ts</code>. All competitor
          names and signals are synthetic and disclosed-fabricated — no real company data is used or implied.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><Stat label="Market heat (aggregate aggression)" value={result.marketHeat} tone={result.marketHeat >= 60 ? "rose" : "amber"} /></Card>
        <Card><Stat label="Top threat" value={result.topThreat?.name} tone="rose" /></Card>
      </div>

      <Card title="Ranked by threat score">
        <div className="space-y-4">
          {result.ranked.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{c.name} <span className="font-normal capitalize text-slate-400">({c.archetype})</span></span>
                <div className="flex items-center gap-2">
                  <Badge tone={c.trend === "rising" ? "rose" : c.trend === "cooling" ? "emerald" : "amber"}>{c.trend}</Badge>
                  <span className="tabular-nums font-semibold">{c.threatScore}</span>
                </div>
              </div>
              <Bar value={c.threatScore} tone={c.threatScore >= 60 ? "rose" : c.threatScore >= 35 ? "amber" : "emerald"} />
              <div className="mt-1 text-xs text-slate-400">
                pricing {c.pricingAggression} · hiring {c.hiringVelocity} · product velocity {c.productVelocity} · sentiment {c.sentiment > 0 ? "+" : ""}{c.sentiment}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
