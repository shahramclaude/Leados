import type { AppState } from "../lib/types";
import { detectCompoundEffects } from "../lib/compoundIntel";
import { lifeStageSignal } from "../lib/lifeStage";
import { stakeholderSignal } from "../lib/stakeholders";
import { realOptionsSignal } from "../lib/realOptions";
import { executivePresenceSignal } from "../lib/executivePresence";
import { innovationPortfolioSignal } from "../lib/innovationPortfolio";
import { changeManagementSignal } from "../lib/changeManagement";
import { competitiveIntelSignal } from "../lib/competitiveIntel";
import { orgDesignSignal } from "../lib/orgDesign";
import { wargameSignal } from "../lib/wargame";
import { Card, Stat, Badge } from "./ui";
import { useMemo } from "react";

export function CompoundIntelView({ state }: { state: AppState }) {
  const signals = useMemo(
    () => [
      { key: "lifeStage", label: "Life Stage Maturity", value: lifeStageSignal(state.lifeStage) },
      { key: "stakeholders", label: "Stakeholder Alignment", value: stakeholderSignal(state.stakeholders) },
      { key: "realOptions", label: "Strategic Optionality", value: realOptionsSignal(state.realOptions) },
      { key: "execPresence", label: "Executive Presence", value: executivePresenceSignal(state.executivePresence) },
      { key: "innovation", label: "Innovation Balance", value: innovationPortfolioSignal(state.initiatives) },
      { key: "change", label: "Change Readiness", value: changeManagementSignal(state.adkar) },
      { key: "competitive", label: "Competitive Position", value: competitiveIntelSignal(state.competitors) },
      { key: "orgDesign", label: "Org Design Efficiency", value: orgDesignSignal(state.orgDesign) },
      { key: "wargame", label: "Strategic Position", value: wargameSignal(state.wargame.ourPosture, state.wargame.competitorArchetype, state.wargame.marketVolatility) },
    ],
    [state]
  );

  const result = useMemo(() => detectCompoundEffects(signals), [signals]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compound Intelligence</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/compound_intel.js</code> (pt-P spec) → implemented as <code>src/lib/compoundIntel.ts</code>. Disclosed
          heuristic: any two dimensions both ≥ 68/100 are flagged "compounding"; one dimension ≤ 35/100 next to one ≥ 68/100
          is flagged "fragility". This is an original convention, not a validated organizational-science formula.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat label="Compounding pairs" value={result.compoundingCount} tone="emerald" /></Card>
        <Card><Stat label="Fragility pairs" value={result.fragilityCount} tone="rose" /></Card>
        <Card><Stat label="Net compound index" value={result.netCompoundIndex} tone={result.netCompoundIndex >= 0 ? "emerald" : "rose"} /></Card>
      </div>

      <Card title="All pairwise interactions" subtitle={`${signals.length} dimensions → ${result.pairs.length} pairs evaluated`}>
        <div className="space-y-2">
          {result.pairs.map((p, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div>
                <div className="font-medium text-slate-700">
                  {p.a} ({Math.round(p.aValue)}) × {p.b} ({Math.round(p.bValue)})
                </div>
                <div className="text-xs text-slate-500">{p.note}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={p.type === "compounding" ? "emerald" : p.type === "fragility" ? "rose" : "slate"}>{p.type}</Badge>
                <span className="tabular-nums text-xs text-slate-400">{p.effect > 0 ? "+" : ""}{p.effect}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
