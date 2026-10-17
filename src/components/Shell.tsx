import type { ReactNode } from "react";

export const ROUTES = [
  { path: "/today", label: "Today" },
  { path: "/signals", label: "Signal Board" },
  { path: "/thermodynamics", label: "Thermodynamics" },
  { path: "/cas", label: "CAS Engine" },
  { path: "/risk", label: "Risk Register" },
  { path: "/about", label: "About / Provenance" },
] as const;

export type Route = (typeof ROUTES)[number]["path"];

export function Shell({ route, navigate, children }: { route: string; navigate: (r: string) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-sm font-bold text-white">
                L
              </div>
              <div>
                <div className="text-sm font-semibold text-white leading-none">LEADOS — Sandbox Build</div>
                <div className="text-[10px] text-slate-500 leading-none mt-0.5">original · not a verified continuation of wbweve/Leados</div>
              </div>
            </div>
            <nav className="flex flex-wrap gap-1">
              {ROUTES.map((r) => (
                <button
                  key={r.path}
                  onClick={() => navigate(r.path)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    route === r.path ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-[11px] text-slate-600">
        No network calls. State in <code className="rounded bg-slate-800 px-1 py-0.5">localStorage</code> under{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">leados-sandbox:v1</code>. See About / Provenance for what is
        verified vs. unverified vs. original.
      </footer>
    </div>
  );
}
