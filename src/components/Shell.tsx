import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";

export function Shell({ children }: { children: React.ReactNode }) {
  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));
  return (
    <div className="flex min-h-screen">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6">
        <Link href="/" className="block">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">LEADOS</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">Intelligence Console</h1>
        </Link>
        <nav className="mt-6 space-y-6">
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g}</p>
              <ul className="mt-2 space-y-0.5">
                {NAV_ITEMS.filter((i) => i.group === g).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] text-slate-400">{item.part}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 bg-slate-50">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3> : null}
      {children}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "indigo" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-rose-100 text-rose-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function HonestyBadge({ label }: { label: string }) {
  const tone = label === "measured" ? "green" : label === "estimated" ? "indigo" : label === "effect" ? "amber" : "slate";
  return <Badge tone={tone as "green" | "indigo" | "amber" | "slate"}>{label}</Badge>;
}
