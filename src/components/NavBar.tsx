import Link from "next/link";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/forecast", label: "Forecast" },
  { href: "/decisions", label: "Decisions" },
  { href: "/knowledge", label: "Knowledge" },
];

export default function NavBar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            L
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-950">LEADOS</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
