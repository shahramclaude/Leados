"use client";
import React from "react";

const STEPS = [
  { id: "events", label: "Event Log", desc: "Append-only Postgres table of every person/finance/strategy/execution/rd/sales/knowledge/manufacturing event." },
  { id: "project", label: "eventBrain.project()", desc: "Pure projection: LeadosEvent[] → BrainProjection (people, goals, projects, metrics…)." },
  { id: "rules", label: "ruleEngine.run()", desc: "48 rules (6 × 8 domains) evaluate the projection → RuleEvaluation[] (Findings)." },
  { id: "causal", label: "causalInference.detectAll()", desc: "12 declared causal links are checked for active cascades and severity amplification." },
  { id: "agent", label: "agentLoop (hypotheses)", desc: "Firing rules generate hypotheses; resolutions feed back into calibration (Brier score, confirmation rate)." },
  { id: "views", label: "All Views", desc: "Cockpit, Intelligence, People, Strategy, Finance, Execution, Signals, Knowledge, Data, Health, About." },
];

export function AboutView() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">About Leados</h1>
      <p className="max-w-3xl text-sm text-slate-400">
        Leados is an event-sourced organizational intelligence platform. Every number shown anywhere in the product is derived — deterministically
        and reproducibly — from the append-only event log below. Nothing is hand-authored per view; the pipeline is the single source of truth.
      </p>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="mb-4 text-sm font-semibold text-slate-200">Intelligence Topology</div>
        <svg width="100%" height={260} viewBox="0 0 1000 260">
          {STEPS.map((s, i) => (
            <g key={s.id} transform={`translate(${i * 165 + 10},40)`}>
              <rect width={150} height={70} rx={10} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.5} />
              <text x={75} y={28} fontSize={11} fontWeight={700} fill="#e2e8f0" textAnchor="middle">
                {s.label}
              </text>
              <foreignObject x={6} y={34} width={138} height={34}>
                <div style={{ fontSize: 8, color: "#94a3b8", textAlign: "center", lineHeight: 1.3 }}>{s.desc}</div>
              </foreignObject>
              {i < STEPS.length - 1 && <line x1={150} y1={35} x2={165} y2={35} stroke="#475569" strokeWidth={2} markerEnd="url(#arrow2)" />}
            </g>
          ))}
          <defs>
            <marker id="arrow2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#475569" />
            </marker>
          </defs>
        </svg>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          <div className="mb-2 font-semibold text-slate-100">Design Principles</div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">
            <li>Append-only event log — no mutation, full provenance.</li>
            <li>Pure projection functions — same input always yields same output (self-test T05).</li>
            <li>Every formula is cited (Holt 1957, Winters 1960, Page 1954, Kahn 1962, Fruchterman &amp; Reingold 1991).</li>
            <li>Every magic number is labeled a DESIGN PARAMETER in source comments.</li>
            <li>Calibration is tracked, not assumed — rules self-report confirmation rate.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          <div className="mb-2 font-semibold text-slate-100">Provenance</div>
          <p className="text-xs text-slate-400">
            All sample/demo data is tagged with <code className="rounded bg-slate-800 px-1">source</code> = <code className="rounded bg-slate-800 px-1">seed</code> or{" "}
            <code className="rounded bg-slate-800 px-1">onboarding_sample</code>. Real production events should be written with{" "}
            <code className="rounded bg-slate-800 px-1">source = &quot;user&quot;</code> via the Data view importer or the public API.
          </p>
        </div>
      </section>
    </div>
  );
}
