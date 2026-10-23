import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Cockpit", icon: "🛰️" },
  { href: "/decisions", label: "Decisions", icon: "🧭" },
  { href: "/signals", label: "Signals", icon: "📡" },
  { href: "/cadence", label: "Cadence", icon: "🔁" },
  { href: "/board", label: "Board", icon: "🏛️" },
  { href: "/risk", label: "Risk & GRC", icon: "🛡️" },
  { href: "/strategy", label: "Strategy", icon: "🎯" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200">
      <div className="px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">Executive OS</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">LEADOS</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-800 px-6 py-4 text-xs text-slate-500">
        Leadership intelligence, in one cockpit.
      </div>
    </aside>
  );
}
