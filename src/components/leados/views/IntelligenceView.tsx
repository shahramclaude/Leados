"use client";

import { useAppContext } from "@/lib/AppContext";
import GaugeArc from "@/components/leados/ui/GaugeArc";
import { SkeletonList } from "@/components/leados/ui/Skeleton";
import { DOMAIN_LABELS, SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/domains";

export default function IntelligenceView() {
  const { intelligence, loading, weeklyBriefing } = useAppContext();

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Intelligence</h1>
        <p className="text-sm text-slate-500">Composite org health, domain breakdown, and active findings.</p>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Org Health Score</p>
            <p className="text-6xl font-bold text-slate-50">{intelligence.orgHealthScore}</p>
            <p className="mt-1 text-xs text-slate-500">
              {intelligence.criticalFindingsCount} critical finding(s) · generated{" "}
              {new Date(intelligence.generatedAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            {intelligence.domainHealth.map((d) => (
              <GaugeArc key={d.domain} label={DOMAIN_LABELS[d.domain]} value={d.score} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm leading-relaxed text-slate-300">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Executive Summary</h2>
        {weeklyBriefing.executiveSummary}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Domain Breakdown</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {intelligence.domainHealth.map((d) => (
            <div key={d.domain} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-200">{DOMAIN_LABELS[d.domain]}</p>
                <span className="text-xs text-slate-500">{d.trend === "up" ? "↑" : d.trend === "down" ? "↓" : "→"}</span>
              </div>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{d.score}</p>
              <p className="text-xs text-slate-500">
                {d.findingCount} finding(s) · {d.criticalCount} critical
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Active Findings</h2>
        {loading && intelligence.findings.length === 0 ? (
          <SkeletonList rows={4} />
        ) : intelligence.findings.length === 0 ? (
          <p className="text-sm text-slate-500">No active findings. The org is quiet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {intelligence.findings.map((f) => (
              <div key={f.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                  title={SEVERITY_LABELS[f.severity]}
                />
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {f.title} <span className="ml-2 text-[10px] uppercase text-slate-500">{f.domain}</span>
                  </p>
                  <p className="text-xs text-slate-400">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
