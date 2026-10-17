import type { ProjectedDomainScore } from "../lib/core";

const MAX_BAR = 12; // visual scale cap, disclosed, not a real statistical bound

export function DomainsView({ scores }: { scores: ProjectedDomainScore[] }) {
  const maxScore = Math.max(1, ...scores.map((s) => s.score));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Domains</h1>
        <p className="text-sm text-slate-500">
          Decay-weighted heatmap score per domain: <code className="text-indigo-300">severity_weight &times; 0.85^age_days</code>,
          summed over open findings. Recomputed from the raw event log on every render.
        </p>
      </div>

      <div className="space-y-3">
        {scores.map((s) => {
          const pct = Math.min(100, (s.score / Math.max(maxScore, MAX_BAR)) * 100);
          return (
            <div key={s.domain} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="capitalize font-medium text-slate-200">{s.domain}</span>
                <span className="text-sm text-slate-400">
                  score {s.score} &middot; {s.openFindings} open
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-rose-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
