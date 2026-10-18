import type { ReactNode } from 'react';
import type { CognitiveLoadResult } from '../lib/cognitiveLoad';

export type Route = 'today' | 'hypothesis' | 'emergent' | 'agent' | 'log' | 'about';

const NAV: { id: Route; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'hypothesis', label: 'Hypothesis Engine' },
  { id: 'emergent', label: 'Emergent Patterns' },
  { id: 'agent', label: 'Autonomous Agent' },
  { id: 'log', label: 'Event Log' },
  { id: 'about', label: 'About / Provenance' },
];

function loadBadgeClasses(level: CognitiveLoadResult['level']) {
  if (level === 'HIGH') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (level === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function Shell({
  route,
  onNavigate,
  cognitiveLoad,
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  cognitiveLoad: CognitiveLoadResult;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              pt-V
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-900">LeadOS · Self-Sovereign Intelligence</div>
              <div className="text-xs leading-tight text-slate-500">Sandbox build — see About for provenance</div>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${loadBadgeClasses(cognitiveLoad.level)}`}
            title={cognitiveLoad.label}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  cognitiveLoad.level === 'HIGH' ? 'animate-ping bg-rose-500' : ''
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  cognitiveLoad.level === 'HIGH' ? 'bg-rose-500' : cognitiveLoad.level === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            Cognitive load: {cognitiveLoad.level} ({cognitiveLoad.score})
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 pb-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                route === n.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-6 pb-10 pt-4 text-xs text-slate-400">
        State lives only in this browser's localStorage (key <code className="rounded bg-slate-100 px-1 py-0.5">leados-ptv:v1</code>). No network calls, no accounts.
      </footer>
    </div>
  );
}

export function Panel({ title, subtitle, children, dense }: { title: string; subtitle?: string; children: ReactNode; dense?: boolean }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${dense ? 'p-4' : 'p-6'}`}>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-500">{children}</p>;
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
