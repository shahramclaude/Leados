"use client";

// LEADOS Part 14 — weekly Attention Report.
import { useCallback, useEffect, useState } from "react";
import { useActor } from "@/components/ActorProvider";

interface Report {
  windowStart: string;
  received: number;
  acted: number;
  dismissed: number;
  queuedToDigest: number;
  suppressed: number;
  estimatedCostMinutes: number;
  byClass: Record<string, { delivered: number; acted: number; dismissed: number }>;
}

export default function AttentionReportPage() {
  const { actor, loading } = useActor();
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    if (!actor) return;
    const res = await fetch(`/api/attention-report?userId=${actor.userId}`);
    setReport(await res.json());
  }, [actor]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !actor) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekly report · {actor.role}</p>
      <h1 className="text-2xl font-semibold text-slate-900">Your attention, last 7 days</h1>

      {!report ? (
        <p className="mt-6 text-sm text-slate-400">Loading report…</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Received" value={report.received} />
            <Stat label="Acted on" value={report.acted} />
            <Stat label="Dismissed" value={report.dismissed} />
            <Stat label="Queued to digest" value={report.queuedToDigest} />
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">
              Estimated cost of context-switching this week: <span className="font-semibold text-slate-900">{report.estimatedCostMinutes} minutes</span> (23 min
              per acted-on interrupt, 2 min per quick dismiss — an estimate, not a precise measurement).
            </p>
            <p className="mt-2 text-sm text-slate-500">{report.suppressed} interrupt(s) were suppressed by mute or focus mode this week.</p>
          </div>
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">By class</h2>
            <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Delivered</th>
                  <th className="px-4 py-2">Acted</th>
                  <th className="px-4 py-2">Dismissed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.byClass).map(([klass, stats]) => (
                  <tr key={klass} className="border-t border-slate-100">
                    <td className="px-4 py-2 capitalize">{klass}</td>
                    <td className="px-4 py-2">{stats.delivered}</td>
                    <td className="px-4 py-2">{stats.acted}</td>
                    <td className="px-4 py-2">{stats.dismissed}</td>
                  </tr>
                ))}
                {Object.keys(report.byClass).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                      No delivered interrupts in this window yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
