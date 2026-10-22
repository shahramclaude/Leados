"use client";

import { useState } from "react";
import { ProcessShell, ProvenanceBanner } from "@/components/processMining/ProcessShell";
import { formatDuration, formatNumber, formatPct, heatClass } from "@/components/processMining/format";

interface Bottleneck {
  activity: string;
  occurrences: number;
  distinctResources: number;
  avgActiveMs: number;
  avgQueueMs: number;
  p85QueueMs: number;
  totalQueueMs: number;
  rootCauseHypothesis: string;
  flagged: boolean;
}
interface QueueRow {
  activity: string;
  lambdaPerHour: number;
  muPerHour: number;
  servers: number;
  utilization: number;
  wipTimeAverage: number;
  wMeasuredMs: number;
  wLittleMs: number;
  littlesLawDeltaPct: number;
  trend: { direction: string; slopePerPeriod: number };
}
interface BusFactorRow {
  activity: string;
  distinctResources: number;
  topResourceShare: number;
  redacted: boolean;
  topResourceId: string | null;
  risk: string;
}
interface Data {
  ok: boolean;
  error?: string;
  provenance?: string;
  bottlenecks?: Bottleneck[];
  queueing?: QueueRow[];
  busFactor?: BusFactorRow[];
}

export default function BottleneckBoardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (processName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/process-mining/overview?processName=${encodeURIComponent(processName)}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const bottlenecks = data?.bottlenecks ?? [];
  const maxWait = Math.max(1, ...bottlenecks.map((b) => b.p85QueueMs));
  const queueing = data?.queueing ?? [];
  const busFactor = data?.busFactor ?? [];

  return (
    <ProcessShell onProcessChange={load}>
      {() => (
        <div>
          {loading && <p className="text-sm text-slate-500">Decomposing active vs. queue time…</p>}
          {!loading && data && !data.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{data.error}</div>
          )}
          {!loading && data?.ok && (
            <>
              <ProvenanceBanner text={data.provenance ?? ""} />

              <section>
                <h2 className="text-lg font-semibold text-slate-900">Ranked waits</h2>
                <p className="text-sm text-slate-600">Ranked by p85 queue wait with a root-cause hypothesis drill: resource, handoff, or approval.</p>
                <div className="mt-3 space-y-2">
                  {bottlenecks.map((b, idx) => (
                    <div key={b.activity} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-900">{b.activity}</span>
                          {b.flagged && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">flagged</span>}
                        </div>
                        <span className={`rounded px-2 py-1 text-sm font-medium ${heatClass(b.p85QueueMs, maxWait)}`}>
                          p85 wait: {formatDuration(b.p85QueueMs)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600 md:grid-cols-4">
                        <span>Occurrences: {b.occurrences}</span>
                        <span>Distinct resources: {b.distinctResources}</span>
                        <span>Avg active: {formatDuration(b.avgActiveMs)}</span>
                        <span>Avg wait: {formatDuration(b.avgQueueMs)}</span>
                      </div>
                      <p className="mt-2 text-sm italic text-slate-700">Root cause hypothesis: {b.rootCauseHypothesis}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900">Queueing analytics</h2>
                <p className="text-sm text-slate-600">
                  λ = arrival rate, μ = service rate, ρ = utilization. W (sojourn time) is estimated two independent ways —
                  directly measured, and via Little&apos;s Law (W = L/λ) — the delta validates internal consistency.
                </p>
                <div className="mt-3 overflow-auto rounded border border-slate-200 bg-white">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Activity</th>
                        <th className="px-3 py-2">λ/hr</th>
                        <th className="px-3 py-2">μ/hr</th>
                        <th className="px-3 py-2">Servers</th>
                        <th className="px-3 py-2">ρ</th>
                        <th className="px-3 py-2">WIP (L)</th>
                        <th className="px-3 py-2">W measured</th>
                        <th className="px-3 py-2">W (Little&apos;s)</th>
                        <th className="px-3 py-2">Δ%</th>
                        <th className="px-3 py-2">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueing.map((q) => (
                        <tr key={q.activity} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-medium">{q.activity}</td>
                          <td className="px-3 py-1.5">{formatNumber(q.lambdaPerHour)}</td>
                          <td className="px-3 py-1.5">{formatNumber(q.muPerHour)}</td>
                          <td className="px-3 py-1.5">{q.servers}</td>
                          <td className={`px-3 py-1.5 ${q.utilization > 0.85 ? "bg-red-100 text-red-800" : ""}`}>
                            {formatNumber(q.utilization)}
                          </td>
                          <td className="px-3 py-1.5">{formatNumber(q.wipTimeAverage)}</td>
                          <td className="px-3 py-1.5">{formatDuration(q.wMeasuredMs)}</td>
                          <td className="px-3 py-1.5">{formatDuration(q.wLittleMs)}</td>
                          <td className="px-3 py-1.5">{formatNumber(q.littlesLawDeltaPct)}%</td>
                          <td className="px-3 py-1.5 capitalize">{q.trend.direction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900">Bus factor of process knowledge</h2>
                <p className="text-sm text-slate-600">
                  Aggregate-safe: steps observed with fewer than 3 distinct resources have the specific resource identity
                  redacted — only the risk level is shown.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {busFactor.map((bf) => (
                    <div key={bf.activity} className="rounded border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{bf.activity}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            bf.risk === "high" ? "bg-red-100 text-red-800" : bf.risk === "medium" ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {bf.risk} risk
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">
                        Top resource share: {formatPct(bf.topResourceShare)} · {bf.distinctResources} distinct resource(s)
                      </p>
                      <p className="text-slate-500">
                        {bf.redacted ? "Resource identity withheld (fewer than 3 resources observed)." : `Concentrated on: ${bf.topResourceId}`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </ProcessShell>
  );
}
