import Link from "next/link";

const LINKS = [
  { href: "/group-consolidation", label: "Group Consolidation" },
  { href: "/entity-compare", label: "Entity Compare" },
  { href: "/fiscal-calendar", label: "Fiscal Calendar Matrix" },
  { href: "/jurisdiction", label: "Jurisdiction View" },
  { href: "/board-pack", label: "Board Pack" },
];

export default function GlobalOpsNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            active === link.href
              ? "bg-slate-950 text-white"
              : "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
