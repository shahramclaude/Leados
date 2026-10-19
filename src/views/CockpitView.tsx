"use client";

import { useAppData } from "@/context/AppContext";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" | "amber" }) {
  const toneClass =
    tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

/**
 * CockpitView intentionally performs ZERO fetches of its own — every
 * number here comes from the single /api/cockpit aggregate call made
 * once by AppProvider, satisfying the "cockpit renders with zero
 * additional fetches" acceptance criterion.
 */
export default function CockpitView() {
  const { data, loading, error, refresh } = useAppData();

  if (loading && !data) {
    return <div className="animate-pulse text-sm text-slate-500">Loading command center…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
        Failed to load cockpit data: {error}
        <button onClick={refresh} className="ml-3 underline">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const cascadePct = Math.round(data.belief.cascadeRisk * 100);
  const cascadeTone = cascadePct >= 66 ? "red" : cascadePct >= 33 ? "amber" : "green";

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-slate-100">Morning Briefing</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{data.brief.executiveSummary}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="People" value={String(data.summary.peopleCount)} />
        <StatCard label="At-Risk People" value={String(data.summary.atRiskPeopleCount)} tone={data.summary.atRiskPeopleCount > 5 ? "red" : "amber"} />
        <StatCard label="Open Findings" value={String(data.summary.openFindingsCount)} tone={data.summary.openFindingsCount > 0 ? "amber" : "green"} />
        <StatCard label="Open Hypotheses" value={String(data.summary.openHypothesesCount)} />
        <StatCard label="Cascade Risk" value={`${cascadePct}%`} tone={cascadeTone} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Belief Fabric — Latent Risk Posteriors</h2>
          <ul className="mt-3 space-y-2">
            {data.belief.nodes.map((node) => {
              const value = data.belief.posteriors[node] ?? 0;
              return (
                <li key={node} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 text-slate-400">{node}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                    <div className="h-full bg-indigo-500" style={{ width: `${Math.round(value * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right text-slate-400">{Math.round(value * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Critical Path</h2>
          <p className="mt-2 text-xs text-slate-400">
            {data.criticalPath.chain.length} projects in chain · {data.criticalPath.totalDurationDays} days total
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Bottleneck project ID: <span className="text-amber-400">{data.criticalPath.bottleneckProject ?? "—"}</span>
          </p>
          {data.criticalPath.cyclesDetected.length > 0 && (
            <p className="mt-2 text-xs text-red-400">⚠ {data.criticalPath.cyclesDetected.length} dependency cycle(s) detected</p>
          )}

          <h3 className="mt-4 text-xs font-semibold uppercase text-slate-500">Runway (Monte Carlo, n={data.runway.samples})</h3>
          <div className="mt-2 flex items-end gap-1">
            {[
              ["p5", data.runway.p5],
              ["p25", data.runway.p25],
              ["p50", data.runway.p50],
              ["p75", data.runway.p75],
              ["p95", data.runway.p95],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-emerald-600"
                  style={{ height: `${8 + Math.min(60, Number(value) * 2)}px` }}
                />
                <span className="text-[10px] text-slate-500">{label}</span>
                <span className="text-[10px] text-slate-400">{Number(value).toFixed(1)}mo</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.lastAgentRun && (
        <p className="text-xs text-slate-500">
          Last agent cycle: {data.lastAgentRun.status} in {data.lastAgentRun.durationMs}ms at{" "}
          {new Date(data.lastAgentRun.completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
