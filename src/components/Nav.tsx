import Link from "next/link";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/close", label: "Financial Close" },
  { href: "/procurement", label: "Source-to-Pay" },
  { href: "/itsm", label: "ITSM" },
  { href: "/hse", label: "HSE" },
  { href: "/treasury", label: "Treasury" },
  { href: "/capstone", label: "Capstone" },
];

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="text-base font-semibold tracking-tight text-slate-950">
          LEADOS <span className="text-slate-400">Operations Console</span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
