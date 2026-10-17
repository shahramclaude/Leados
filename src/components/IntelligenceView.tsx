import { useMemo } from "react";
import type { Projection } from "../lib/types";
import { engine } from "../lib/engine";
import { Thermodynamics } from "./Thermodynamics";
import { Card, Label } from "./ui";

const SEV_STYLE: Record<number, string> = {
  4: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  3: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  2: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  1: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export function IntelligenceView({ P, today }: { P: Projection; today: Date }) {
  const result = useMemo(() => engine.run(P, today), [P, today]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">Intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">
          Findings surfaced by <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">LEADOS.engine</code>, a small,
          disclosed-fabricated rules engine (6 rules, arbitrary thresholds) built for this delivery to make the
          thermodynamics layer below computable against real event data.
        </p>
      </div>

      <Card title={`Active Findings (${result.findings.length})`} subtitle="Sorted by severity, then recency">
        {result.findings.length === 0 ? (
          <p className="text-sm text-slate-400">No findings right now.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {result.findings.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SEV_STYLE[f.sev] ?? SEV_STYLE[1]}`}>
                      {f.rule}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{f.domain}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-200">{f.title}</div>
                  {f.detail && <div className="text-xs text-slate-500">{f.detail}</div>}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-600">{f.ts}</div>
              </li>
            ))}
          </ul>
        )}
        <Label>
          Rules: SIGNAL, DECISION_STALE, GOAL_OWNERLESS, CONFLICT_UNRESOLVED, ONEONONE_GAP, NETWORK_ISOLATION. All original
          to this sandbox session; thresholds (14d / 21d / 45d) are arbitrary and disclosed as such.
        </Label>
      </Card>

      <div className="border-t border-slate-800 pt-8">
        <Thermodynamics P={P} today={today} />
      </div>
    </div>
  );
}
