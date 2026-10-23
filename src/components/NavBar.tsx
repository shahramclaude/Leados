import Link from "next/link";

const links = [
  { href: "/", label: "Cockpit" },
  { href: "/decisions", label: "Decisions" },
  { href: "/signals", label: "Signals" },
  { href: "/cadence", label: "Cadence" },
  { href: "/agents", label: "Agents" },
  { href: "/my-state", label: "Leader State" },
];

export default function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-slate-950">
            L
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">LEADOS</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
