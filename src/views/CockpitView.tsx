"use client";

import { useAppContext } from "@/lib/AppContext";
import { DOMAINS } from "@/lib/types";
import { NAV_ITEMS, domainHref } from "@/lib/nav";
import { Card, ErrorPanel, LoadingPanel, SevBadge, StatusPill, ViewHeader } from "@/components/ui";

export default function CockpitView() {
  const { result, error } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const topFindings = result.findings
    .filter((f) => f.status === "open")
    .slice()
    .sort((a, b) => b.sev - a.sev || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div>
      <ViewHeader title="Cockpit" subtitle={`Organization-wide rollup \u00b7 generated ${new Date(result.generatedAt).toLocaleString()}`} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {DOMAINS.filter((d) => d !== "cockpit").map((domain) => {
          const health = result.domainHealth[domain];
          const nav = NAV_ITEMS.find((n) => n.domain === domain);
          return (
            <a key={domain} href={domainHref(domain)}>
              <Card className="h-full hover:border-indigo-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{nav?.label ?? domain}</span>
                  <StatusPill status={health.status} />
                </div>
                <p className="mt-2 font-mono text-2xl text-slate-100">{health.score}</p>
                <p className="text-xs text-slate-500">{health.criticalFindings} critical finding(s)</p>
              </Card>
            </a>
          );
        })}
      </div>

      {result.monteCarlo && (
        <Card className="mb-6">
          <p className="text-sm font-medium text-slate-200">Runway (Monte Carlo, 1,000 trials)</p>
          <div className="mt-2 flex gap-6 font-mono text-sm text-slate-300">
            <span>p10: {result.monteCarlo.p10.toFixed(1)}mo</span>
            <span>p50: {result.monteCarlo.p50.toFixed(1)}mo</span>
            <span>p90: {result.monteCarlo.p90.toFixed(1)}mo</span>
          </div>
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Top findings</p>
        {topFindings.length === 0 && <p className="text-sm text-slate-500">No open findings. All clear.</p>}
        <ul className="divide-y divide-slate-800">
          {topFindings.map((f) => (
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
