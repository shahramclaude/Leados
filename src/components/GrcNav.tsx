import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/risk", label: "Risk Register" },
  { href: "/controls", label: "Control Assurance" },
  { href: "/obligations", label: "Obligation Calendar" },
  { href: "/appetite", label: "Appetite Dashboard" },
  { href: "/board-report", label: "Board Risk Report" },
];

export function GrcNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            active === l.href
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-700 hover:bg-slate-200"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
