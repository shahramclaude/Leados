import type { AppState } from "../lib/types";
import { computeOrgDesign } from "../lib/orgDesign";
import { Card, Stat, Badge, Slider } from "./ui";
import { useMemo } from "react";

export function OrgDesignView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(() => computeOrgDesign(state.orgDesign), [state.orgDesign]);
  const update = (patch: Partial<AppState["orgDesign"]>) => setState((s) => ({ ...s, orgDesign: { ...s.orgDesign, ...patch } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizational Design Simulation</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/org_design.js</code> (pt-O spec) → <code>src/lib/orgDesign.ts</code>. Uses Graicunas' (1933) real
          relationship-count formula; coordination-cost and latency heuristics are original and disclosed as such.
        </p>
      </div>

      <Card title="Structure inputs">
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="Headcount" value={state.orgDesign.headcount} min={20} max={2000} step={10} onChange={(v) => update({ headcount: v })} />
          <Slider label="Layers" value={state.orgDesign.layers} min={1} max={10} onChange={(v) => update({ layers: v })} />
          <Slider label="Average span of control" value={state.orgDesign.avgSpan} min={2} max={15} onChange={(v) => update({ avgSpan: v })} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><Stat label="Efficiency score" value={result.efficiencyScore} tone={result.efficiencyScore >= 65 ? "emerald" : "amber"} /></Card>
        <Card><Stat label="Coordination cost" value={result.coordinationCost} tone={result.coordinationCost <= 40 ? "emerald" : "rose"} /></Card>
        <Card><Stat label="Decision latency (days)" value={result.decisionLatencyDays} /></Card>
        <Card><Stat label="Est. managers" value={result.estimatedManagers} /></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Span of control fit">
          <div className="flex items-center gap-2">
            <Badge tone={result.spanFit === "ideal" ? "emerald" : "amber"}>{result.spanFit}</Badge>
            <span className="text-sm text-slate-500">ideal band: {result.idealSpanBand[0]}–{result.idealSpanBand[1]}</span>
          </div>
        </Card>
        <Card title="Graicunas relationships (capped span ≤12)" subtitle="Superior-subordinate relationship permutations, Graicunas 1933">
          <div className="text-2xl font-semibold tabular-nums">{result.graicunasRelationships.toLocaleString()}</div>
        </Card>
      </div>
    </div>
  );
}
