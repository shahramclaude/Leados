"use client";
import type { IntelligenceData } from "@/hooks/useIntelligence";

const SCENARIO_LABELS: Record<string, string> = {
  STATUS_QUO: "Status quo",
  IMPROVE_CADENCE: "Improve 1:1 cadence",
  ADD_GROWTH_PLAN: "Add growth plan",
  REDUCE_LOAD: "Reduce load",
};

export function SimulationView({ data }: { data: IntelligenceData }) {
  const { simulation } = data;
  const scenarios = simulation?.scenarios ?? {};
  const order = ["STATUS_QUO", "IMPROVE_CADENCE", "ADD_GROWTH_PLAN", "REDUCE_LOAD"];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-sm font-semibold text-slate-300">Organizational simulation</div>

      {simulation?.bestIntervention && (
        <div className="bg-indigo-950/40 border border-indigo-700 rounded-xl px-5 py-4">
          <div className="text-[10px] uppercase text-indigo-400 mb-1">Best intervention</div>
          <div className="text-lg font-medium text-slate-100">
            {SCENARIO_LABELS[simulation.bestIntervention.name] ?? simulation.bestIntervention.name} reduces attrition probability by{" "}
            <span className="text-emerald-400 font-mono">{Math.round(simulation.bestIntervention.delta * 100)}pp</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {order.map((key) => {
          const s = scenarios[key];
          if (!s) return null;
          const highlight = key === "STATUS_QUO" && s.attritionProbability > 0.5;
          return (
            <div
              key={key}
              className={`bg-slate-900/60 border rounded-xl px-4 py-4 ${highlight ? "border-red-600" : "border-slate-800"}`}
            >
              <div className="text-[10px] uppercase text-slate-500 mb-2">{SCENARIO_LABELS[key] ?? key}</div>
              <div className={`text-3xl font-bold font-mono ${highlight ? "text-red-400" : "text-slate-100"}`}>
                {Math.round(s.attritionProbability * 100)}%
              </div>
              <div className="text-[10px] text-slate-600 mb-3">attrition probability</div>

              <div className="text-sm text-slate-300 font-mono">{s.finalMeanEngagement}</div>
              <div className="text-[10px] text-slate-600 mb-2">final mean engagement</div>

              <div className="text-xs text-slate-400 font-mono">
                P10 {s.engagementP10} – P90 {s.engagementP90}
              </div>
              <div className="text-[10px] text-slate-600 mb-2">engagement range</div>

              <div className="text-[10px] text-slate-600 mt-2">{s.seeds} seeds</div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-600">50 Monte Carlo seeds. Heuristic agent model. Directional only.</div>
    </div>
  );
}
