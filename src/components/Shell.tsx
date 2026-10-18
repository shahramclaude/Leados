import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export type Tab = 'overview' | 'scenarios' | 'living-docs' | 'console' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'scenarios', label: 'Scenario Planning' },
  { id: 'living-docs', label: 'Living Strategy' },
  { id: 'console', label: 'Signal Console' },
  { id: 'about', label: 'About / Provenance' },
];

export function Shell({
  active,
  onChange,
  onReset,
  children,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">L</div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">LEADOS — Federated Scenarios &amp; Living Strategy</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">A distribution of futures, each fully modeled — plus strategy documents that check themselves against reality.</p>
          </div>
          <button
            onClick={onReset}
            className="h-fit whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Reset synthetic data
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
