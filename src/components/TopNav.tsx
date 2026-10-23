import Link from "next/link";

export function TopNav({ crumb }: { crumb?: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            LEADOS
          </Link>
          <span className="text-sm text-slate-400">Development &amp; Coaching</span>
          {crumb ? <span className="text-sm text-slate-400">/ {crumb}</span> : null}
        </div>
        <nav className="flex gap-4 text-sm text-slate-600">
          <Link href="/admin/fairness" className="hover:text-slate-950">
            Fairness report
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PersonTabs({ personId }: { personId: string }) {
  const tabs = [
    { href: `/dashboard/${personId}`, label: "My Growth" },
    { href: `/dashboard/${personId}/one-on-one`, label: "1:1 Space" },
    { href: `/dashboard/${personId}/feedback`, label: "Feedback Flows" },
    { href: `/dashboard/${personId}/coach`, label: "Coach Sessions" },
  ];
  return (
    <div className="mx-auto flex max-w-5xl gap-1 px-6 pt-4">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="rounded-t-lg border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
