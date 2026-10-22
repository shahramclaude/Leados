import Link from "next/link";

export function DecisionsNav({ orgId, orgs, active }: { orgId: string; orgs: { id: string; name: string }[]; active: string }) {
  const tabs = [
    { href: "/decisions", label: "Decision Desk", key: "desk" },
    { href: "/decisions/new", label: "Raise Decision", key: "new" },
    { href: "/decisions/journal", label: "Decision Journal", key: "journal" },
    { href: "/decisions/quality", label: "DQ Trends", key: "quality" },
    { href: "/decisions/debt", label: "Decision Debt", key: "debt" },
    { href: "/decisions/rights", label: "Decision Rights", key: "rights" },
  ];

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${t.href}?org=${orgId}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex items-center gap-2 text-sm text-slate-600">
        <span>Org:</span>
        <select name="org" defaultValue={orgId} className="rounded-lg border border-slate-300 px-2 py-1">
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1 text-white">
          Switch
        </button>
      </form>
    </div>
  );
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "red" | "green" | "blue" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)] ${className}`}>{children}</div>;
}
