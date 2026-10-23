import { useState } from 'react';
import { cn } from './utils/cn';
import Overview from './sections/Overview';
import Governance from './sections/Governance';
import QualityFabric from './sections/QualityFabric';
import DesignTokens from './sections/DesignTokens';
import DataOps from './sections/DataOps';
import GrandGate from './sections/GrandGate';

type SectionKey = 'overview' | 'governance' | 'quality' | 'tokens' | 'dataops' | 'gates';

const NAV: { key: SectionKey; label: string; hint: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', hint: 'Program pulse', icon: '◆' },
  { key: 'gates', label: 'Grand Gate', hint: 'Re-measured ledger', icon: '▦' },
  { key: 'quality', label: 'Quality Fabric', hint: 'Evals · mutation · drift', icon: '✓' },
  { key: 'governance', label: 'Governance', hint: 'Action Gate · tiers T0–T5', icon: '⛭' },
  { key: 'dataops', label: 'Data Ops', hint: 'Contracts · heal · lineage', icon: '⇄' },
  { key: 'tokens', label: 'Design Tokens', hint: 'Compiler · themes', icon: '◧' },
];

export default function App() {
  const [active, setActive] = useState<SectionKey>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const Section = {
    overview: Overview,
    governance: Governance,
    quality: QualityFabric,
    tokens: DesignTokens,
    dataops: DataOps,
    gates: GrandGate,
  }[active];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4f3ff,_transparent_45%),radial-gradient(circle_at_bottom_right,_#fff7ed,_transparent_40%)] bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 w-72 shrink-0 transform border-r border-slate-200/70 bg-white/90 px-4 py-6 backdrop-blur-sm transition-transform duration-200 lg:static lg:translate-x-0 motion-reduce:transition-none',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-serif text-base font-bold text-white shadow-sm">
              L
            </div>
            <div>
              <p className="font-serif text-base font-semibold leading-tight text-slate-900">LEADOS</p>
              <p className="text-[11px] leading-tight text-slate-400">Quality &amp; Governance Console</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setActive(item.key);
                  setSidebarOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none',
                  active === item.key
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center text-sm">{item.icon}</span>
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-[11px] text-slate-400">{item.hint}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
            Repo reference:{' '}
            <a
              className="font-medium text-indigo-500 underline decoration-dotted underline-offset-2"
              href="https://github.com/shahramclaude/Leados"
              target="_blank"
              rel="noreferrer"
            >
              shahramclaude/Leados
            </a>
            <p className="mt-1">This console is a standalone front-end demo, not wired to that repository.</p>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden"
          />
        )}

        {/* Main */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/80 px-5 py-3.5 backdrop-blur-sm lg:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              >
                ☰
              </button>
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">LEADOS demo console</p>
                <p className="font-serif text-sm font-semibold text-slate-800">{NAV.find((n) => n.key === active)?.label}</p>
              </div>
            </div>
            <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-700 sm:inline-block">
              Illustrative data — not live measurements
            </span>
          </header>

          <main className="px-5 py-6 lg:px-8 lg:py-8">
            <Section />
          </main>

          <footer className="border-t border-slate-200/70 px-5 py-5 text-xs text-slate-400 lg:px-8">
            Front-end demo of quality-fabric and governed-autonomy concepts · reference repo:{' '}
            <a className="underline" href="https://github.com/shahramclaude/Leados" target="_blank" rel="noreferrer">
              https://github.com/shahramclaude/Leados
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
