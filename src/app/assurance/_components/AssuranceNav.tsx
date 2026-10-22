import Link from "next/link";

const TABS = [
  { href: "/assurance", label: "Console" },
  { href: "/assurance/drift", label: "Drift Trends" },
  { href: "/assurance/blindspots", label: "Blind Spots" },
  { href: "/assurance/features", label: "Feature Safety" },
];

export function AssuranceNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            active === tab.href
              ? "bg-slate-950 text-white"
              : "bg-white text-slate-700 hover:bg-slate-200 border border-slate-200"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    pass: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    breach: "bg-rose-100 text-rose-800",
    error: "bg-slate-200 text-slate-700",
  };
  const label = status ?? "no runs yet";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status ?? ""] ?? "bg-slate-100 text-slate-500"}`}>
      {label}
    </span>
  );
}
