import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/capture", label: "Capture" },
  { href: "/events", label: "Event Log" },
  { href: "/findings", label: "Findings" },
  { href: "/decisions", label: "Decisions" },
  { href: "/automation", label: "Automation" },
  { href: "/boardpack", label: "Board Pack" },
  { href: "/styleguide", label: "Styleguide" },
  { href: "/about", label: "About / Self-Test" },
];

export function Nav() {
  return (
    <header
      className="sticky top-0 z-10 border-b px-6 py-3 backdrop-blur"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold" style={{ color: "var(--fg)" }}>
          LEADOS
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
