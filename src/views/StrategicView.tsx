"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ScenarioResult {
  id: string;
  name: string;
  domain: string;
  probability: number;
  previousProbability: number;
  delta: number;
  activated: boolean;
  status: "monitoring" | "activated" | "resolved";
  matchedEventCount: number;
  narrative: string;
  playbook: string[];
}

interface MonteCarloResult {
  iterations: number;
  mean: number;
  median: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  histogram: { bucketStart: number; bucketEnd: number; count: number }[];
}

interface DecisionIntelligence {
  decisionId: string;
  title: string;
  domain: string;
  impact: number;
  probability: number;
  priorityScore: number;
  outcomeDistribution: MonteCarloResult;
  recommendation: string;
}

interface RealOptionSummary {
  decisionId: string;
  title: string;
  daysRemaining: number;
  optionValue: number;
  theta: number;
  thetaPerDay: number;
  isDecayingFast: boolean;
  recommendation: "decide_now" | "wait" | "monitor";
}

interface WargameAlert {
  domain: string;
  threat: string;
  response: string;
  confidence: number;
  urgency: "low" | "medium" | "high" | "critical";
  findingId: string;
}

interface OkrHealth {
  id: string;
  progress: number;
  expectedProgress: number;
  score: number;
  status: "on_track" | "at_risk" | "off_track";
  daysRemaining: number;
}

interface OkrNode {
  id: string;
  title: string;
  type: "objective" | "key_result";
  parentId: string | null;
  targetValue: string;
  currentValue: string;
  unit: string | null;
  quarter: string;
  health: OkrHealth;
}

interface OKRHealthReport {
  totalOkrs: number;
  onTrackPct: number;
  atRiskCount: number;
  offTrackCount: number;
  nodes: OkrNode[];
}

interface StrategicIntelligenceReport {
  strategicHealthScore: number;
  activeScenarios: ScenarioResult[];
  criticalDecisions: DecisionIntelligence[];
  realOptionsValuation: RealOptionSummary[];
  okrHealth: OKRHealthReport | null;
  wargameAlerts: WargameAlert[];
  strategicNarratives: string[];
  generatedAt: string;
}

const RAG_COLOR: Record<string, string> = {
  on_track: "bg-emerald-500",
  at_risk: "bg-amber-500",
  off_track: "bg-rose-500",
};

const URGENCY_COLOR: Record<string, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-100 text-rose-800",
};

function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Illustrative uncertainty histogram around a scenario's probability (client-side, decorative). */
function illustrativeHistogram(probability: number, matched: number): number[] {
  const rand = pseudoRandom(Math.round(probability * 10000) + matched);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 300; i += 1) {
    const noise = (rand() - 0.5) * 0.3;
    const sample = Math.min(0.999, Math.max(0.001, probability + noise));
    const idx = Math.min(9, Math.floor(sample * 10));
    buckets[idx] += 1;
  }
  return buckets;
}

function Histogram({ data, height = 80 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <svg viewBox={`0 0 200 ${height}`} className="w-full" preserveAspectRatio="none">
      {data.map((v, i) => {
        const barHeight = (v / max) * (height - 4);
        const barWidth = 200 / data.length - 2;
        return (
          <rect
            key={i}
            x={i * (200 / data.length) + 1}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            className="fill-indigo-400"
          />
        );
      })}
    </svg>
  );
}

export default function StrategicView() {
  const [report, setReport] = useState<StrategicIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/strategic");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load strategic intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const topScenario = useMemo(() => {
    if (!report || report.activeScenarios.length === 0) return null;
    return [...report.activeScenarios].sort((a, b) => b.probability - a.probability)[0];
  }, [report]);

  const decayingDecisions = useMemo(
    () => report?.realOptionsValuation.filter((o) => o.isDecayingFast).length ?? 0,
    [report],
  );

  async function createDecisionFromAlert(alert: WargameAlert) {
    setBusyId(alert.findingId || alert.threat);
    try {
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Respond to: ${alert.threat}`,
          description: `Wargame-suggested response: ${alert.response}`,
          domain: alert.domain,
          status: "open",
          impact: alert.urgency === "critical" ? 5 : alert.urgency === "high" ? 4 : 3,
          probability: alert.confidence,
          context: { source: "wargame", alert },
        }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function decideNow(decisionId: string) {
    setBusyId(decisionId);
    try {
      await fetch(`/api/decisions/${decisionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "decided" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function updateOkrValue(id: string, value: number) {
    setBusyId(id);
    try {
      await fetch(`/api/okr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentValue: value }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-slate-500">Loading strategic intelligence…</p>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-rose-600">{error ?? "No data available."}</p>
      </main>
    );
  }

  const objectives = report.okrHealth?.nodes.filter((n) => n.type === "objective") ?? [];
  const keyResultsByParent = new Map<string, OkrNode[]>();
  for (const node of report.okrHealth?.nodes ?? []) {
    if (node.type === "key_result" && node.parentId) {
      const arr = keyResultsByParent.get(node.parentId) ?? [];
      arr.push(node);
      keyResultsByParent.set(node.parentId, arr);
    }
  }

  const selected = report.activeScenarios.find((s) => s.id === selectedScenario) ?? null;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold text-slate-950">Strategic Intelligence</h1>
        <p className="mt-1 text-sm text-slate-500">Generated {new Date(report.generatedAt).toLocaleString()}</p>
      </header>

      {/* TOP SECTION */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="col-span-1 rounded-2xl bg-slate-950 p-6 text-white shadow-lg md:col-span-1">
          <p className="text-xs uppercase tracking-wide text-slate-300">Strategic health</p>
          <p className="mt-2 text-5xl font-bold">{report.strategicHealthScore}</p>
          <p className="mt-1 text-xs text-slate-400">out of 100</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active scenarios</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{report.activeScenarios.length}</p>
          <p className="mt-1 text-sm text-slate-600 truncate">
            {topScenario ? `${topScenario.name} @ ${(topScenario.probability * 100).toFixed(0)}%` : "None tracked"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-wide text-slate-500">Critical decisions</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{decayingDecisions}</p>
          <p className="mt-1 text-sm text-slate-600">need action now (negative theta)</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-wide text-slate-500">OKR health</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {report.okrHealth ? `${report.okrHealth.onTrackPct}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {report.okrHealth ? `${report.okrHealth.totalOkrs} tracked OKRs` : "No OKRs tracked yet"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <p className="text-xs uppercase tracking-wide text-indigo-500">Narrative</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-indigo-900">
          {report.strategicNarratives.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>

      {/* SCENARIO PANEL */}
      <section>
        <h2 className="text-xl font-semibold text-slate-950">Scenario probability timeline</h2>
        {report.activeScenarios.length === 0 ? (
          <p className="mt-2 text-slate-500">No scenarios are currently monitored.</p>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="relative h-10 w-full rounded-full bg-slate-100">
              {report.activeScenarios.map((s) => (
                <button
                  key={s.id}
                  title={`${s.name}: ${(s.probability * 100).toFixed(0)}%`}
                  onClick={() => setSelectedScenario(s.id === selectedScenario ? null : s.id)}
                  style={{ left: `calc(${s.probability * 100}% - 8px)` }}
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow ${
                    s.activated ? "bg-rose-500" : "bg-indigo-500"
                  } ${selectedScenario === s.id ? "ring-2 ring-offset-2 ring-slate-900" : ""}`}
                />
              ))}
              <span className="absolute -bottom-6 left-0 text-xs text-slate-400">0%</span>
              <span className="absolute -bottom-6 right-0 text-xs text-slate-400">100%</span>
            </div>

            <div className="mt-10 flex flex-wrap gap-2">
              {report.activeScenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScenario(s.id === selectedScenario ? null : s.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    s.activated ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {s.name} · {(s.probability * 100).toFixed(0)}%
                </button>
              ))}
            </div>

            {selected && (
              <div className="mt-6 grid gap-6 rounded-xl border border-slate-100 bg-slate-50 p-5 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{selected.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{selected.narrative}</p>
                  <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Suggested playbook</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {selected.playbook.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Illustrative probability distribution (n=300)
                  </p>
                  <div className="mt-2 rounded-lg bg-white p-3">
                    <Histogram data={illustrativeHistogram(selected.probability, selected.matchedEventCount)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* WARGAME ALERTS */}
      <section>
        <h2 className="text-xl font-semibold text-slate-950">Wargame alerts</h2>
        {report.wargameAlerts.length === 0 ? (
          <p className="mt-2 text-slate-500">No high-confidence adversary responses simulated right now.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {report.wargameAlerts.map((alert, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY_COLOR[alert.urgency]}`}>
                      {alert.urgency}
                    </span>
                    <p className="mt-2 font-medium text-slate-900">{alert.threat}</p>
                    <p className="mt-1 text-sm text-slate-600">Likely response: {alert.response}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Confidence {(alert.confidence * 100).toFixed(0)}% · domain {alert.domain}
                    </p>
                  </div>
                  <button
                    onClick={() => createDecisionFromAlert(alert)}
                    disabled={busyId === (alert.findingId || alert.threat)}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Create decision
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* OKR HEALTH TREE */}
      <section>
        <h2 className="text-xl font-semibold text-slate-950">OKR health tree</h2>
        {!report.okrHealth ? (
          <p className="mt-2 text-slate-500">No OKRs tracked yet. Add objectives via the OKR API to see health here.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {objectives.map((obj) => {
              const krs = keyResultsByParent.get(obj.id) ?? [];
              const isOpen = expanded.has(obj.id);
              return (
                <div key={obj.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <button onClick={() => toggleExpand(obj.id)} className="flex w-full items-center gap-3 text-left">
                    <span className={`h-3 w-3 rounded-full ${RAG_COLOR[obj.health.status]}`} />
                    <span className="flex-1 font-medium text-slate-900">{obj.title}</span>
                    <span className="text-xs text-slate-400">{obj.quarter}</span>
                    <span className="text-xs text-slate-400">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${RAG_COLOR[obj.health.status]}`}
                      style={{ width: `${Math.min(100, obj.health.progress * 100)}%` }}
                    />
                  </div>
                  {isOpen && (
                    <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                      {krs.length === 0 && <p className="text-sm text-slate-400">No key results yet.</p>}
                      {krs.map((kr) => (
                        <div key={kr.id} className="flex items-center gap-3">
                          <span className={`h-2.5 w-2.5 rounded-full ${RAG_COLOR[kr.health.status]}`} />
                          <span className="flex-1 text-sm text-slate-800">{kr.title}</span>
                          <input
                            type="number"
                            defaultValue={kr.currentValue}
                            onBlur={(e) => updateOkrValue(kr.id, Number(e.target.value))}
                            disabled={busyId === kr.id}
                            className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-slate-400">/ {kr.targetValue} {kr.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* DECISION INTELLIGENCE */}
      <section>
        <h2 className="text-xl font-semibold text-slate-950">Decision intelligence</h2>
        {report.realOptionsValuation.length === 0 ? (
          <p className="mt-2 text-slate-500">No deferred/pending decisions with a deadline right now.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Days remaining</th>
                  <th className="px-4 py-3">Option value</th>
                  <th className="px-4 py-3">Theta / day</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {report.realOptionsValuation.map((o) => (
                  <tr key={o.decisionId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{o.title}</td>
                    <td className="px-4 py-3">{o.daysRemaining}</td>
                    <td className="px-4 py-3">${o.optionValue.toLocaleString()}</td>
                    <td className={`px-4 py-3 ${o.isDecayingFast ? "text-rose-600 font-semibold" : "text-slate-600"}`}>
                      {o.thetaPerDay.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => decideNow(o.decisionId)}
                        disabled={busyId === o.decisionId}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        Decide now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
