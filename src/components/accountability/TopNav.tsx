import Link from "next/link";

const LINKS = [
  { href: "/accountability", label: "Accountability Console" },
  { href: "/accountability/assessments", label: "Impact Assessment Studio" },
  { href: "/accountability/oversight", label: "Oversight Queue" },
  { href: "/accountability/conformity", label: "Conformity Export" },
  { href: "/my-decisions", label: "My Automated Decisions" },
];

export function TopNav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-900">
          LEADOS · Algorithmic Accountability
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-950">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
