"use client";
import type { IntelligenceData } from "@/hooks/useIntelligence";
import { FindingCard } from "../FindingCard";

const MODE_COLORS: Record<string, string> = {
  REACTIVE: "bg-red-950/40 border-red-800 text-red-400",
  STRUCTURAL_STRESS: "bg-amber-950/40 border-amber-800 text-amber-400",
  STRATEGIC_DRIFT: "bg-yellow-950/40 border-yellow-800 text-yellow-400",
  BALANCED: "bg-emerald-950/40 border-emerald-800 text-emerald-400",
};

const URGENCY_COLORS: Record<string, string> = {
  NOW: "text-red-400",
  TODAY: "text-amber-400",
  THIS_WEEK: "text-yellow-400",
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${accent ?? "text-slate-100"}`}>{value}</div>
    </div>
  );
}

export function TodayView({ data, onNavigate }: { data: IntelligenceData; onNavigate: (r: string) => void }) {
  const { findings, decisions, beliefs, healthScore, temporalMode, highestLeverageAction, inferences, correlations, feedbackLoops } = data;

  const criticalHigh = findings.filter((f) => f.sev >= 4).length;
  const openDecisions = decisions.filter((d: any) => d.status !== "RESOLVED").length;
  const bayesianAlerts = Object.values(beliefs ?? {}).filter((b: any) => b.highRisk).length;

  const sevGroups = [5, 4, 3, 2, 1]
    .map((sev) => ({ sev, items: findings.filter((f) => f.sev === sev) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Findings" value={findings.length} />
        <StatCard label="Critical / High" value={criticalHigh} accent={criticalHigh > 0 ? "text-red-400" : "text-emerald-400"} />
        <StatCard label="Open Decisions" value={openDecisions} />
        <StatCard label="Bayesian Alerts" value={bayesianAlerts} accent={bayesianAlerts > 0 ? "text-amber-400" : "text-emerald-400"} />
        <StatCard label="Health" value={`${healthScore.overall}/100`} accent="text-indigo-400" />
      </div>

      {/* Temporal mode */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${MODE_COLORS[temporalMode] ?? "border-slate-800"}`}>
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-80">Active situation</div>
          <div className="text-lg font-semibold font-mono">{temporalMode?.replace(/_/g, " ")}</div>
        </div>
        <button onClick={() => onNavigate("intelligence")} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
          View intelligence →
        </button>
      </div>

      {/* Highest leverage action */}
      {highestLeverageAction && (
        <div className="bg-indigo-950/40 border border-indigo-700 rounded-xl px-5 py-4 w-full">
          <div className="text-[10px] uppercase text-indigo-400 mb-1">Highest leverage action</div>
          <div className="text-lg font-medium text-slate-100">{highestLeverageAction.action}</div>
          <div className={`text-xs mt-1 font-mono ${URGENCY_COLORS[highestLeverageAction.urgency] ?? "text-slate-400"}`}>
            {highestLeverageAction.urgency} · {highestLeverageAction.source}
          </div>
        </div>
      )}

      {/* Findings grouped by severity */}
      <div>
        <div className="text-sm font-semibold text-slate-300 mb-2">Findings</div>
        {sevGroups.length === 0 && <div className="text-sm text-slate-500">No active findings. Organization is healthy.</div>}
        <div className="space-y-4">
          {sevGroups.map((g) => (
            <div key={g.sev}>
              <div className="text-[10px] uppercase text-slate-600 mb-1.5">
                Severity {g.sev} ({g.items.length})
              </div>
              <div className="space-y-2">
                {g.items.map((f: any) => (
                  <FindingCard key={f.key} finding={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inference chains */}
      {inferences?.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-300 mb-2">Inference chains</div>
          <div className="space-y-2">
            {inferences.map((inf: any) => (
              <div key={inf.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-cyan-400">{inf.id}</span>
                  <span className="text-sm text-slate-100 font-medium">{inf.title}</span>
                  <span className={`text-[10px] font-mono ml-auto ${URGENCY_COLORS[inf.urgency] ?? "text-slate-500"}`}>{inf.urgency}</span>
                </div>
                <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden w-full max-w-xs">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${inf.confidence}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{inf.confidence}% confidence</div>
                <button className="mt-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white">{inf.action}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation clusters */}
      {correlations?.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-300 mb-2">Correlation clusters</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {correlations.map((c: any) => (
              <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{c.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 ml-auto">sev {c.combinedSev}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{c.description}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.members.map((m: string) => (
                    <span key={m} className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback loops */}
      {feedbackLoops?.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-300 mb-2">Feedback loops</div>
          <div className="flex flex-wrap gap-2">
            {feedbackLoops.map((loop: any) => (
              <div
                key={loop.id}
                className={`text-xs rounded-lg px-3 py-2 border ${
                  loop.active ? "border-slate-700 bg-slate-900/60 text-slate-200" : "border-slate-800 bg-slate-900/20 text-slate-600"
                }`}
              >
                <span
                  className={`text-[9px] uppercase font-mono mr-2 px-1.5 py-0.5 rounded ${
                    loop.polarity === "REINFORCING" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
                  }`}
                >
                  {loop.polarity}
                </span>
                {loop.name}
                {!loop.active && <span className="ml-2 text-[9px] text-slate-600">(inactive)</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
