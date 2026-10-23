import Link from "next/link";
import { NAV_GROUPS } from "@/lib/nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950/80 p-5 lg:block">
        <Link href="/" className="mb-8 flex items-center gap-2 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500 text-lg font-bold text-slate-950">
            L
          </span>
          <div>
            <p className="text-sm font-bold tracking-wide text-white">LEADOS</p>
            <p className="text-[11px] text-slate-500">Executive Intelligence</p>
          </div>
        </Link>
        <nav className="flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-600 group-hover:text-slate-400">
                      {item.part}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-cyan-500 text-sm font-bold text-slate-950">
              L
            </span>
            <span className="text-sm font-bold text-white">LEADOS</span>
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
