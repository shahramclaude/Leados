"use client";

import { useApp } from "@/lib/AppContext";
import { APP_ROUTES } from "@/lib/routes";

export default function AboutView() {
  const { orchestratorResult, agentStatus, sseConnected } = useApp();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <span className="font-mono text-sm font-bold tracking-[0.25em] text-indigo-400">LEADOS</span>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Leados is a cognitive command center for executives: a continuously-running intelligence layer that
          watches every domain of the business, surfaces findings with calibrated confidence, tests hypotheses
          against incoming evidence, and tells you — in under three seconds — what needs your attention right now.
        </p>
      </header>

      <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">SYSTEM STATUS</h2>
        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
          <span className="text-slate-500">Realtime connection</span>
          <span className={sseConnected ? "text-emerald-400" : "text-red-400"}>{sseConnected ? "CONNECTED" : "DISCONNECTED"}</span>
          <span className="text-slate-500">Agent status</span>
          <span className="text-slate-300">{(agentStatus?.status ?? "idle").toUpperCase()}</span>
          <span className="text-slate-500">Org health score</span>
          <span className="text-slate-300">{orchestratorResult?.orgHealthScore ?? "—"}</span>
          <span className="text-slate-500">Snapshot generated</span>
          <span className="text-slate-300">
            {orchestratorResult ? new Date(orchestratorResult.generatedAt).toLocaleString() : "—"}
          </span>
        </div>
      </section>

      <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">ROUTES</h2>
        <ul className="space-y-1 text-xs text-slate-400">
          {APP_ROUTES.map((r) => (
            <li key={r.path} className="flex items-center gap-2">
              <span className="font-mono text-indigo-400">{r.icon}</span>
              <span className="text-slate-300">{r.label}</span>
              <span className="font-mono text-slate-600">{r.path}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">KEYBOARD</h2>
        <div className="text-xs text-slate-400">
          <span className="font-mono text-indigo-400">⌘K</span> / <span className="font-mono text-indigo-400">Ctrl+K</span> — open command palette
        </div>
      </section>
    </div>
  );
}
