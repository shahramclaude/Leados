import type { ReactNode } from "react";

const NAV: { route: string; label: string }[] = [
  { route: "/today", label: "Today" },
  { route: "/signals", label: "Signal Board" },
  { route: "/thermodynamics", label: "Thermodynamics" },
  { route: "/cas", label: "CAS Engine" },
  { route: "/risk", label: "Risk Register" },
  { route: "/about", label: "About / Provenance" },
];

export function Shell({ route, navigate, children }: { route: string; navigate: (r: string) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">L</div>
            <div>
              <div className="text-sm font-semibold text-white leading-tight">Leadership Intelligence Sandbox</div>
              <div className="text-[11px] text-slate-500 leading-tight">Thermodynamics · CAS Engine · Risk Register</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  route === n.route ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 pt-4 text-[11px] text-slate-600">
        All data is synthetic and generated in-browser. Nothing here describes real people. See{" "}
        <button className="underline underline-offset-2 hover:text-slate-400" onClick={() => navigate("/about")}>
          About / Provenance
        </button>{" "}
        for what in this build is verified, original, or a disclosed gap.
      </footer>
    </div>
  );
}
