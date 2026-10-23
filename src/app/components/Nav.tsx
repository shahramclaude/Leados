import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/commitments", label: "Commitments" },
  { href: "/delegation", label: "Delegation Map" },
  { href: "/proactive", label: "Proactive Queue" },
  { href: "/loops", label: "Loop Health" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-3">
        <span className="mr-4 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">LEADOS</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
