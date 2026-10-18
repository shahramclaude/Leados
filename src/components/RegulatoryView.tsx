import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { regulatory } from "../lib/regulatory";
import { Badge, Bar, Card, Label } from "./ui";

export function RegulatoryView({ state }: { state: AppState }) {
  const today = useMemo(() => new Date(), []);
  const registry = useMemo(() => regulatory.buildObligationRegistry(state, today), [state, today]);
  const conflicts = useMemo(() => regulatory.detectCrossJurisdictionConflicts(state), [state]);

  return (
    <div className="space-y-6">
      <Card title="Jurisdiction obligation registry">
        <div className="space-y-3">
          {registry.map((r) => (
            <div key={r.jurisdiction} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">{r.jurisdiction} <span className="font-normal text-slate-400">· {r.region}</span></div>
                <Badge tone={r.exposureLevel === "HIGH" ? "red" : r.exposureLevel === "ELEVATED" ? "amber" : "green"}>
                  exposure {r.exposure} · {r.exposureLevel}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-500">
                <div>
                  Framework coverage: {r.completeness ?? "—"}%
                  <Bar pct={r.completeness ?? 0} tone={((r.completeness ?? 0) >= 70 ? "green" : (r.completeness ?? 0) >= 40 ? "amber" : "red")} />
                </div>
                <div>
                  Legal review coverage: {r.reviewCoverage ?? "—"}%
                  <Bar pct={r.reviewCoverage ?? 0} tone={((r.reviewCoverage ?? 0) >= 70 ? "green" : (r.reviewCoverage ?? 0) >= 40 ? "amber" : "red")} />
                </div>
              </div>
              {r.gaps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {r.gaps.map((g) => (
                    <span key={g} className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">no interpretation: {g}</span>
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-slate-400">
                Last compliance check: {r.daysSinceCheck != null ? `${r.daysSinceCheck}d ago` : "never logged"}
              </div>
            </div>
          ))}
        </div>
        <Label>Exposure = 0.4×(100−coverage) + 0.3×(100−reviewCoverage) + min(30, daysSinceCheck/10). Heuristic weighting, not a legal risk-scoring standard.</Label>
      </Card>

      <Card title={`Cross-jurisdiction interpretation conflicts (${conflicts.conflicts.length})`}>
        <div className="space-y-2">
          {conflicts.conflicts.map((c: any, i: number) => (
            <div key={i} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
              <div className="text-sm font-medium text-rose-800">{c.framework}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                {c.interpretations.map((x: any, j: number) => (
                  <span key={j} className="rounded-full bg-white px-2 py-0.5 shadow-sm">
                    {x.jurisdiction}: {x.interpretation} {x.reviewed ? "✓ reviewed" : "⚠ unreviewed"}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{c.note}</p>
            </div>
          ))}
          {conflicts.conflicts.length === 0 && <p className="text-sm text-slate-500">No conflicting interpretations detected.</p>}
        </div>
        <Label>{conflicts.label}</Label>
      </Card>
    </div>
  );
}
