import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { talent } from "../lib/talent";
import { Badge, Bar, Card, Label, Stat } from "./ui";

export function TalentView({ state }: { state: AppState }) {
  const today = useMemo(() => new Date(), []);
  const succession = useMemo(() => talent.buildSuccessionMap(state), [state]);
  const capGap = useMemo(() => talent.buildCapabilityGap(state), [state]);
  const headcount = useMemo(() => talent.buildHeadcountRecommendation(state, today), [state, today]);

  return (
    <div className="space-y-6">
      <Card title="Succession depth map">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Bench strength" value={`${succession.benchStrength ?? "—"}%`} />
          <Stat label="Critical roles" value={succession.criticalRoles.length} />
          <Stat label="Roles with no ready-now successor" value={succession.gaps.length} />
          <Stat label="Single-point-of-failure risk" value={succession.criticalVacancyRisk.length} />
        </div>
        <div className="mt-4 space-y-3">
          {succession.criticalRoles.map((role) => {
            const m = succession.successionMap[role];
            return (
              <div key={role} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">{role}</div>
                  {!m || m.readyNow.length === 0 ? <Badge tone="red">no ready-now successor</Badge> : <Badge tone="green">{m.readyNow.length} ready now</Badge>}
                </div>
                {m && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {m.readyNow.map((c, i) => (
                      <span key={"r" + i} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{c.person?.name} · ready now</span>
                    ))}
                    {m.oneYear.map((c, i) => (
                      <span key={"o" + i} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{c.person?.name} · 1yr</span>
                    ))}
                    {m.twoYear.map((c, i) => (
                      <span key={"t" + i} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{c.person?.name} · 2yr</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Label>{succession.label}</Label>
      </Card>

      <Card title="Capability gap analysis">
        <div className="space-y-3">
          {capGap.gaps.map((g) => (
            <div key={g.capability} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{g.capability}</span>
                <span className="text-xs text-slate-500">
                  required L{g.required} · current max L{g.currentMax} · gap {g.gap}
                </span>
              </div>
              <div className="mt-2">
                <Bar pct={(g.currentMax / g.required) * 100} tone={g.gap >= 2 ? "red" : g.gap === 1 ? "amber" : "green"} />
              </div>
            </div>
          ))}
          {capGap.gaps.length === 0 && <p className="text-sm text-slate-500">No headcount plans with capability requirements logged.</p>}
        </div>
        <Label>{capGap.label}</Label>
      </Card>

      <Card title="Autonomous headcount recommendations">
        <div className="space-y-2">
          {headcount.recommendations.map((r: any, i: number) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <Badge tone={r.priority === "CRITICAL" ? "red" : r.priority === "HIGH" ? "amber" : "slate"}>{r.priority}</Badge>
                <span className="text-xs text-slate-400">{r.type} · {r.urgency}</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-700">{r.rationale}</p>
              {r.financialConstraint && <p className="mt-1 text-xs font-medium text-rose-600">{r.financialConstraint}</p>}
              {r.alternative && <p className="mt-1 text-xs text-slate-500">Alternative: {r.alternative}</p>}
            </div>
          ))}
          {headcount.recommendations.length === 0 && <p className="text-sm text-slate-500">No recommendations triggered.</p>}
        </div>
        {headcount.financialContext && (
          <div className="mt-3 text-xs text-slate-500">
            Runway: {headcount.financialContext.runwayMonths} months · headcount budget safe:{" "}
            <Badge tone={headcount.financialContext.headcountBudgetSafe === "YES" ? "green" : headcount.financialContext.headcountBudgetSafe === "LIMITED" ? "amber" : "red"}>
              {headcount.financialContext.headcountBudgetSafe}
            </Badge>
          </div>
        )}
        <Label>{headcount.label} {headcount.note}</Label>
      </Card>
    </div>
  );
}
