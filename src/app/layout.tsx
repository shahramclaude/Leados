import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADOS — Knowledge, Memory & the Learning Loop",
  description: "The organization's durable brain: knowledge graph, institutional memory, hypotheses, playbooks, search and synthesis.",
};

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/knowledge", label: "Knowledge Graph" },
  { href: "/memory", label: "Memory" },
  { href: "/hypotheses", label: "Hypotheses" },
  { href: "/playbooks", label: "Playbooks" },
  { href: "/search", label: "Search" },
  { href: "/docs", label: "Whitepaper" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-950">
              LEADOS
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition-colors hover:text-slate-950">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </body>
    </html>
  );
}
