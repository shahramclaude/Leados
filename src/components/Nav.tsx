import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/decisions", label: "Evidence Ledger" },
  { href: "/knowledge", label: "Knowledge" },
];

export function Nav() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col justify-between border-r border-slate-800 bg-slate-950 px-5 py-6 text-slate-200">
      <div>
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-slate-950">
            L
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">LEADOS</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
              Decision OS
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
        <p className="font-semibold text-slate-200">Founding build</p>
        <p className="mt-1 leading-relaxed">
          Ontology substrate, explainable scoring, and a hash-chained evidence
          ledger — the spine the rest of the program extends.
        </p>
      </div>
    </aside>
  );
}
