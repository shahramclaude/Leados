import Link from "next/link";
import { MODULES } from "@/lib/leados/modules";

const GROUPS = ["Strategic Frontier", "AI-Native Organization", "Program Gate"] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-5">
          <Link href="/" className="block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">LEADOS</p>
            <p className="mt-1 text-sm text-slate-600">Pack 4 — Strategic Frontier &amp; AI-Native Organization</p>
          </Link>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
              <ul className="mt-2 space-y-0.5">
                {MODULES.filter((m) => m.group === group).map((m) => (
                  <li key={m.slug}>
                    <Link
                      href={`/${m.slug}`}
                      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <span className="w-8 shrink-0 text-[11px] font-semibold text-slate-400">#{m.part}</span>
                      <span>{m.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 lg:hidden">
          <Link href="/" className="text-sm font-semibold text-indigo-600">
            LEADOS
          </Link>
          <Link href="/capstone" className="text-xs text-slate-500">
            Capstone V
          </Link>
        </header>
        <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
