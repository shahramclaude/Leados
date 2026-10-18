import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

const NAV = [
  { route: '/today', label: 'Today' },
  { route: '/roster', label: 'Roster & Flight Risk' },
  { route: '/causal', label: 'Causal Model' },
  { route: '/counterfactual', label: 'Counterfactual' },
  { route: '/highpotential', label: 'High Potential' },
  { route: '/network', label: 'Power Network' },
  { route: '/meetings', label: 'Meetings' },
  { route: '/about', label: 'About / Provenance' },
];

export function Shell({ route, navigate, onReset, children }: { route: string; navigate: (r: string) => void; onReset: () => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">Q</div>
            <div>
              <div className="text-sm font-bold text-slate-900 leading-none">LeadOS pt-Q</div>
              <div className="text-[11px] text-slate-400 leading-none mt-0.5">Predictive Intelligence Architecture</div>
            </div>
          </div>
          <button
            onClick={onReset}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Reset synthetic data
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV.map((n) => (
            <button
              key={n.route}
              onClick={() => navigate(n.route)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                route === n.route ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
