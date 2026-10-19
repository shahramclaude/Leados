"use client";

import { useAppContext } from "@/lib/AppContext";
import { Card, EmptyPanel, ErrorPanel, LoadingPanel, SevBadge, ViewHeader } from "@/components/ui";

export default function HypothesesView() {
  const { result, error, isRunning, triggerRun } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const byStatus = {
    open: result.hypotheses.filter((h) => h.status === "open"),
    confirmed: result.hypotheses.filter((h) => h.status === "confirmed"),
    dismissed: result.hypotheses.filter((h) => h.status === "dismissed"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <ViewHeader title="Hypotheses" subtitle="Autonomously generated hypotheses, deduplicated per person/signal." />
        <button
          type="button"
          onClick={() => void triggerRun()}
          disabled={isRunning}
          className="h-fit rounded border border-amber-700 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
        >
          {isRunning ? "Running\u2026" : "Run autonomous pass"}
        </button>
      </div>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Open ({byStatus.open.length})</p>
        {byStatus.open.length === 0 && <EmptyPanel message="No open hypotheses." />}
        <ul className="divide-y divide-slate-800">
          {byStatus.open.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-slate-200">{h.title}</p>
                <p className="text-xs text-slate-500">
                  {h.personName} \u00b7 {h.type}
                </p>
              </div>
              <SevBadge sev={h.sev} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Resolved</p>
        {byStatus.confirmed.length === 0 && byStatus.dismissed.length === 0 && <EmptyPanel message="No resolved hypotheses yet." />}
        <ul className="divide-y divide-slate-800">
          {[...byStatus.confirmed, ...byStatus.dismissed].map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <p className="text-sm text-slate-400">{h.title}</p>
              <span className="text-xs uppercase text-slate-500">{h.status}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
