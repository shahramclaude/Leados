"use client";

import { useState } from "react";
import { ProcessShell, ProvenanceBanner } from "@/components/processMining/ProcessShell";
import { formatDuration, formatNumber, heatClass } from "@/components/processMining/format";

interface Edge {
  from: string;
  to: string;
  count: number;
  gap: { avgMs: number; p85Ms: number; count: number };
  dependency: number;
  kept: boolean;
}
interface ModelData {
  ok: boolean;
  error?: string;
  provenance?: string;
  model?: {
    activities: string[];
    edges: Edge[];
    startActivities: { activity: string; count: number }[];
    endActivities: { activity: string; count: number }[];
    caseCount: number;
  };
}
interface CaseSummary {
  caseId: string;
  startedAt: string;
  endedAt: string;
  cycleTimeMs: number;
  open: boolean;
  ambiguous: boolean;
  issues: string[];
  activityPath: string[];
}
interface CaseEvent {
  eventId: string;
  activity: string;
  resourceId: string | null;
  occurredAt: string;
  durationMs: number;
  queueMs: number;
}

export default function XRayPage() {
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [processName, setProcessName] = useState("benchmark_flow");
  const [filterActivity, setFilterActivity] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseEvent[] | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const load = async (name: string) => {
    setProcessName(name);
    setLoading(true);
    try {
      const res = await fetch(`/api/process-mining/overview?processName=${encodeURIComponent(name)}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  const loadCasesForActivity = async (activity: string) => {
    setFilterActivity(activity);
    setSelectedCase(null);
    const res = await fetch(`/api/process-mining/cases?processName=${encodeURIComponent(processName)}`);
    const json = await res.json();
    if (json.ok) {
      setCases((json.cases as CaseSummary[]).filter((c) => c.activityPath.includes(activity)).slice(0, 25));
    }
  };

  const openCase = async (caseId: string) => {
    setSelectedCaseId(caseId);
    const res = await fetch(
      `/api/process-mining/cases?processName=${encodeURIComponent(processName)}&caseId=${encodeURIComponent(caseId)}`,
    );
    const json = await res.json();
    if (json.ok) setSelectedCase(json.case.events);
  };

  const edges = data?.model?.edges ?? [];
  const maxP85 = Math.max(1, ...edges.map((e) => e.gap.p85Ms));

  return (
    <ProcessShell onProcessChange={load}>
      {() => (
        <div>
          {loading && <p className="text-sm text-slate-500">Mining directly-follows graph…</p>}
          {!loading && data && !data.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{data.error}</div>
          )}
          {!loading && data?.ok && data.model && (
            <>
              <ProvenanceBanner text={data.provenance ?? ""} />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Start / End activities (observed)</h2>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-600">Starts</p>
                      <ul className="mt-1 space-y-1">
                        {data.model.startActivities.map((s) => (
                          <li key={s.activity} className="flex justify-between rounded bg-white px-2 py-1">
                            <span>{s.activity}</span>
                            <span className="text-slate-500">{s.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">Ends</p>
                      <ul className="mt-1 space-y-1">
                        {data.model.endActivities.map((s) => (
                          <li key={s.activity} className="flex justify-between rounded bg-white px-2 py-1">
                            <span>{s.activity}</span>
                            <span className="text-slate-500">{s.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Case explorer</h2>
                  <p className="text-sm text-slate-600">
                    {filterActivity ? `Cases passing through "${filterActivity}":` : "Click an activity row's From/To in the table to see real cases."}
                  </p>
                  <div className="mt-2 max-h-56 overflow-auto rounded border border-slate-200 bg-white">
                    {cases.map((c) => (
                      <button
                        key={c.caseId}
                        onClick={() => openCase(c.caseId)}
                        className={`block w-full border-b border-slate-100 px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${
                          selectedCaseId === c.caseId ? "bg-slate-100" : ""
                        }`}
                      >
                        <span className="font-mono">{c.caseId}</span> · {formatDuration(c.cycleTimeMs)} ·{" "}
                        {c.ambiguous ? <span className="text-amber-600">ambiguous</span> : null}{" "}
                        {c.open ? <span className="text-slate-400">open</span> : null}
                        <span className="block text-slate-500">{c.activityPath.join(" → ")}</span>
                      </button>
                    ))}
                    {cases.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No case selected yet.</p>}
                  </div>
                  {selectedCase && (
                    <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs">
                      <p className="mb-1 font-semibold">Timeline — {selectedCaseId}</p>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="py-1">Activity</th>
                            <th>Resource</th>
                            <th>Queue</th>
                            <th>Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCase.map((e) => (
                            <tr key={e.eventId} className="border-t border-slate-100">
                              <td className="py-1">{e.activity}</td>
                              <td>{e.resourceId ?? "—"}</td>
                              <td>{formatDuration(e.queueMs)}</td>
                              <td>{formatDuration(e.durationMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <section className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900">Directly-follows graph (mined)</h2>
                <p className="text-sm text-slate-600">
                  Heuristics-Miner-lite: edges kept in the model clear a minimum frequency and dependency-score filter.
                  Wait-time heat is the p85 queue wait observed immediately before the &ldquo;to&rdquo; activity began.
                </p>
                <div className="mt-3 overflow-auto rounded border border-slate-200 bg-white">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">From</th>
                        <th className="px-3 py-2">To</th>
                        <th className="px-3 py-2">Count</th>
                        <th className="px-3 py-2">Dependency</th>
                        <th className="px-3 py-2">Avg wait</th>
                        <th className="px-3 py-2">P85 wait</th>
                        <th className="px-3 py-2">In model?</th>
                        <th className="px-3 py-2">Cases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {edges.map((e) => (
                        <tr key={`${e.from}->${e.to}`} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-medium">{e.from}</td>
                          <td className="px-3 py-1.5 font-medium">{e.to}</td>
                          <td className="px-3 py-1.5">{e.count}</td>
                          <td className="px-3 py-1.5">{formatNumber(e.dependency)}</td>
                          <td className="px-3 py-1.5">{formatDuration(e.gap.avgMs)}</td>
                          <td className={`px-3 py-1.5 ${heatClass(e.gap.p85Ms, maxP85)}`}>{formatDuration(e.gap.p85Ms)}</td>
                          <td className="px-3 py-1.5">
                            {e.kept ? <span className="text-emerald-700">kept</span> : <span className="text-slate-400">filtered (rare)</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <button className="text-blue-700 underline" onClick={() => loadCasesForActivity(e.to)}>
                              view
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </ProcessShell>
  );
}
