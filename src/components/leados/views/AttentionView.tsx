"use client";
import type { IntelligenceData } from "@/hooks/useIntelligence";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DOMAIN_COLORS: Record<string, string> = {
  people: "text-blue-400",
  finance: "text-emerald-400",
  sales: "text-orange-400",
  ops: "text-purple-400",
  strategy: "text-cyan-400",
  gov: "text-pink-400",
};

export function AttentionView({ data }: { data: IntelligenceData }) {
  const plan = data.attentionPlan ?? { sequence: [], deferred: [], totalHours: 0, hoursBudget: 30, utilizationPct: 0, cognitiveLoadUsed: 0, cognitiveLoadBudget: 40 };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-sm font-semibold text-slate-300">Weekly attention plan</div>

      <div className="flex flex-wrap gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[180px]">
          <div className="text-[10px] uppercase text-slate-500">Hours budget</div>
          <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">
            {plan.totalHours} / {plan.hoursBudget}h
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${plan.utilizationPct}%` }} />
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex-1 min-w-[180px]">
          <div className="text-[10px] uppercase text-slate-500">Cognitive load</div>
          <div className="text-2xl font-bold font-mono text-fuchsia-400 mt-1">
            {plan.cognitiveLoadUsed} / {plan.cognitiveLoadBudget}
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-fuchsia-500 rounded-full"
              style={{ width: `${Math.min(100, Math.round((plan.cognitiveLoadUsed / plan.cognitiveLoadBudget) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {DAYS.map((d) => {
          const items = plan.sequence.filter((i: any) => i.day === d);
          return (
            <div key={d} className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 min-h-[160px]">
              <div className="text-xs font-semibold text-slate-300 mb-2">{d}</div>
              <div className="space-y-2">
                {items.map((item: any, i: number) => (
                  <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-2">
                    <div className="text-xs text-slate-200 leading-tight">{item.title}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[9px] font-mono ${DOMAIN_COLORS[item.domain] ?? "text-slate-500"}`}>{item.rule}</span>
                    </div>
                    <div className="text-[9px] text-slate-600 mt-0.5">
                      {item.timeHours}h · ROI {item.roi}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-[10px] text-slate-700">No items scheduled.</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div className="text-sm font-semibold text-slate-300 mb-2">Deferred — {plan.deferred.length}</div>
        {plan.deferred.length === 0 ? (
          <div className="text-xs text-slate-600">Nothing deferred this week.</div>
        ) : (
          <div className="space-y-1.5">
            {plan.deferred.map((d: any, i: number) => (
              <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-300">{d.title}</span>
                <span className="text-slate-600">{d.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-600">Simulated annealing optimization. Kirkpatrick et al. (1983).</div>
    </div>
  );
}
