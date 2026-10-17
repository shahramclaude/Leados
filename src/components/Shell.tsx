import { ReactNode } from 'react';
import { cn } from '../utils/cn';

export type Tab = 'today' | 'roster' | 'docs' | 'memory' | 'improve' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'roster', label: 'Roster' },
  { id: 'docs', label: 'Docs (self-generated)' },
  { id: 'memory', label: 'Institutional Memory' },
  { id: 'improve', label: 'Self-Improve' },
  { id: 'about', label: 'Provenance / About' },
];

export function Shell({ active, onChange, children }: { active: Tab; onChange: (t: Tab) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
              L
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">LeadOS pt-N</p>
              <p className="text-xs text-slate-400">Final unification architecture — sandbox build</p>
            </div>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Unverified spec, original implementation — see About
          </span>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active === t.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
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
