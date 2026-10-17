import type { ReactNode } from "react";
import type { Route } from "./CommandPalette";

const NAV: { route: Route; label: string }[] = [
  { route: "today", label: "Today" },
  { route: "domains", label: "Domains" },
  { route: "synthesis", label: "Synthesis" },
  { route: "lab", label: "Lab" },
  { route: "health", label: "Health" },
  { route: "about", label: "About" },
  { route: "log", label: "Log" },
];

export function Shell({
  route,
  navigate,
  onOpenPalette,
  children,
}: {
  route: Route;
  navigate: (r: Route) => void;
  onOpenPalette: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-zinc-800 px-4 py-6 sm:flex">
          <div className="mb-8">
            <div className="font-mono text-sm font-semibold tracking-tight text-emerald-400">LEADOS</div>
            <div className="text-[11px] leading-tight text-zinc-500">Intelligence Synthesis · unofficial sandbox build</div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`rounded-md px-3 py-2 text-left text-sm transition ${
                  route === n.route ? "bg-emerald-500/10 font-medium text-emerald-400" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                #/{n.label.toLowerCase()}
              </button>
            ))}
          </nav>
          <button
            onClick={onOpenPalette}
            className="mt-auto flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          >
            <span>Command palette</span>
            <kbd className="rounded border border-zinc-700 px-1 py-0.5 font-mono">/</kbd>
          </button>
        </aside>
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
          <div className="mb-4 flex items-center justify-between sm:hidden">
            <div className="font-mono text-sm font-semibold text-emerald-400">LEADOS</div>
            <button onClick={onOpenPalette} className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-400">
              / menu
            </button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Pill({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "emerald" | "amber" | "red" }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-800 text-zinc-300",
    emerald: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-red-500/15 text-red-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
