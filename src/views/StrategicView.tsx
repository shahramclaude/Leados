"use client";

import { useAppContext } from "@/lib/AppContext";
import { Card, EmptyPanel, ErrorPanel, LoadingPanel, SevBadge, ViewHeader } from "@/components/ui";

export default function StrategicView() {
  const { result, error } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const decisions = result.decisions.filter((d) => d.domain === "strategic");
  const scenarios = result.scenarios.filter((s) => s.domain === "strategic");
  const okrs = result.okrs.filter((o) => o.domain === "strategic");

  return (
    <div className="space-y-6">
      <ViewHeader title="Strategic" subtitle="Open decisions, active scenarios, and OKR pacing." />

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">OKRs</p>
        {okrs.length === 0 && <p className="text-sm text-slate-500">No strategic OKRs.</p>}
        <ul className="space-y-2">
          {okrs.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-200">{o.title}</p>
                <p className="text-xs text-slate-500">
                  progress {(o.progress * 100).toFixed(0)}% \u00b7 time elapsed {(o.timeElapsed * 100).toFixed(0)}%
                </p>
              </div>
              <span className="text-xs font-mono uppercase text-slate-400">{o.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Open decisions</p>
        {decisions.filter((d) => d.status === "open").length === 0 && <EmptyPanel message="No open strategic decisions." />}
        <ul className="divide-y divide-slate-800">
          {decisions
            .filter((d) => d.status === "open")
            .map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-200">{d.title}</span>
                <SevBadge sev={d.sev} />
              </li>
            ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Active scenarios</p>
        {scenarios.filter((s) => s.status === "active").length === 0 && <EmptyPanel message="No active strategic scenarios." />}
        <ul className="divide-y divide-slate-800">
          {scenarios
            .filter((s) => s.status === "active")
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-200">{s.title}</span>
                <SevBadge sev={s.sev} />
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
