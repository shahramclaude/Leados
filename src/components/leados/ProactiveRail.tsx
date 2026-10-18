"use client";

interface Props {
  highestLeverageAction: { action: string; source: string; urgency: string } | null;
  attentionPlan: { sequence: any[]; totalHours: number; utilizationPct: number } | null;
  beliefs: Record<string, any>;
  flightRisk: any[];
  temporalMode: string;
}

const URGENCY_COLORS: Record<string, string> = {
  NOW: "text-red-400",
  TODAY: "text-amber-400",
  THIS_WEEK: "text-yellow-400",
  IMMEDIATE: "text-red-400",
};
const MODE_COLORS: Record<string, string> = {
  REACTIVE: "text-red-400",
  STRUCTURAL_STRESS: "text-amber-400",
  STRATEGIC_DRIFT: "text-yellow-400",
  BALANCED: "text-emerald-400",
};

export function ProactiveRail({ highestLeverageAction: hla, attentionPlan, beliefs, flightRisk, temporalMode }: Props) {
  const highRiskBeliefs = Object.entries(beliefs ?? {}).filter(([, b]: [string, any]) => b.highRisk);
  const highFlightRisk = (flightRisk ?? []).filter((r: any) => r.riskLevel === "HIGH");

  return (
    <aside className="w-72 shrink-0 flex flex-col border-l border-slate-800 overflow-auto" style={{ background: "#0d1016" }}>
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Proactive Surface</div>
        <div className={`text-xs font-mono ${MODE_COLORS[temporalMode] ?? "text-slate-400"}`}>
          {temporalMode?.replace(/_/g, " ")}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {hla && (
          <div className="bg-indigo-950/40 border border-indigo-800 rounded-xl p-3">
            <div className="text-[10px] uppercase text-indigo-400 mb-1">Do this now</div>
            <div className="text-sm font-medium text-slate-100">{hla.action}</div>
            <div className={`text-[10px] mt-1 font-mono ${URGENCY_COLORS[hla.urgency] ?? "text-slate-500"}`}>
              {hla.urgency} · {hla.source}
            </div>
          </div>
        )}

        {highRiskBeliefs.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-2">Probability alerts</div>
            <div className="space-y-2">
              {highRiskBeliefs.map(([key, b]: [string, any]) => (
                <div key={key} className="bg-red-950/20 border border-red-900/40 rounded-lg p-2">
                  <div className="text-xs text-red-400 font-medium">{key.replace(/_/g, " ")}</div>
                  <div className="text-lg font-bold text-red-300">{b.posteriorPct}%</div>
                  <div className="text-[10px] text-slate-500">{b.appliedEvidence?.length ?? 0} signals</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {highFlightRisk.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-2">Flight risk</div>
            <div className="space-y-1.5">
              {highFlightRisk.map((r: any) => (
                <div key={r.personId} className="flex items-center justify-between text-xs bg-slate-900/60 rounded-lg px-3 py-2">
                  <span className="text-slate-200">{r.personName}</span>
                  <span className="text-red-400 font-mono">{Math.round(r.riskScore * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {attentionPlan && (
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-2">
              This week · {attentionPlan.utilizationPct}% budget used
            </div>
            <div className="space-y-1.5">
              {(attentionPlan.sequence ?? []).slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="text-xs bg-slate-900/40 rounded-lg px-3 py-2">
                  <div className="text-slate-200 truncate">{item.title}</div>
                  <div className="text-slate-600 text-[10px]">
                    {item.timeHours}h · ROI {item.roi}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
