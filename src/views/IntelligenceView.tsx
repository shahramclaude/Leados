"use client";
import React, { useEffect, useState } from "react";
import { GaugeRing } from "@/components/ui/svgCharts";

interface IntelligenceData {
  physics: { inertia: number; momentumCarry: number; label: string };
  entropy: number;
  domainCounts: Record<string, number>;
  activeCascades: { link: { description: string; fromRuleId: string; toRuleId: string }; effectiveSeverityScore: number; originalSeverityScore: number }[];
  allCascades: { link: { description: string }; active: boolean }[];
  influential: { ruleId: string; name: string; rank: number }[];
}

export function IntelligenceView() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  useEffect(() => {
    fetch("/api/intelligence").then((r) => r.json()).then(setData);
  }, []);
  if (!data) return <div className="text-sm text-slate-500">Loading intelligence…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Organizational Physics</h1>
      <p className="max-w-3xl text-sm text-slate-400">
        A lightweight physical analogy: organizational <b>inertia</b> (mass-like resistance to change) is modeled from headcount, average tenure, and
        open blockers. <b>Entropy</b> measures how concentrated vs. spread out active findings are across the 8 domains.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Change Inertia">
          <div className="flex items-center gap-4">
            <GaugeRing value={data.physics.inertia * 100} color="#f59e0b" label="inertia" />
            <div>
              <div className="text-lg font-bold capitalize text-slate-100">{data.physics.label}</div>
              <div className="text-xs text-slate-500">momentum carry {Math.round(data.physics.momentumCarry * 100)}%</div>
            </div>
          </div>
        </Panel>
        <Panel title="Finding Entropy">
          <div className="flex items-center gap-4">
            <GaugeRing value={data.entropy} color="#38bdf8" label="entropy / 100" />
            <div className="text-xs text-slate-500">
              {data.entropy > 70 ? "Findings are broadly spread across domains." : data.entropy > 35 ? "Findings cluster in a few domains." : "Findings are highly concentrated — likely a single root cause."}
            </div>
          </div>
        </Panel>
        <Panel title="Domain Distribution">
          <div className="space-y-1">
            {Object.entries(data.domainCounts).map(([d, c]) => (
              <div key={d} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 capitalize text-slate-400">{d}</span>
                <div className="h-2 flex-1 rounded bg-slate-800">
                  <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.min(100, c * 20)}%` }} />
                </div>
                <span className="w-4 text-right text-slate-500">{c}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Active Causal Cascades">
          <div className="space-y-2">
            {data.activeCascades.length === 0 && <div className="text-xs text-slate-500">No active cascades.</div>}
            {data.activeCascades.map((c, i) => (
              <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                <div>{c.link.description}</div>
                <div className="mt-1 text-amber-400">
                  severity {c.originalSeverityScore.toFixed(1)} → amplified to {c.effectiveSeverityScore.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Most Influential Rules (PageRank over causal graph)">
          <div className="space-y-1.5">
            {data.influential.map((r, i) => (
              <div key={r.ruleId} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-slate-600">#{i + 1}</span>
                <span className="flex-1 truncate text-slate-200">{r.name}</span>
                <span className="text-slate-500">{r.rank.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">{title}</div>
      {children}
    </div>
  );
}
