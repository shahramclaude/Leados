import Link from "next/link";

const LINKS = [
  { href: "/board", label: "Board Portal" },
  { href: "/governance/dashboard", label: "Governance Dashboard" },
  { href: "/governance/committees/audit", label: "Committees" },
  { href: "/governance/minutes", label: "Minutes & Resolutions" },
  { href: "/governance/access-matrix", label: "Access Matrix" },
  { href: "/governance/whistleblower", label: "Safe Channel" },
];

export function NavBar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-slate-950">
          LEADOS · Board Governance
        </Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-950">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ActorBadgeLink />
        </div>
      </div>
    </header>
  );
}

function ActorBadgeLink() {
  return (
    <Link
      href="/governance/acting-as"
      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-500 hover:text-slate-950"
    >
      Acting-as settings
    </Link>
  );
}
