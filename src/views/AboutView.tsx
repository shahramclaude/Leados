"use client";

import { useState } from "react";
import type { SelfTestReport, TestResult } from "@/lib/selfTest";

const TOPOLOGY_NODES: { id: string; label: string; x: number; y: number }[] = [
  { id: "db", label: "Events/People/Metrics DB", x: 10, y: 10 },
  { id: "belief", label: "Belief Fabric", x: 10, y: 60 },
  { id: "risks", label: "flight/burnout/cascade", x: 10, y: 110 },
  { id: "orch", label: "Orchestrator", x: 10, y: 160 },
  { id: "people", label: "People Intel", x: 0, y: 210 },
  { id: "strategic", label: "Strategic", x: 55, y: 210 },
  { id: "financial", label: "Financial", x: 110, y: 210 },
  { id: "execution", label: "Execution", x: 165, y: 210 },
  { id: "kg", label: "Knowledge Graph", x: 10, y: 260 },
  { id: "narr", label: "Narratives & Playbooks", x: 10, y: 310 },
  { id: "sse", label: "SSE Stream", x: 10, y: 360 },
  { id: "ui", label: "Command Center UI", x: 10, y: 410 },
];

function sortTests(tests: TestResult[]): TestResult[] {
  return [...tests].sort((a, b) => {
    const aFail = a.passed === false ? 0 : a.passed === "skipped" ? 1 : 2;
    const bFail = b.passed === false ? 0 : b.passed === "skipped" ? 1 : 2;
    return aFail - bFail;
  });
}

function fmt(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function AboutView() {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTests() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/self-test", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error ?? `Request failed with ${res.status}`);
      }
      const json = (await res.json()) as SelfTestReport;
      setReport(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run self-tests");
    } finally {
      setLoading(false);
    }
  }

  const sortedTests = report ? sortTests(report.tests) : [];
  const topologyOk = !report || report.blockers.length === 0;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">About / System Health</h1>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">System Health</h2>
          <button
            onClick={runTests}
            disabled={loading}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run Self-Tests"}
          </button>
        </div>

        {error && <div className="rounded-md border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}

        {report && (
          <>
            {report.blockers.length > 0 ? (
              <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm font-semibold text-red-300">
                SYSTEM INTEGRITY COMPROMISED — {report.blockers.length} critical test{report.blockers.length === 1 ? "" : "s"} failing
              </div>
            ) : (
              <div className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm font-semibold text-emerald-300">
                ALL SYSTEMS NOMINAL
              </div>
            )}

            <p className="text-xs text-slate-400">
              {report.passed}/{report.tests.length} tests passing in {report.duration}ms
              {report.warnings.length > 0 && <span className="text-amber-400"> · {report.warnings.length} warning(s)</span>}
            </p>

            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-950 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Test</th>
                    <th className="px-2 py-1.5">Category</th>
                    <th className="px-2 py-1.5">Pass/Fail</th>
                    <th className="px-2 py-1.5">Actual</th>
                    <th className="px-2 py-1.5">Expected</th>
                    <th className="px-2 py-1.5">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTests.map((t) => (
                    <tr
                      key={t.name}
                      className={`border-t border-slate-800 ${
                        t.passed === false ? "bg-red-950/30" : t.passed === "skipped" ? "bg-slate-800/30" : "bg-emerald-950/10"
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono text-slate-300">{t.name}</td>
                      <td className="px-2 py-1.5 text-slate-500">{t.category}</td>
                      <td
                        className={`px-2 py-1.5 font-semibold ${
                          t.passed === false ? "text-red-400" : t.passed === "skipped" ? "text-slate-500" : "text-emerald-400"
                        }`}
                      >
                        {t.passed === false ? "FAIL" : t.passed === "skipped" ? "SKIP" : "PASS"}
                      </td>
                      <td className="max-w-[260px] truncate px-2 py-1.5 text-slate-400" title={fmt(t.actual)}>
                        {fmt(t.actual)}
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 text-slate-500" title={fmt(t.expected)}>
                        {fmt(t.expected)}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{t.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!report && !loading && <p className="text-xs text-slate-500">No results yet — run the self-test suite above.</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Intelligence Topology</h2>
        <svg viewBox="0 0 220 440" className="w-full max-w-md" role="img" aria-label="Intelligence pipeline topology diagram">
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={topologyOk ? "#34d399" : "#f87171"} />
            </marker>
          </defs>
          {/* vertical spine arrows */}
          {["db-belief", "belief-risks", "risks-orch"].map((key) => {
            const [fromId, toId] = key.split("-");
            const from = TOPOLOGY_NODES.find((n) => n.id === fromId)!;
            const to = TOPOLOGY_NODES.find((n) => n.id === toId)!;
            return (
              <line
                key={key}
                x1={from.x + 60}
                y1={from.y + 24}
                x2={to.x + 60}
                y2={to.y}
                stroke={topologyOk ? "#34d399" : "#f87171"}
                strokeWidth={1}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {/* orchestrator fan-out */}
          {["people", "strategic", "financial", "execution"].map((id) => {
            const orch = TOPOLOGY_NODES.find((n) => n.id === "orch")!;
            const target = TOPOLOGY_NODES.find((n) => n.id === id)!;
            return (
              <line
                key={id}
                x1={orch.x + 60}
                y1={orch.y + 24}
                x2={target.x + 40}
                y2={target.y}
                stroke={topologyOk ? "#34d399" : "#f87171"}
                strokeWidth={1}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {/* fan-in to knowledge graph */}
          {["people", "strategic", "financial", "execution"].map((id) => {
            const source = TOPOLOGY_NODES.find((n) => n.id === id)!;
            const kg = TOPOLOGY_NODES.find((n) => n.id === "kg")!;
            return (
              <line
                key={`${id}-kg`}
                x1={source.x + 40}
                y1={source.y + 24}
                x2={kg.x + 60}
                y2={kg.y}
                stroke={topologyOk ? "#34d399" : "#f87171"}
                strokeWidth={1}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {["kg-narr", "narr-sse", "sse-ui"].map((key) => {
            const [fromId, toId] = key.split("-");
            const from = TOPOLOGY_NODES.find((n) => n.id === fromId)!;
            const to = TOPOLOGY_NODES.find((n) => n.id === toId)!;
            return (
              <line
                key={key}
                x1={from.x + 60}
                y1={from.y + 24}
                x2={to.x + 60}
                y2={to.y}
                stroke={topologyOk ? "#34d399" : "#f87171"}
                strokeWidth={1}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {TOPOLOGY_NODES.map((n) => (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
              <rect
                width={n.id === "risks" ? 120 : 120}
                height={24}
                rx={3}
                fill="#0f172a"
                stroke={topologyOk ? "#34d399" : "#f87171"}
                strokeWidth={1}
              />
              <text x={60} y={15} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#e2e8f0">
                {n.label}
              </text>
            </g>
          ))}
        </svg>
        <p className="mt-2 text-[10px] text-slate-500">
          Boxes are green when the last self-test run reported no blocking failures, red otherwise.
        </p>
      </section>
    </div>
  );
}
