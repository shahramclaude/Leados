"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/AppContext";
import { useNowTick } from "@/lib/useNowTick";
import { DOMAIN_META, healthColor, severityColor, timeAgo } from "@/lib/domains";
import type { Domain } from "@/lib/types";

// Shared layout for the six domain-scoped views (People, Strategic,
// Financial, Execution, Signals share this shell; Hypotheses and About
// have bespoke layouts). Keeps every domain page visually consistent:
// health header -> findings -> decisions -> playbooks.
export default function DomainView({ domain, description }: { domain: Domain; description: string }) {
  const { orchestratorResult, openSidePanel, dismissFinding } = useApp();
  const now = useNowTick();
  const meta = DOMAIN_META[domain];

  const findings = useMemo(
    () => (orchestratorResult ? orchestratorResult.findings.filter((f) => f.domain === domain && !f.dismissed) : []),
    [orchestratorResult, domain],
  );
  const decisions = useMemo(
    () => (orchestratorResult ? orchestratorResult.decisions.filter((d) => d.domain === domain) : []),
    [orchestratorResult, domain],
  );
  const playbooks = useMemo(
    () => (orchestratorResult ? orchestratorResult.playbooks.filter((p) => p.domain === domain) : []),
    [orchestratorResult, domain],
  );
  const people = useMemo(
    () => (orchestratorResult ? orchestratorResult.people.filter((p) => p.domain === domain) : []),
    [orchestratorResult, domain],
  );

  if (!orchestratorResult) {
    return <div className="p-4 font-mono text-xs text-slate-500">LOADING…</div>;
  }

  const score = orchestratorResult.domainHealth[domain];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
            <h1 className="text-lg font-semibold text-slate-100">{meta.label}</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold" style={{ color: healthColor(score) }}>
            {score}
          </div>
          <div className="font-mono text-[9px] tracking-widest text-slate-500">HEALTH</div>
        </div>
      </header>

      <section>
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">ACTIVE FINDINGS ({findings.length})</h2>
        {findings.length === 0 ? (
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4 text-center font-mono text-xs text-slate-500">
            NO ACTIVE FINDINGS IN THIS DOMAIN
          </div>
        ) : (
          <div className="space-y-2">
            {findings.map((f) => (
              <div
                key={f.id}
                className={`rounded border-l-2 p-3 ${
                  f.severity >= 5 ? "border-red-600 bg-red-950/40" : f.severity === 4 ? "border-amber-600 bg-amber-950/25" : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => openSidePanel("finding", f.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
                        style={{ backgroundColor: severityColor(f.severity) }}
                      >
                        SEV {f.severity}
                      </span>
                      <span className="truncate text-sm text-slate-100">{f.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{f.detail}</p>
                    <span className="mt-1 block font-mono text-[9px] text-slate-500">{timeAgo(f.createdAt, now)} · confidence {Math.round(f.confidence * 100)}%</span>
                  </button>
                  <button
                    onClick={() => dismissFinding(f.id)}
                    className="shrink-0 rounded bg-slate-800 px-2 py-1 font-mono text-[9px] text-slate-300 hover:bg-slate-700"
                  >
                    DISMISS
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {domain === "people" && people.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">ROSTER ({people.length})</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => openSidePanel("person", p.id)}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3 text-left"
              >
                <div className="text-sm text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-500">{p.role}</div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full"
                    style={{ width: `${p.riskScore * 100}%`, backgroundColor: severityColor(p.riskScore > 0.6 ? 5 : p.riskScore > 0.3 ? 4 : 1) }}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">DECISIONS ({decisions.length})</h2>
        {decisions.length === 0 ? (
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4 text-center font-mono text-xs text-slate-500">
            NO OPEN DECISIONS
          </div>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => (
              <button
                key={d.id}
                onClick={() => openSidePanel("decision", d.id)}
                className="flex w-full items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3 text-left"
              >
                <span className="text-sm text-slate-200">{d.title}</span>
                <span className="font-mono text-[9px] text-slate-500">
                  {d.deadline ? new Date(d.deadline).toLocaleString() : "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">PLAYBOOKS ({playbooks.length})</h2>
        {playbooks.length === 0 ? (
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4 text-center font-mono text-xs text-slate-500">
            NO PLAYBOOKS TRIGGERED
          </div>
        ) : (
          <div className="space-y-2">
            {playbooks.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
                <span className="text-sm text-slate-200">{p.title}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[9px] text-slate-400">{p.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
