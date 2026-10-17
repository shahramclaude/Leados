import type { ReactNode } from "react";

const NAV: { route: string; label: string; group: string }[] = [
  { route: "/today", label: "Today", group: "Overview" },
  { route: "/compound", label: "Compound Intelligence", group: "Overview" },
  { route: "/lifestage", label: "Life Stage", group: "pt-P" },
  { route: "/wargame", label: "Wargame", group: "pt-O" },
  { route: "/orgdesign", label: "Org Design", group: "pt-O" },
  { route: "/stakeholders", label: "Stakeholders", group: "pt-O" },
  { route: "/realoptions", label: "Real Options", group: "pt-O" },
  { route: "/execpresence", label: "Executive Presence", group: "pt-O" },
  { route: "/innovation", label: "Innovation Portfolio", group: "pt-O" },
  { route: "/change", label: "Change Management", group: "pt-O" },
  { route: "/competitive", label: "Competitive Intel", group: "pt-O" },
  { route: "/about", label: "About / Provenance", group: "Meta" },
];

const GROUPS = ["Overview", "pt-P", "pt-O", "Meta"];

export function Shell({ route, navigate, children, onReset }: { route: string; navigate: (r: string) => void; children: ReactNode; onReset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 md:flex">
          <div className="mb-6 flex items-center gap-2 px-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold">L</div>
            <div>
              <div className="text-sm font-semibold leading-tight">LEADOS</div>
              <div className="text-[11px] leading-tight text-slate-400">Organizational Intelligence</div>
            </div>
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto">
            {GROUPS.map((group) => (
              <div key={group}>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
                <div className="space-y-0.5">
                  {NAV.filter((n) => n.group === group).map((n) => (
                    <button
                      key={n.route}
                      onClick={() => navigate(n.route)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                        route === n.route ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <button
            onClick={onReset}
            className="mt-4 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Reset synthetic data
          </button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            <div className="text-sm font-semibold">LEADOS</div>
            <select
              value={route}
              onChange={(e) => navigate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            >
              {NAV.map((n) => (
                <option key={n.route} value={n.route}>
                  {n.label}
                </option>
              ))}
            </select>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
