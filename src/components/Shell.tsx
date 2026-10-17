import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export type Route =
  | "today"
  | "decisions"
  | "energy"
  | "memory"
  | "accessibility"
  | "log"
  | "about";

const NAV: { id: Route; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "☀️" },
  { id: "decisions", label: "Decisions (Monte Carlo)", icon: "🎲" },
  { id: "energy", label: "Energy & Fatigue", icon: "🔋" },
  { id: "memory", label: "Memory & Genome", icon: "🧬" },
  { id: "accessibility", label: "Accessibility", icon: "♿" },
  { id: "log", label: "Event Log", icon: "🗒️" },
  { id: "about", label: "About / Provenance", icon: "📋" },
];

export function Shell({
  route,
  onNavigate,
  eventCount,
  workerStatus,
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  eventCount: number;
  workerStatus: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900" data-theme-root>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-0 focus:top-0 focus:z-50 focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <aside className="flex w-64 shrink-0 flex-col bg-slate-950 text-slate-200">
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="text-lg font-bold tracking-tight text-white">LeadOS Lite</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            circadian + fatigue + Monte Carlo decision support
          </div>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-4 text-sm">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              aria-current={route === n.id ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
                route === n.id ? "bg-white text-slate-900 font-medium" : "text-slate-300 hover:bg-slate-900"
              )}
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          n=<span className="font-mono text-slate-300">{eventCount}</span> events logged
          <br />
          worker: <span className="font-mono text-slate-300">{workerStatus}</span>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="font-semibold text-slate-800">
            {NAV.find((n) => n.id === route)?.label}
          </div>
          <div className="text-xs text-slate-400">All data stays in this browser (localStorage). No network calls.</div>
        </header>
        <section id="main" tabIndex={-1} className="mx-auto max-w-6xl p-6">
          {children}
        </section>
      </main>
    </div>
  );
}
