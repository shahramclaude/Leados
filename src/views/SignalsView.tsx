"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { DOMAINS, type DomainKey } from "@/lib/types";
import { Card, ErrorPanel, LoadingPanel, SevBadge, StatusPill, ViewHeader } from "@/components/ui";

export default function SignalsView() {
  const { result, error } = useAppContext();
  const [filter, setFilter] = useState<DomainKey | "all">("all");

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const findings = result.findings
    .filter((f) => f.status === "open")
    .filter((f) => filter === "all" || f.domain === filter)
    .slice()
    .sort((a, b) => b.sev - a.sev || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <ViewHeader title="Signal Board" subtitle="Every open finding across every domain, worst severity first." />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded border px-2 py-1 text-xs ${filter === "all" ? "border-indigo-600 text-indigo-300" : "border-slate-700 text-slate-400"}`}
        >
          All ({result.findings.filter((f) => f.status === "open").length})
        </button>
        {DOMAINS.filter((d) => d !== "signals" && d !== "about").map((d) => {
          const health = result.domainHealth[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setFilter(d)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${filter === d ? "border-indigo-600 text-indigo-300" : "border-slate-700 text-slate-400"}`}
            >
              {d}
              <StatusPill status={health.status} />
            </button>
          );
        })}
      </div>

      <Card>
        {findings.length === 0 && <p className="text-sm text-slate-500">No findings for this filter.</p>}
        <ul className="divide-y divide-slate-800">
          {findings.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm text-slate-200">{f.title}</p>
                <p className="text-xs text-slate-500">{f.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs uppercase text-slate-500">{f.domain}</span>
                <SevBadge sev={f.sev} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
