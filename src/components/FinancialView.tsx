import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { financialOS } from "../lib/financialOS";
import { Badge, Card, Label, Stat, StatusBadge } from "./ui";

export function FinancialView({ state }: { state: AppState }) {
  const today = useMemo(() => new Date(), []);
  const unitEcon = useMemo(() => financialOS.computeCompleteUnitEconomics(state, today), [state, today]);
  const alloc = useMemo(() => financialOS.optimizeCapitalAllocation(state, today), [state, today]);
  const proj = useMemo(() => financialOS.buildScenarioProjection(state, today, 12), [state, today]);
  const runway = financialOS.runwayStatus(state);

  const allocColors: Record<string, string> = {
    PEOPLE: "bg-indigo-500", PRODUCT: "bg-sky-500", GTM: "bg-emerald-500", OPERATIONS: "bg-amber-500", RESERVE: "bg-slate-400",
  };

  return (
    <div className="space-y-6">
      <Card title="Complete unit economics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="ARR" value={unitEcon.arr ? `€${Math.round(unitEcon.arr).toLocaleString()}` : "—"} />
          <Stat label="MRR" value={unitEcon.mrr ? `€${unitEcon.mrr.toLocaleString()}` : "—"} />
          <Stat label="Customers" value={unitEcon.customers ?? "—"} />
          <Stat label="Runway" value={runway ? `${runway.runway_months} mo` : "—"} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {Object.entries(unitEcon.benchmarks).map(([k, b]: any) =>
            b ? (
              <div key={k} className="rounded-lg border border-slate-100 p-3">
                <div className="text-xs font-medium uppercase text-slate-500">{k}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{b.value}</div>
                <div className="mt-1"><StatusBadge status={b.status} /></div>
                <div className="mt-1 text-[11px] text-slate-400">{b.benchmark}</div>
              </div>
            ) : null
          )}
        </div>
        <Label>{unitEcon.label}</Label>
      </Card>

      <Card title="Capital allocation (heuristic optimizer)">
        <div className="flex h-6 w-full overflow-hidden rounded-full">
          {alloc.allocations.map((a) => (
            <div key={a.name} className={allocColors[a.name]} style={{ width: `${a.allocation}%` }} title={`${a.name} ${a.allocation}%`} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          {alloc.allocations.map((a) => (
            <div key={a.name} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${allocColors[a.name]}`} />
              {a.name}: {a.allocation}%
            </div>
          ))}
        </div>
        {alloc.scenarioAdjustment && <p className="mt-2 text-xs font-medium text-amber-600">{alloc.scenarioAdjustment}</p>}
        <Label>{alloc.label}</Label>
      </Card>

      <Card title={`Scenario-weighted ${proj.horizonMonths}-month MRR projection`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {proj.projections.map((p) => (
            <div key={p.scenario} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <Badge tone={p.scenario === "WORST_CASE" ? "red" : p.scenario === "BEST_CASE" ? "green" : "indigo"}>{p.scenario}</Badge>
                <span className="text-xs text-slate-400">p={Math.round(p.probability * 100)}%</span>
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">€{p.finalMRR.toLocaleString()} MRR</div>
              <div className="text-xs text-slate-400">implied ARR €{p.impliedARR.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">
          Expected value: €{proj.expectedValue.mrr.toLocaleString()} MRR (€{proj.expectedValue.arr.toLocaleString()} ARR)
        </div>
        <Label>{proj.label}</Label>
      </Card>
    </div>
  );
}
