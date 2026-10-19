"use client";
import React, { useEffect, useState } from "react";
import type { ExecutionReport, Project } from "@/lib/types";

const STATUS_COLS: { id: Project["status"]; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

const SEV_COLOR: Record<string, string> = { critical: "#f43f5e", high: "#f97316", medium: "#f59e0b", low: "#64748b" };

const MOMENTUM_COLOR: Record<string, string> = { ACCELERATING: "text-emerald-400", STEADY: "text-slate-300", DECELERATING: "text-amber-400", STALLED: "text-rose-400" };

export function ExecutionView() {
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);

  useEffect(() => {
    fetch("/api/execution").then((r) => r.json()).then((d) => setReport(d.report));
  }, []);

  if (!report) return <div className="text-sm text-slate-500">Loading execution report…</div>;

  const byId = new Map(report.projects.map((p) => [p.id, p]));
  const pathNodes = report.criticalPath.criticalPath.map((id) => byId.get(id)).filter(Boolean) as Project[];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Execution Intelligence</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Active Projects" value={String(report.kpis.activeProjects)} />
        <Kpi label="Blocked" value={String(report.kpis.blockedProjects)} />
        <Kpi label="Overdue Milestones" value={String(report.kpis.overdueMilestones)} />
        <Kpi label="Avg Confidence" value={`${Math.round(report.kpis.avgConfidence * 100)}%`} />
        <Kpi label="Open Blockers" value={String(report.kpis.openBlockers)} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">Critical Path (Kahn&apos;s algorithm)</div>
          {report.criticalPath.cyclesDetected && <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">Cycle detected in dependency graph</span>}
        </div>
        <svg width={Math.max(400, pathNodes.length * 170)} height={100}>
          {pathNodes.map((p, i) => (
            <g key={p.id} transform={`translate(${i * 170 + 10},20)`}>
              <rect
                width={150}
                height={50}
                rx={8}
                fill={p.id === report.criticalPath.bottleneck ? "#7f1d1d" : "#1e293b"}
                stroke={p.id === report.criticalPath.bottleneck ? "#f87171" : "#475569"}
              />
              <text x={10} y={20} fontSize={11} fill="#e2e8f0">
                {p.title.slice(0, 20)}
              </text>
              <text x={10} y={38} fontSize={9} fill="#94a3b8">
                {Math.round(p.confidence * 100)}% confidence
              </text>
              {i < pathNodes.length - 1 && <line x1={150} y1={25} x2={170} y2={25} stroke="#64748b" markerEnd="url(#arrow)" />}
            </g>
          ))}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
            </marker>
          </defs>
        </svg>
        <div className="mt-2 text-xs text-slate-500">Total duration: {report.criticalPath.totalDurationDays} days. Bottleneck: {report.criticalPath.bottleneck ?? "none"}.</div>
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold text-slate-200">Project Board</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {STATUS_COLS.map((col) => (
            <div key={col.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase text-slate-500">{col.label}</div>
              <div className="space-y-2">
                {report.projects.filter((p) => p.status === col.id).map((p) => (
                  <button key={p.id} onClick={() => setSelected(p)} className="block w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-left hover:border-slate-700">
                    <div className="truncate text-xs font-semibold text-slate-200">{p.title}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{p.domain} · {p.owner}</div>
                    <div className="mt-1 h-1.5 rounded bg-slate-800">
                      <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.round(p.confidence * 100)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-200">Blocker Heatmap (domain × severity)</div>
          <div className="grid grid-cols-5 gap-1 text-[10px]">
            <div />
            {["low", "medium", "high", "critical"].map((s) => (
              <div key={s} className="text-center capitalize text-slate-500">{s}</div>
            ))}
            {["people", "finance", "strategy", "execution", "rd", "sales", "knowledge", "manufacturing"].map((d) => (
              <React.Fragment key={d}>
                <div className="truncate pr-1 capitalize text-slate-500">{d}</div>
                {["low", "medium", "high", "critical"].map((s) => {
                  const cell = report.blockerHeatmap.find((c) => c.domain === d && c.severity === s);
                  const count = cell?.count ?? 0;
                  return (
                    <div key={s} className="flex h-6 items-center justify-center rounded" style={{ backgroundColor: count === 0 ? "#1e293b" : SEV_COLOR[s], opacity: count === 0 ? 0.4 : Math.min(1, 0.4 + count * 0.2) }}>
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-200">Delivery Momentum</div>
          <div className={`text-3xl font-bold ${MOMENTUM_COLOR[report.momentum.label]}`}>{report.momentum.label}</div>
          <div className="mt-2 text-xs text-slate-500">
            index {report.momentum.momentumIndex.toFixed(2)} ({report.momentum.completed14d} completed / {report.momentum.pending14d} pending in last 14 days)
          </div>
          <div className="mt-3 h-2 w-full rounded bg-slate-800">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, report.momentum.momentumIndex * 50)}%` }} />
          </div>
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="mb-4 text-xs text-slate-500 hover:text-slate-300">
              ← Close
            </button>
            <div className="text-lg font-bold text-slate-100">{selected.title}</div>
            <div className="text-xs capitalize text-slate-500">{selected.domain} · {selected.owner} · {selected.status}</div>
            <div className="mt-4">
              <div className="mb-1 text-xs uppercase text-slate-500">Milestones</div>
              {selected.milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded bg-slate-900 px-2 py-1 text-xs">
                  <span className={m.completed ? "text-emerald-400" : m.overdue ? "text-rose-400" : "text-slate-300"}>{m.title}</span>
                  <span className="text-slate-500">{new Date(m.dueDate).toLocaleDateString()}</span>
                </div>
              ))}
              {selected.milestones.length === 0 && <div className="text-xs text-slate-600">None.</div>}
            </div>
            <div className="mt-4">
              <div className="mb-1 text-xs uppercase text-slate-500">Blockers</div>
              {selected.blockers.map((b) => (
                <div key={b.id} className="rounded bg-slate-900 px-2 py-1 text-xs">
                  <span style={{ color: SEV_COLOR[b.severity] }}>{b.severity}</span> — {b.description} {b.resolved && <span className="text-emerald-400">(resolved)</span>}
                </div>
              ))}
              {selected.blockers.length === 0 && <div className="text-xs text-slate-600">None.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}
